import dotenv from 'dotenv';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'node:path';
import fs from 'node:fs';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';
import { connectMongo } from './db.js';
import { buildRoutes } from './routes.js';
import { startReminderScheduler } from './reminderScheduler.js';
import { startOverdueScheduler } from './overdueScheduler.js';
import { createRealtime } from './realtime.js';
import { startNavigationWatcher } from './navigationWatcher.js';

dotenv.config({ path: '../.env' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4000);
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:8080';
const ALLOWED_ORIGINS = new Set([ORIGIN, 'http://localhost:8080', 'http://localhost:8081']);
const LOCALHOST_ORIGIN_REGEX = /^http:\/\/localhost:\d+$/;

try {
  dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // best-effort DNS fallback for packaged desktop builds
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.has(origin) || LOCALHOST_ORIGIN_REGEX.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

// Extracted so both the Express request pipeline AND the Socket.IO handshake
// can share exactly the same session store/cookie.
const sessionMaxAgeMs =
  Number(process.env.SESSION_MAX_AGE_DAYS || 365) * 24 * 60 * 60 * 1000;
const sessionMiddleware = session({
  name: 'collab.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: Math.floor(sessionMaxAgeMs / 1000),
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: sessionMaxAgeMs,
  },
});
app.use(sessionMiddleware);

const httpServer = http.createServer(app);
const realtime = createRealtime(httpServer, {
  sessionMiddleware,
  corsOrigin: ORIGIN,
});

app.use('/api', buildRoutes({ realtime }));

/**
 * When STATIC_DIR is provided (set by the Electron main process for packaged
 * builds), serve the bundled frontend from the same origin as the API. This
 * keeps session cookies + CORS straightforward since the browser treats the
 * whole app as same-origin instead of trying to fetch cross-origin from file://.
 */
const staticDir = process.env.STATIC_DIR;
if (staticDir && fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
  console.log(`[server] serving static from ${staticDir}`);
}

app.use((err, _req, res, _next) => {
  const status = Number(err?.status || err?.statusCode || 500);
  if (status === 413) {
    return res.status(413).json({ message: 'Payload too large. Please upload a smaller file.' });
  }
  return res.status(status).json({ message: err?.message || 'Internal server error' });
});

connectMongo()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
      console.log(`Socket.IO ready on ws://localhost:${PORT}/socket.io`);
    });
    startReminderScheduler({ realtime });
    startOverdueScheduler({ realtime });
    startNavigationWatcher({ realtime });
  })
  .catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
