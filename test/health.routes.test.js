import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import healthRoutes from '../routes/health.routes.js';

/**
 * Boots a throwaway Express server with only the health router mounted and
 * exercises GET /health over real HTTP (no DB connection required — the
 * endpoint must answer even when MongoDB is down).
 */
const startServer = () => new Promise((resolve) => {
  const app = express();
  app.use('/health', healthRoutes);
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

test('GET /health answers 200 with the standard success envelope', async () => {
  const server = await startServer();
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.error, null);
    assert.equal(body.data.status, 'ok');
    assert.equal(typeof body.data.uptimeSeconds, 'number');
    assert.ok(body.data.uptimeSeconds >= 0);
    assert.equal(typeof body.data.timestamp, 'string');
    assert.equal(typeof body.data.environment, 'string');
  } finally {
    server.close();
  }
});

test('GET /health reports a known Mongoose connection state (liveness even when DB is down)', async () => {
  const server = await startServer();
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    // No DB connection is opened in tests → must still be a valid state string,
    // and the endpoint must NOT fail just because MongoDB is unreachable.
    assert.ok(
      ['disconnected', 'connected', 'connecting', 'disconnecting', 'unknown'].includes(body.data.database.state),
      `unexpected db state: ${body.data.database.state}`,
    );
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});
