import test from 'node:test';
import assert from 'node:assert/strict';
import Payment from '../models/Payment.model.js';

test('paid and active quote uniqueness use distinct MongoDB-compatible compound partial indexes', () => {
  const quoteIndexes = Payment.schema.indexes().filter(([keys]) =>
    keys.projectId === 1 && keys.quoteId === 1,
  );
  assert.equal(quoteIndexes.length, 2);

  const paid = quoteIndexes.find(([keys]) => Object.keys(keys).length === 2);
  assert.ok(paid);
  assert.deepEqual(paid[0], { projectId: 1, quoteId: 1 });
  assert.equal(paid[1].unique, true);
  assert.deepEqual(paid[1].partialFilterExpression, { status: 'paid' });

  const active = quoteIndexes.find(([keys]) => keys.active === 1);
  assert.ok(active);
  assert.deepEqual(active[0], { projectId: 1, quoteId: 1, active: 1 });
  assert.equal(active[1].unique, true);
  assert.equal(active[1].name, 'active_project_quote_unique');
  assert.deepEqual(active[1].partialFilterExpression, { active: true });
});

test('payment idempotency and Razorpay identity indexes remain unique', () => {
  const indexes = Payment.schema.indexes();
  for (const key of [
    { userId: 1, idempotencyKey: 1 },
    { razorpayOrderId: 1 },
    { razorpayPaymentId: 1 },
  ]) {
    assert.ok(indexes.some(([keys, options]) =>
      JSON.stringify(keys) === JSON.stringify(key) && options.unique === true,
    ));
  }
});
