import { createHash, randomBytes } from 'node:crypto';
import AuthSession from '../models/AuthSession.model.js';
import User from '../models/User.model.js';
import AppError from './AppError.js';
import { REFRESH_COOKIE, SESSION_COOKIE, parseCookies } from './cookies.js';
import { generateToken, verifyToken } from './jwt.js';
import { cookieOptions, refreshCookieOptions } from './oauthState.js';
import { randomBytes as generateRandomBytes } from 'node:crypto';
import NativeAuthToken from '../models/NativeAuthToken.model.js';
import { STATE_MAX_AGE_MS } from './oauthState.js';
import { publicUser } from './publicUser.js';

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

/** Create a bearer session for a native client. The caller must keep the
 * opaque refresh token in the platform secure credential store. */
export const createNativeAuthSession = async (user) => {
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

  return { accessToken, refreshToken, sessionId };
};

export const createAuthSessionForClient = async (user, res, native = false) => {
  if (!native) return { token: await createAuthSession(user, res) };
  const { accessToken, refreshToken } = await createNativeAuthSession(user);
  return { token: accessToken, refreshToken };
};

export const refreshAuthSession = async (req, res) => {
  const presented = parseRefreshToken(req.headers.cookie);
  if (!presented) {
    clearAuthCookies(res);
    throw new AppError('Refresh token is missing or invalid.', 401);
  }

  return (await rotateAuthRefreshToken(presented, res)).token;
};

const parseRefreshToken = (cookieHeader = '') => {
  const value = parseCookies(cookieHeader)[REFRESH_COOKIE];
  return parseRefreshTokenValue(value);
};

const parseRefreshTokenValue = (value) => {
  if (!value || typeof value !== 'string') return null;
  const separator = value.indexOf('.');
  if (separator !== 32) return null;
  const sessionId = value.slice(0, separator);
  const secret = value.slice(separator + 1);
  if (!/^[a-f0-9]{32}$/.test(sessionId) || !/^[A-Za-z0-9_-]{40,}$/.test(secret)) return null;
  return { sessionId, secret };
};

const rotateAuthRefreshToken = async (presented, res) => {
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
    if (res) clearAuthCookies(res);
    throw new AppError('Refresh token is invalid, expired, or already used.', 401);
  }

  const user = await User.findById(session.userId);
  if (!user) {
    await AuthSession.updateOne({ _id: session._id, revokedAt: null }, { $set: { revokedAt: now } });
    if (res) clearAuthCookies(res);
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
    if (res) clearAuthCookies(res);
    throw new AppError('Refresh token is invalid, expired, or already used.', 401);
  }

  const refreshMaxAge = Math.max(0, rotatedSession.expiresAt.getTime() - Date.now());
  const refreshToken = `${rotatedSession._id}.${newSecret}`;
  if (res) setAuthCookies(res, accessToken, refreshToken, refreshMaxAge);
  return { token: accessToken, refreshToken };
};

/** Rotate a refresh token presented by a native client in a JSON request. */
export const refreshNativeAuthSession = async (refreshToken) => {
  const presented = parseRefreshTokenValue(refreshToken);
  if (!presented) throw new AppError('Refresh token is missing or invalid.', 401);
  return rotateAuthRefreshToken(presented, null);
};

/** Consume a short-lived Google callback code and mint native credentials. */
export const exchangeNativeAuthCode = async (code) => {
  if (typeof code !== 'string' || code.length < 32 || code.length > 200) {
    throw new AppError('Authorization code is missing or invalid.', 401);
  }
  const digest = createHash('sha256').update(code).digest('hex');
  const grant = await NativeAuthToken.findOneAndDelete({
    codeHash: digest,
    purpose: 'exchange',
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!grant) throw new AppError('Authorization code is invalid or expired.', 401);

  const session = await AuthSession.findOne({
    _id: grant.sessionId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) throw new AppError('Authorization session is no longer active.', 401);

  const user = await User.findById(session.userId).select('-password');
  if (!user) throw new AppError('User account not found.', 401);

  const secret = generateRandomBytes(32).toString('base64url');
  const refreshToken = `${session._id}.${secret}`;
  const token = issueAccessToken(user, session._id);
  const updated = await AuthSession.findOneAndUpdate(
    { _id: session._id, refreshTokenHash: session.refreshTokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { refreshTokenHash: hashRefreshSecret(secret) }, $addToSet: { usedRefreshTokenHashes: session.refreshTokenHash } },
    { new: true },
  );
  if (!updated) throw new AppError('Authorization session is no longer active.', 401);
  return { user: publicUser(user), token, refreshToken };
};

export const createNativeOAuthState = async (acceptPolicies) => {
  const state = generateRandomBytes(32).toString('base64url');
  await NativeAuthToken.create({
    codeHash: createHash('sha256').update(state).digest('hex'),
    purpose: 'state',
    acceptPolicies: acceptPolicies === true,
    expiresAt: new Date(Date.now() + STATE_MAX_AGE_MS),
  });
  return state;
};

export const consumeNativeOAuthState = async (state) => {
  if (typeof state !== 'string' || state.length < 32 || state.length > 200) return null;
  const digest = createHash('sha256').update(state).digest('hex');
  return NativeAuthToken.findOneAndDelete({
    codeHash: digest,
    purpose: 'state',
    expiresAt: { $gt: new Date() },
  }).lean();
};

export const createNativeOAuthExchangeCode = async (sessionId) => {
  const code = generateRandomBytes(32).toString('base64url');
  await NativeAuthToken.create({
    codeHash: createHash('sha256').update(code).digest('hex'),
    purpose: 'exchange',
    sessionId,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return code;
};

export const revokeAuthSession = async (req, res, nativeRefreshToken) => {
  const refresh = parseRefreshTokenValue(nativeRefreshToken) || parseRefreshToken(req.headers.cookie);
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

export const revokeNativeAuthSession = async (refreshToken) => {
  const refresh = parseRefreshTokenValue(refreshToken);
  if (!refresh) return;
  const refreshHash = hashRefreshSecret(refresh.secret);
  const session = await AuthSession.findOne({
    _id: refresh.sessionId,
    revokedAt: null,
    $or: [{ refreshTokenHash: refreshHash }, { usedRefreshTokenHashes: refreshHash }],
  }).select('_id').lean();
  if (session) {
    await AuthSession.updateOne({ _id: session._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
};
