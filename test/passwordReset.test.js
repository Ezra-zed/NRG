import assert from 'node:assert/strict';
import test from 'node:test';
import Joi from 'joi';
import { forgotPasswordSchema, resetPasswordSchema } from '../controllers/auth/auth.schemas.js';
import {
  hashPasswordResetToken,
  requestPasswordReset,
  resetPassword,
} from '../services/passwordReset.service.js';

const fixedNow = () => new Date('2026-11-02T18:00:00.000Z');

test('password reset requests normalize emails before lookup and send a one-hour link', async () => {
  const token = 'a'.repeat(64);
  const user = { _id: 'user-1', email: 'person@example.com', authProvider: 'JWT-auth', password: 'stored-hash' };
  const emailLookup = ' Person@Example.com ';
  let savedToken;
  let sentEmail;
  const userModel = {
    findOne(query) {
      assert.deepEqual(query, { email: user.email });
      return { select: async (fields) => {
        assert.equal(fields, '+password');
        return user;
      } };
    },
  };
  const tokenModel = {
    async findOneAndUpdate(query, update, options) {
      assert.deepEqual(query, { userId: user._id });
      assert.deepEqual(options, { upsert: true, setDefaultsOnInsert: true });
      savedToken = update.$set;
    },
  };

  await requestPasswordReset(
    { email: emailLookup },
    {
      userModel,
      tokenModel,
      sendEmail: async (message) => { sentEmail = message; },
      now: fixedNow,
      generateToken: () => token,
    },
  );

  assert.equal(savedToken.tokenHash, hashPasswordResetToken(token));
  assert.equal(savedToken.expiresAt.toISOString(), '2026-11-02T19:00:00.000Z');
  assert.deepEqual(sentEmail, { to: user.email, token });
});

test('password reset requests persist only a hash and send a one-hour link', async () => {
  const token = 'a'.repeat(64);
  const user = { _id: 'user-1', email: 'person@example.com', authProvider: 'JWT-auth', password: 'stored-hash' };
  let savedToken;
  let sentEmail;
  const userModel = {
    findOne(query) {
      assert.deepEqual(query, { email: user.email });
      return { select: async (fields) => {
        assert.equal(fields, '+password');
        return user;
      } };
    },
  };
  const tokenModel = {
    async findOneAndUpdate(query, update, options) {
      assert.deepEqual(query, { userId: user._id });
      assert.deepEqual(options, { upsert: true, setDefaultsOnInsert: true });
      savedToken = update.$set;
    },
  };

  await requestPasswordReset(
    { email: user.email },
    {
      userModel,
      tokenModel,
      sendEmail: async (message) => { sentEmail = message; },
      now: fixedNow,
      generateToken: () => token,
    },
  );

  assert.equal(savedToken.tokenHash, hashPasswordResetToken(token));
  assert.notEqual(savedToken.tokenHash, token);
  assert.equal(savedToken.expiresAt.toISOString(), '2026-11-02T19:00:00.000Z');
  assert.deepEqual(sentEmail, { to: user.email, token });
});

test('password reset requests do not send mail for unknown or non-password accounts', async () => {
  let emailSent = false;
  const findOne = (user) => () => ({ select: async () => user });
  const tokenModel = {
    async findOneAndUpdate() {
      assert.fail('No reset token should be created for this account');
    },
  };
  const sendEmail = async () => { emailSent = true; };

  await requestPasswordReset(
    { email: 'missing@example.com' },
    { userModel: { findOne: findOne(null) }, tokenModel, sendEmail },
  );
  await requestPasswordReset(
    { email: 'google@example.com' },
    {
      userModel: { findOne: findOne({ authProvider: 'O-auth', password: null }) },
      tokenModel,
      sendEmail,
    },
  );

  assert.equal(emailSent, false);
});

test('resetting a password consumes the token, saves the new password, and revokes sessions', async () => {
  const token = 'b'.repeat(64);
  const now = fixedNow();
  const user = {
    _id: 'user-1',
    authProvider: 'JWT-auth',
    password: 'old-hash',
    async save() { this.saved = true; },
  };
  let lookup;
  let revoked;
  const tokenModel = {
    async findOneAndDelete(query) {
      lookup = query;
      return { userId: user._id };
    },
  };
  const userModel = {
    findById(id) {
      assert.equal(id, user._id);
      return { select: async (fields) => {
        assert.equal(fields, '+password');
        return user;
      } };
    },
  };
  const sessionModel = {
    async updateMany(...args) { revoked = args; },
  };

  await resetPassword(
    { token, password: 'new-password' },
    { tokenModel, userModel, sessionModel, now: () => now },
  );

  assert.equal(lookup.tokenHash, hashPasswordResetToken(token));
  assert.deepEqual(lookup.expiresAt, { $gt: now });
  assert.equal(user.password, 'new-password');
  assert.equal(user.saved, true);
  assert.deepEqual(revoked, [
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: now } },
  ]);
});

test('expired or already-used reset tokens are rejected', async () => {
  await assert.rejects(
    resetPassword(
      { token: 'c'.repeat(64), password: 'new-password' },
      {
        tokenModel: { findOneAndDelete: async () => null },
      },
    ),
    (error) => error.statusCode === 400 && error.errorCode === 'INVALID_PASSWORD_RESET_TOKEN',
  );
});

test('password reset endpoints validate email, token, and password inputs', () => {
  assert.equal(forgotPasswordSchema.validate({ email: 'person@example.com' }).error, undefined);
  assert.ok(forgotPasswordSchema.validate({ email: 'not-an-email' }).error instanceof Joi.ValidationError);
  assert.equal(resetPasswordSchema.validate({ token: 'd'.repeat(64), password: 'secret12' }).error, undefined);
  assert.ok(resetPasswordSchema.validate({ token: 'short', password: 'secret12' }).error instanceof Joi.ValidationError);
  assert.ok(resetPasswordSchema.validate({ token: 'd'.repeat(64), password: 'short' }).error instanceof Joi.ValidationError);
});
