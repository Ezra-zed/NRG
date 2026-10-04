import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema(
  {
    _id: { type: String },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    refreshTokenHash: { type: String, required: true },
    usedRefreshTokenHashes: { type: [String], default: [] },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const AuthSession = mongoose.model('AuthSession', authSessionSchema);

export default AuthSession;
