import mongoose from 'mongoose';

/**
 * Establish a connection to MongoDB using mongoose.connect().
 *
 * Reads MONGO_URI from environment variables. On failure the process is
 * terminated with exit code 1 — this is intentional: an API server without
 * its database is useless, so we fail fast instead of running half-alive.
 *
 * @returns {Promise<import('mongoose').Connection>} The active Mongoose connection.
 */
export default async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('[DB] FATAL: MONGO_URI environment variable is not set.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`[DB] Connected successfully → ${conn.connection.host}/${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    console.error(`[DB] Connection FAILED → ${uri}`);
    console.error(`[DB] Reason: ${error.message}`);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }
}