import mongoose from 'mongoose';

const maintenanceReminderSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  scheduledAt: { type: Date, required: true, index: true },
  nextAttemptAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ['scheduled', 'processing', 'sent', 'cancelled'], default: 'scheduled', index: true },
  sentAt: { type: Date, default: null },
  lockedAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, maxlength: 1000 },
}, { timestamps: true });

export default mongoose.model('MaintenanceReminder', maintenanceReminderSchema);
