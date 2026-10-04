import assert from 'node:assert/strict';
import test from 'node:test';
import AuthSession from '../models/AuthSession.model.js';
import User from '../models/User.model.js';
import authenticate from '../middlewares/auth.middleware.js';
import { extractToken } from '../utils/cookies.js';
import { generateToken } from '../utils/jwt.js';

process.env.JWT_SECRET = 'auth-middleware-test-secret-with-entropy';

test('authentication accepts only access tokens with active server sessions', async () => {
  const originalSessionFindOne = AuthSession.findOne;
  const originalUserFindById = User.findById;
  let active = true;
  AuthSession.findOne = (query) => ({
    select() {
      return {
        lean: async () => {
          assert.equal(query.revokedAt, null);
          assert.ok(query.expiresAt.$gt instanceof Date);
          return active ? { _id: query._id } : null;
        },
      };
    },
  });

  test('explicit bearer tokens take precedence over stale browser access cookies', () => {
    const req = {
      headers: {
        authorization: 'Bearer fresh-access-token',
        cookie: 'nrg_session=expired-access-token',
      },
    };
    assert.equal(extractToken(req), 'fresh-access-token');
  });
  User.findById = () => ({
    select() {
      return { lean: async () => ({ _id: 'user-1', role: 'user', name: 'Customer' }) };
    },
  });

  const req = {
    headers: {
      authorization: `Bearer ${generateToken({
        id: 'user-1',
        role: 'user',
        sid: 'session-1',
        typ: 'access',
      })}`,
    },
  };

  try {
    const firstError = await new Promise((resolve) => authenticate(req, {}, resolve));
    assert.equal(firstError, undefined);
    assert.equal(req.user.name, 'Customer');

    active = false;
    const revokedError = await new Promise((resolve) => authenticate(
      {
        headers: {
          authorization: `Bearer ${generateToken({
            id: 'user-1',
            role: 'user',
            sid: 'session-1',
            typ: 'access',
          })}`,
        },
      },
      {},
      resolve,
    ));
    assert.equal(revokedError.statusCode, 401);

    const refreshTypeError = await new Promise((resolve) => authenticate(
      {
        headers: {
          authorization: `Bearer ${generateToken({
            id: 'user-1',
            role: 'user',
            sid: 'session-1',
            typ: 'refresh',
          })}`,
        },
      },
      {},
      resolve,
    ));
    assert.equal(refreshTypeError.statusCode, 401);
  } finally {
    AuthSession.findOne = originalSessionFindOne;
    User.findById = originalUserFindById;
  }
});
