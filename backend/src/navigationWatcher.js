import mongoose from 'mongoose';

const NAVIGATION_COLLECTIONS = ['workspaces', 'spaces', 'lists', 'userroles', 'workspacemembers'];
const POLL_INTERVAL_MS = 3000;

async function readNavigationVersion() {
  const parts = [];
  for (const name of NAVIGATION_COLLECTIONS) {
    const collection = mongoose.connection.collection(name);
    const [count, latest] = await Promise.all([
      collection.countDocuments({}),
      collection
        .find({})
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
        .limit(1)
        .project({ updatedAt: 1, createdAt: 1, _id: 1 })
        .next(),
    ]);
    const marker = latest?.updatedAt || latest?.createdAt || latest?._id || '';
    parts.push(`${name}:${count}:${String(marker)}`);
  }
  return parts.join('|');
}

export function startNavigationWatcher({ realtime } = {}) {
  if (!realtime?.broadcast) return () => {};

  const streams = [];
  let debounceTimer = null;
  let pollTimer = null;
  let lastVersion = null;
  let pollInFlight = false;

  const broadcastRefresh = (collectionName) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      realtime.broadcast('navigation:changed', {
        type: 'database:changed',
        collection: collectionName,
        at: new Date().toISOString(),
      });
    }, 250);
  };

  const pollForChanges = async () => {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      const nextVersion = await readNavigationVersion();
      if (lastVersion === null) {
        lastVersion = nextVersion;
      } else if (nextVersion !== lastVersion) {
        lastVersion = nextVersion;
        broadcastRefresh('poll');
      }
    } catch (error) {
      console.warn('[navigation] Polling failed:', error?.message || error);
    } finally {
      pollInFlight = false;
    }
  };

  for (const name of NAVIGATION_COLLECTIONS) {
    try {
      const stream = mongoose.connection.collection(name).watch(
        [
          {
            $match: {
              operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
            },
          },
        ],
        { fullDocument: 'default' },
      );
      stream.on('change', () => broadcastRefresh(name));
      stream.on('error', (error) => {
        console.warn(`[navigation] Mongo change stream failed for ${name}:`, error?.message || error);
      });
      streams.push(stream);
    } catch (error) {
      console.warn(`[navigation] Unable to watch ${name}:`, error?.message || error);
    }
  }

  pollForChanges();
  pollTimer = setInterval(pollForChanges, POLL_INTERVAL_MS);
  console.log(`[navigation] live sync watching ${NAVIGATION_COLLECTIONS.join(', ')}`);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (pollTimer) clearInterval(pollTimer);
    for (const stream of streams) {
      stream.close().catch(() => {});
    }
  };
}
