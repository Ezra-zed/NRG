import assert from 'node:assert/strict';
import test from 'node:test';
import { generateToken, verifyToken } from '../utils/jwt.js';

process.env.JWT_SECRET = 'jwt-test-secret-with-enough-entropy';

test('access JWTs are signed for the API audience and tied to a session', () => {
  const token = generateToken({
    id: 'user-id',
    role: 'user',
    sid: 'session-id',
    typ: 'access',
  });
  const decoded = verifyToken(token);

  assert.equal(decoded.id, 'user-id');
  assert.equal(decoded.typ, 'access');
  assert.equal(decoded.sid, 'session-id');
  assert.equal(decoded.iss, 'nrg-api');
  assert.equal(decoded.aud, 'nrg-client');
  assert.ok(decoded.exp - decoded.iat <= 15 * 60);
});

test('JWT verification rejects a token signed with a different algorithm', async () => {
  const jwt = await import('jsonwebtoken');
  const token = jwt.default.sign(
    { id: 'user-id', role: 'user', sid: 'session-id', typ: 'access' },
    process.env.JWT_SECRET,
    { algorithm: 'HS384', issuer: 'nrg-api', audience: 'nrg-client' },
  );

  assert.throws(() => verifyToken(token));
});
