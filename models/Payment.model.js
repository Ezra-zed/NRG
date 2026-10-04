import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  quoteId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true, min: 1 }, // smallest currency unit (paise for INR)
  currency: { type: String, required: true, default: 'INR', uppercase: true },
  razorpayOrderId: { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },
  status: {
    type: String,
    enum: ['creating', 'created', 'pending', 'authorized', 'paid', 'failed', 'cancelled', 'interrupted', 'creation_failed'],
    default: 'creating', index: true,
  },
  active: { type: Boolean, default: true, select: false },
  idempotencyKey: { type: String, required: true },
  failureCode: { type: String, default: null },
  failureReason: { type: String, default: null },
  paidAt: { type: Date, default: null },
  lastWebhookAt: { type: Date, default: null },
}, { timestamps: true });

paymentSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ projectId: 1, quoteId: 1 }, {
  unique: true, partialFilterExpression: { status: 'paid' },
});
paymentSchema.index({ projectId: 1, quoteId: 1 }, {
  unique: true, partialFilterExpression: { active: true },
});
paymentSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model('Payment', paymentSchema);
