import mongoose from 'mongoose';
import dns from 'node:dns';

let connected = false;

/**
 * Some networks (corporate proxies, home routers, ISPs) silently refuse DNS
 * SRV queries, which breaks `mongodb+srv://` URIs. Force the Node resolver
 * to use public DNS (Cloudflare + Google) so the packaged desktop app keeps
 * working across different user networks.
 */
function configurePublicDns() {
  try {
    dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);
    if (typeof dns.setDefaultResultOrder === 'function') {
      dns.setDefaultResultOrder('ipv4first');
    }
  } catch {
    // best-effort; if we can't override, Node falls back to OS resolver
  }
}

export async function connectMongo() {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  configurePublicDns();

  const opts = {
    serverSelectionTimeoutMS: 20000,
    socketTimeoutMS: 45000,
  };

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await mongoose.connect(uri, opts);
      connected = true;
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[db] MongoDB connect attempt ${attempt} failed:`, err?.code || err?.message || err);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}
