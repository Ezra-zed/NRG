import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import AuthSession from '../models/AuthSession.model.js';
import User from '../models/User.model.js';
import {
  clearAuthCookies,
  createAuthSession,
  refreshAuthSession,
  revokeAuthSession,
} from '../utils/authSession.js';
import { REFRESH_COOKIE, SESSION_COOKIE } from '../utils/cookies.js';
import { verifyToken } from '../utils/jwt.js';
import { cookieOptions, refreshCookieOptions } from '../utils/oauthState.js';
import { getCurrentUser } from '../controllers/auth/googleOAuth.controller.js';
import { signup } from '../controllers/auth/signup.controller.js';

process.env.JWT_SECRET = 'session-test-secret-with-enough-entropy';

const hash = (value) => createHash('sha256').update(value).digest('hex');

test('production cookies enforce Secure, HttpOnly, SameSite=None, and matching paths', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const access = cookieOptions(15 * 60 * 1000);
    const refresh = refreshCookieOptions(30 * 24 * 60 * 60 * 1000);
    const clearedAccess = cookieOptions();
    const clearedRefresh = refreshCookieOptions();

    for (const options of [access, refresh, clearedAccess, clearedRefresh]) {
      assert.equal(options.httpOnly, true);
      assert.equal(options.secure, true);
      assert.equal(options.sameSite, 'none');
      assert.equal(options.path, '/');
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('signup returns a bearer session that GET /auth/me can restore when cookies are unavailable', async () => {
  const originalSessionFindOne = AuthSession.findOne;
  const originalSessionCreate = AuthSession.create;
  const originalUserFindOne = User.findOne;
  const originalUserFindById = User.findById;
  const originalUserCreate = User.create;
  const userId = '507f1f77bcf86cd799439011';
  const user = { _id: { toString: () => userId }, id: userId, name: 'Customer', email: 'customer@example.com', role: 'user' };
  let authSession;
  let signupBody;
  let nextError;
  const signupCookies = [];
  const signupRes = {
    set: () => signupRes,
    cookie: (name, value, options) => signupCookies.push({ name, value, options }),
    status: (status) => { signupRes.statusCode = status; return signupRes; },
    json: (value) => { signupBody = value; return signupRes; },
  };
  const meRes = {
    set: () => meRes,
    vary: () => meRes,
    json: (value) => { meRes.body = value; return meRes; },
  };

  User.findOne = async () => null;
  User.create = async () => user;
  AuthSession.create = async (session) => { authSession = session; return session; };
  AuthSession.findOne = (query) => ({
    select: () => ({ lean: async () => query._id === authSession?._id && query.userId === userId && query.revokedAt === null ? authSession : null }),
  });
  User.findById = (id) => ({ select: async () => id === userId ? user : null });

  try {
    await signup({ body: { role: 'user', name: 'Customer', email: 'customer@example.com', phone: '+15555550123', password: 'safe-password', acceptPolicies: true } }, signupRes);
    const token = signupBody?.data?.token;
    assert.equal(signupBody?.success, true);
    assert.equal(signupBody?.data?.user?.role, 'user');
    assert.ok(token);
    assert.ok(signupCookies.some(({ name, value }) => name === SESSION_COOKIE && value === token));

    await getCurrentUser({ headers: { authorization: `Bearer ${token}`, cookie: '' } }, meRes, (error) => { nextError = error; });
    assert.equal(nextError, undefined);
    assert.equal(meRes.body?.success, true);
    assert.equal(meRes.body?.data?.user?.id, userId);
    assert.equal(meRes.body?.data?.user?.role, 'user');
  } finally {
    AuthSession.findOne = originalSessionFindOne;
    AuthSession.create = originalSessionCreate;
    User.findOne = originalUserFindOne;
    User.findById = originalUserFindById;
    User.create = originalUserCreate;
  }
});

test('access-token signing failure does not leave an orphan auth session', async () => {
  const originalCreate = AuthSession.create;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  let created = false;
  AuthSession.create = async () => {
    created = true;
  };
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'too-short';

  try {
    await assert.rejects(
      createAuthSession({ _id: { toString: () => 'user-id' }, role: 'user' }, {}),
      /at least 32 characters/,
    );
    assert.equal(created, false);
  } finally {
    AuthSession.create = originalCreate;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('refresh tokens rotate once and reuse revokes the session', async () => {
  const original = {
    create: AuthSession.create,
    findOne: AuthSession.findOne,
    findOneAndUpdate: AuthSession.findOneAndUpdate,
    findById: AuthSession.findById,
    updateOne: AuthSession.updateOne,
    userFindById: User.findById,
  };
  const user = { _id: { toString: () => 'user-id' }, role: 'user' };
  let storedSession;
  const cookies = [];
  const res = {
    set: () => res,
    cookie: (name, value, options) => cookies.push({ name, value, options }),
    clearCookie: (name, options) => cookies.push({ name, cleared: true, options }),
  };

  AuthSession.create = async (session) => {
    storedSession = { ...session, revokedAt: null };
    return storedSession;
  };
  AuthSession.findOne = (query) => ({
    lean: async () => (
      query._id === storedSession?._id
      && query.refreshTokenHash === storedSession.refreshTokenHash
      && !storedSession.revokedAt
      && storedSession.expiresAt > query.expiresAt.$gt
      ? { ...storedSession }
      : null
    ),
  });
  AuthSession.findOneAndUpdate = async (query, update) => {
    if (
      query._id !== storedSession._id
      || query.refreshTokenHash !== storedSession.refreshTokenHash
      || storedSession.revokedAt
      || storedSession.expiresAt <= query.expiresAt.$gt
    ) return null;
    Object.assign(storedSession, update.$set);
    for (const [key, value] of Object.entries(update.$addToSet || {})) {
      storedSession[key] = [...(storedSession[key] || []), value];
    }
    return { ...storedSession };
  };
  AuthSession.findById = async () => storedSession;
  AuthSession.updateOne = async (_query, update) => {
    Object.assign(storedSession, update.$set);
  };
  User.findById = async () => user;

  try {
    const firstAccess = await createAuthSession(user, res);
    const accessClaims = verifyToken(firstAccess);
    const firstRefresh = cookies.find((cookie) => cookie.name === REFRESH_COOKIE).value;
    assert.equal(accessClaims.typ, 'access');
    assert.equal(cookies.find((cookie) => cookie.name === SESSION_COOKIE).value, firstAccess);
    const accessCookieOptions = cookies.find((cookie) => cookie.name === SESSION_COOKIE).options;
    const refreshCookieOptions = cookies.find((cookie) => cookie.name === REFRESH_COOKIE).options;
    assert.equal(accessCookieOptions.httpOnly, true);
    assert.equal(accessCookieOptions.maxAge, 15 * 60 * 1000);
    assert.equal(refreshCookieOptions.httpOnly, true);
    assert.equal(refreshCookieOptions.maxAge, 30 * 24 * 60 * 60 * 1000);
    assert.equal(accessCookieOptions.secure, process.env.NODE_ENV === 'production');
    assert.equal(
      accessCookieOptions.sameSite,
      process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    );
    clearAuthCookies(res);
    for (const name of [SESSION_COOKIE, REFRESH_COOKIE]) {
      const issuedOptions = cookies.find((cookie) => cookie.name === name).options;
      const clearedOptions = cookies.find((cookie) => cookie.name === name && cookie.cleared).options;
      for (const attribute of ['httpOnly', 'secure', 'sameSite', 'path']) {
        assert.equal(clearedOptions[attribute], issuedOptions[attribute]);
      }
    }

    const rotatedAccess = await refreshAuthSession(
      { headers: { cookie: `${REFRESH_COOKIE}=${firstRefresh}` } },
      res,
    );
    const rotatedClaims = verifyToken(rotatedAccess);
    const secondRefresh = cookies.filter((cookie) => cookie.name === REFRESH_COOKIE).at(-1).value;
    const rotatedRefreshAge = cookies.filter((cookie) => cookie.name === REFRESH_COOKIE).at(-1).options.maxAge;
    assert.equal(rotatedClaims.sid, accessClaims.sid);
    assert.notEqual(secondRefresh, firstRefresh);
    assert.ok(rotatedRefreshAge > 0 && rotatedRefreshAge <= 30 * 24 * 60 * 60 * 1000);
    assert.deepEqual(storedSession.usedRefreshTokenHashes, [hash(firstRefresh.split('.')[1])]);

    await assert.rejects(
      refreshAuthSession(
        { headers: { cookie: `${REFRESH_COOKIE}=${firstRefresh}` } },
        res,
      ),
      /already used/,
    );
    assert.ok(storedSession.revokedAt instanceof Date);
  } finally {
    AuthSession.create = original.create;
    AuthSession.findOne = original.findOne;
    AuthSession.findOneAndUpdate = original.findOneAndUpdate;
    AuthSession.findById = original.findById;
    AuthSession.updateOne = original.updateOne;
    User.findById = original.userFindById;
  }
});

test('logout revokes a session with a valid refresh cookie and clears both cookies', async () => {
  const originalFindOne = AuthSession.findOne;
  const originalUpdateOne = AuthSession.updateOne;
  const sessionId = '0123456789abcdef0123456789abcdef';
  const refreshSecret = Buffer.alloc(32, 1).toString('base64url');
  const updates = [];
  const cleared = [];
  AuthSession.findOne = (query) => ({
    select() {
      return {
        lean: async () => {
          assert.equal(query._id, sessionId);
          assert.equal(query.$or[0].refreshTokenHash, hash(refreshSecret));
          return { _id: sessionId };
        },
      };
    },
  });
  AuthSession.updateOne = async (query, update) => updates.push({ query, update });
  const res = {
    set: () => res,
    clearCookie: (name) => cleared.push(name),
  };

  try {
    await revokeAuthSession(
      { headers: { cookie: `${REFRESH_COOKIE}=${sessionId}.${refreshSecret}` } },
      res,
    );
    assert.equal(updates[0].query._id, sessionId);
    assert.ok(updates[0].update.$set.revokedAt instanceof Date);
    assert.deepEqual(cleared.sort(), [REFRESH_COOKIE, SESSION_COOKIE].sort());
  } finally {
    AuthSession.findOne = originalFindOne;
    AuthSession.updateOne = originalUpdateOne;
  }
});
