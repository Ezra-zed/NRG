import mongoose from 'mongoose';

const maintenanceRequestSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  message: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['open', 'in-progress', 'resolved', 'cancelled'], default: 'open', index: true },
}, { timestamps: true });

export default mongoose.model('MaintenanceRequest', maintenanceRequestSchema);
