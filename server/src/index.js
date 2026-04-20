import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { connectMongo } from './db.js';
import { buildRoutes } from './routes.js';
import { startReminderScheduler } from './reminderScheduler.js';

dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:8080';
const ALLOWED_ORIGINS = new Set([ORIGIN, 'http://localhost:8080', 'http://localhost:8081']);
const LOCALHOST_ORIGIN_REGEX = /^http:\/\/localhost:\d+$/;

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
app.use(
  session({
    name: 'collab.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use('/api', buildRoutes());

app.use((err, _req, res, _next) => {
  const status = Number(err?.status || err?.statusCode || 500);
  if (status === 413) {
    return res.status(413).json({ message: 'Payload too large. Please upload a smaller file.' });
  }
  return res.status(status).json({ message: err?.message || 'Internal server error' });
});

connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
    startReminderScheduler();
  })
  .catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
