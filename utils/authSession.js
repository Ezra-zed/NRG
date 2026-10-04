import { createHash, randomBytes } from 'node:crypto';
import AuthSession from '../models/AuthSession.model.js';
import User from '../models/User.model.js';
import AppError from './AppError.js';
import { REFRESH_COOKIE, SESSION_COOKIE, parseCookies } from './cookies.js';
import { generateToken, verifyToken } from './jwt.js';
import { cookieOptions, refreshCookieOptions } from './oauthState.js';

export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const hashRefreshSecret = (secret) => createHash('sha256').update(secret).digest('hex');
const preventCaching = (res) => res.set('Cache-Control', 'no-store');

const issueAccessToken = (user, sessionId) => generateToken({
  id: user._id.toString(),
  role: user.role,
  sid: sessionId,
  typ: 'access',
});

const setAuthCookies = (
  res,
  accessToken,
  refreshToken,
  refreshMaxAge = REFRESH_TOKEN_MAX_AGE_MS,
) => {
  preventCaching(res);
  res.cookie(SESSION_COOKIE, accessToken, cookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshMaxAge));
};

const revokeIfRefreshTokenReused = async (sessionId, refreshHash, now) => {
  const existing = await AuthSession.findById(sessionId);
  if (existing && !existing.revokedAt && existing.usedRefreshTokenHashes?.includes(refreshHash)) {
    await AuthSession.updateOne(
      { _id: existing._id, usedRefreshTokenHashes: refreshHash, revokedAt: null },
      { $set: { revokedAt: now } },
    );
  }
};

export const clearAuthCookies = (res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
};

export const createAuthSession = async (user, res) => {
  const sessionId = randomBytes(16).toString('hex');
  const refreshSecret = randomBytes(32).toString('base64url');
  const refreshToken = `${sessionId}.${refreshSecret}`;
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
  const accessToken = issueAccessToken(user, sessionId);

  await AuthSession.create({
    _id: sessionId,
    userId: user._id,
    refreshTokenHash: hashRefreshSecret(refreshSecret),
    expiresAt,
  });

  setAuthCookies(res, accessToken, refreshToken);
  return accessToken;
};

const parseRefreshToken = (req) => {
  const value = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
  if (!value) return null;
  const separator = value.indexOf('.');
  if (separator !== 32) return null;
  const sessionId = value.slice(0, separator);
  const secret = value.slice(separator + 1);
  if (!/^[a-f0-9]{32}$/.test(sessionId) || !/^[A-Za-z0-9_-]{40,}$/.test(secret)) return null;
  return { sessionId, secret };
};

export const refreshAuthSession = async (req, res) => {
  const presented = parseRefreshToken(req);
  if (!presented) {
    clearAuthCookies(res);
    throw new AppError('Refresh token is missing or invalid.', 401);
  }

  const oldHash = hashRefreshSecret(presented.secret);
  const newSecret = randomBytes(32).toString('base64url');
  const newHash = hashRefreshSecret(newSecret);
  const now = new Date();
  const session = await AuthSession.findOne(
    {
      _id: presented.sessionId,
      refreshTokenHash: oldHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
  ).lean();

  if (!session) {
    await revokeIfRefreshTokenReused(presented.sessionId, oldHash, now);
    clearAuthCookies(res);
    throw new AppError('Refresh token is invalid, expired, or already used.', 401);
  }

  const user = await User.findById(session.userId);
  if (!user) {
    await AuthSession.updateOne({ _id: session._id, revokedAt: null }, { $set: { revokedAt: now } });
    clearAuthCookies(res);
    throw new AppError('User account not found.', 401);
  }

  const accessToken = issueAccessToken(user, session._id);
  const rotatedSession = await AuthSession.findOneAndUpdate(
    {
      _id: session._id,
      refreshTokenHash: oldHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: { refreshTokenHash: newHash },
      $addToSet: { usedRefreshTokenHashes: oldHash },
    },
    { new: true },
  );
  if (!rotatedSession) {
    await revokeIfRefreshTokenReused(session._id, oldHash, new Date());
    clearAuthCookies(res);
    throw new AppError('Refresh token is invalid, expired, or already used.', 401);
  }

  const refreshMaxAge = Math.max(0, rotatedSession.expiresAt.getTime() - Date.now());
  setAuthCookies(res, accessToken, `${rotatedSession._id}.${newSecret}`, refreshMaxAge);
  return accessToken;
};

export const revokeAuthSession = async (req, res) => {
  const refresh = parseRefreshToken(req);
  let sessionId;

  if (refresh) {
    const refreshHash = hashRefreshSecret(refresh.secret);
    const activeSession = await AuthSession.findOne({
      _id: refresh.sessionId,
      revokedAt: null,
      $or: [
        { refreshTokenHash: refreshHash },
        { usedRefreshTokenHashes: refreshHash },
      ],
    }).select('_id').lean();
    if (activeSession) sessionId = activeSession._id;
  }

  if (!sessionId) {
    const accessCookie = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    for (const accessToken of [accessCookie, bearer]) {
      if (!accessToken) continue;
      try {
        const decoded = verifyToken(accessToken);
        if (decoded.typ === 'access' && typeof decoded.sid === 'string') {
          sessionId = decoded.sid;
          break;
        }
      } catch {
        // Try the alternate credential; the session can still be cleared locally.
      }
    }
  }

  if (sessionId) {
    await AuthSession.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
  clearAuthCookies(res);
};
