import { Router } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * Health routes — liveness & readiness probing.
 *
 * @swagger
 * tags:
 *   - name: Health
 *     description: Service health monitoring
 */

const router = Router();

/**
 * GET /health
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     description: >
 *       Liveness/readiness probe. Reports process uptime and MongoDB
 *       connection state. Always answers 200 while the process is up;
 *       load balancers / orchestrators should treat a non-response as
 *       unhealthy. `data.database` reports the live Mongoose connection
 *       state (`connected`, `connecting`, `disconnected`, …).
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Process is up; body includes database connection state.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: ok }
 *                     uptimeSeconds: { type: number, example: 123.45 }
 *                     timestamp: { type: string, format: date-time }
 *                     environment: { type: string, example: production }
 *                     database:
 *                       type: object
 *                       properties:
 *                         state: { type: string, example: connected }
 *                 message: { type: string }
 *                 error: { type: 'null' }
 */
router.get('/', (_req, res) => {
  sendSuccess(
    res,
    200,
    {
      status: 'ok',
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        // 0=disconnected 1=connected 2=connecting 3=disconnecting
        state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
      },
    },
    'Service is healthy',
  );
});

export default router;
