import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { User } from './models.js';

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

export async function attachUser(req, _res, next) {
  const userId = req.session?.userId;
  if (!userId) {
    req.currentUser = null;
    return next();
  }
  req.currentUser = await User.findById(userId).lean();
  next();
}

export function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user._id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    department: user.department ?? null,
  };
}

export async function registerUser({ email, password, displayName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw new Error('Email already in use');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    _id: randomUUID(),
    email: normalizedEmail,
    displayName: displayName?.trim() || normalizedEmail.split('@')[0],
    passwordHash,
  });
  return user;
}

export async function loginUser({ email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new Error('Invalid email or password');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error('Invalid email or password');
  return user;
}
