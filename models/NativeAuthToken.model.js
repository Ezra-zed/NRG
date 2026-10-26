import mongoose from 'mongoose';

// Hashed, short-lived OAuth state and single-use native callback grants.
const nativeAuthTokenSchema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ['state', 'exchange'], required: true },
  sessionId: { type: String, ref: 'AuthSession' },
  acceptPolicies: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export default mongoose.model('NativeAuthToken', nativeAuthTokenSchema);
