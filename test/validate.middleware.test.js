import assert from 'node:assert/strict';
import test from 'node:test';
import Joi from 'joi';
import { validate } from '../middlewares/validate.middleware.js';

test('validate sanitizes a query with an Express 5-style read-only getter', async () => {
  const requestPrototype = {};
  Object.defineProperty(requestPrototype, 'query', {
    configurable: true,
    get: () => ({ page: '2', ignored: 'value' }),
  });
  const req = Object.create(requestPrototype);

  await new Promise((resolve, reject) => {
    validate(Joi.object({ page: Joi.number().integer().required() }), 'query')(
      req,
      {},
      (error) => (error ? reject(error) : resolve()),
    );
  });

  assert.deepEqual(req.query, { page: 2 });
});
