import assert from 'node:assert/strict';
import test from 'node:test';
import { validate } from '../middlewares/validate.middleware.js';
import {
  clearCompanyAssistantRateLimit,
  companyAssistantRateLimit,
} from '../middlewares/companyAssistantRateLimit.middleware.js';
import { assistantSchema } from '../routes/companyAssistant.routes.js';
import { companyAssistant } from '../controllers/companyAssistant.controller.js';
import { generateAssistantReply } from '../services/aiProvider.service.js';

const runValidation = (body) => new Promise((resolve) => {
  const req = { body };
  validate(assistantSchema)(req, {}, (error) => resolve({ error, body: req.body }));
});

test('assistant schema accepts a message and strips unknown fields', async () => {
  const result = await runValidation({ message: ' What should I do next? ', companyId: 'attacker-id' });
  assert.equal(result.error, undefined);
  assert.equal(result.body.message, 'What should I do next?');
  assert.equal(result.body.companyId, undefined);
});

test('assistant schema rejects missing, blank, and oversized messages', async (t) => {
  for (const body of [{}, { message: '   ' }, { message: 'x'.repeat(1001) }]) {
    await t.test(JSON.stringify(body).slice(0, 30), async () => {
      const result = await runValidation(body);
      assert.equal(result.error.statusCode, 400);
    });
  }
});

test('assistant controller rejects unauthenticated and customer users', async (t) => {
  for (const user of [undefined, { _id: 'customer-1', role: 'user' }]) {
    await t.test(user ? 'customer' : 'missing user', async () => {
      await assert.rejects(
        companyAssistant({ user, body: { message: 'next' } }, {}, () => {}),
        (error) => error.statusCode === (user ? 403 : 401)
      );
    });
  }
});

test('assistant rate limit is keyed by authenticated user', () => {
  clearCompanyAssistantRateLimit();
  const nextCalls = [];
  const req = { user: { _id: 'company-1' } };
  for (let index = 0; index < 11; index += 1) {
    companyAssistantRateLimit(req, {}, (error) => nextCalls.push(error));
  }
  assert.equal(nextCalls.filter(Boolean).length, 1);
  clearCompanyAssistantRateLimit();
});

test('AI provider returns the reply and sends configured model without exposing credentials', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AI_API_KEY;
  const originalModel = process.env.AI_MODEL;
  let request;
  process.env.AI_API_KEY = 'test-secret';
  process.env.AI_MODEL = 'test-model';
  globalThis.fetch = async (_url, options) => {
    request = { options, body: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Review the newest lead.' } }] }) };
  };

  try {
    assert.equal(await generateAssistantReply([{ role: 'user', content: 'next' }]), 'Review the newest lead.');
    assert.equal(request.body.model, 'test-model');
    assert.equal(request.options.headers.authorization, 'Bearer test-secret');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = originalModel;
  }
});

test('AI provider maps provider rate limits and failures to safe errors', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = 'test-secret';

  await t.test('rate limit', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: 'private' }) });
    await assert.rejects(
      generateAssistantReply([]),
      (error) => error.statusCode === 429 && !error.message.includes('private')
    );
  });

  await t.test('provider failure', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'private' }) });
    await assert.rejects(
      generateAssistantReply([]),
      (error) => error.statusCode === 500 && !error.message.includes('private')
    );
  });

  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = originalKey;
});