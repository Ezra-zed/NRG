import assert from 'node:assert/strict';
import test from 'node:test';
import { signupDuplicateError } from '../controllers/auth/signup.controller.js';

test('signup duplicate errors identify an already registered email', () => {
  const error = signupDuplicateError(['email']);

  assert.equal(error.statusCode, 409);
  assert.equal(error.errorCode, 'SIGNUP_EMAIL_ALREADY_REGISTERED');
  assert.equal(error.message, 'This email address is already registered. Sign in to your existing account or use a different email address.');
});

test('signup duplicate errors identify an already registered phone number', () => {
  const error = signupDuplicateError(['phone']);

  assert.equal(error.statusCode, 409);
  assert.equal(error.errorCode, 'SIGNUP_PHONE_ALREADY_REGISTERED');
  assert.equal(error.message, 'This phone number is already registered. Sign in to your existing account or use a different phone number.');
});

test('signup duplicate errors identify when both contact details are registered', () => {
  const error = signupDuplicateError(['email', 'phone']);

  assert.equal(error.statusCode, 409);
  assert.equal(error.errorCode, 'SIGNUP_EMAIL_AND_PHONE_ALREADY_REGISTERED');
  assert.equal(error.message, 'This email address and phone number are already registered. Sign in to your existing account or use different contact details.');
});

test('signup duplicate errors ignore unrelated unique fields', () => {
  assert.equal(signupDuplicateError(['oauthId']), null);
});
