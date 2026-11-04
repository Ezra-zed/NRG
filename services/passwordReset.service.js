import { createHash, randomBytes } from 'node:crypto';
import AuthSession from '../models/AuthSession.model.js';
import PasswordResetToken from '../models/PasswordResetToken.model.js';
import User from '../models/User.model.js';
import AppError from '../utils/AppError.js';
import { sendPasswordResetEmail } from './email.service.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const INVALID_RESET_TOKEN = 'This password reset link is invalid or has expired.';

export const hashPasswordResetToken = (token) => createHash('sha256').update(token).digest('hex');

export const requestPasswordReset = async (
  { email },
  {
    userModel = User,
    tokenModel = PasswordResetToken,
    sendEmail = sendPasswordResetEmail,
    now = () => new Date(),
    generateToken = () => randomBytes(32).toString('hex'),
  } = {},
) => {
  const user = await userModel.findOne({ email }).select('+password');
  if (!user || user.authProvider !== 'JWT-auth' || !user.password) return;

  const token = generateToken();
  const expiresAt = new Date(now().getTime() + RESET_TOKEN_TTL_MS);
  await tokenModel.findOneAndUpdate(
    { userId: user._id },
    { $set: { tokenHash: hashPasswordResetToken(token), expiresAt } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await sendEmail({ to: user.email, token });
};

export const resetPassword = async (
  { token, password },
  {
    userModel = User,
    tokenModel = PasswordResetToken,
    sessionModel = AuthSession,
    now = () => new Date(),
  } = {},
) => {
  const usedAt = now();
  const resetGrant = await tokenModel.findOneAndDelete({
    tokenHash: hashPasswordResetToken(token),
    expiresAt: { $gt: usedAt },
  });
  if (!resetGrant) throw new AppError(INVALID_RESET_TOKEN, 400, true, 'INVALID_PASSWORD_RESET_TOKEN');

  const user = await userModel.findById(resetGrant.userId).select('+password');
  if (!user || user.authProvider !== 'JWT-auth' || !user.password) {
    throw new AppError(INVALID_RESET_TOKEN, 400, true, 'INVALID_PASSWORD_RESET_TOKEN');
  }

  user.password = password;
  await user.save();
  await sessionModel.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: usedAt } },
  );
};
