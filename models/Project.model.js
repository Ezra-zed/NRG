import mongoose from 'mongoose';
import { PROJECT_LIFECYCLE_STATUSES } from '../config/projectLifecycle.js';

/**
 * Project — a "Get Solar Quote" request plus the quotes companies have
 * submitted against it.
 *
 * quotes.companyId references the User of the quoting company. companyName,
 * rating, yearsExperience, verified are snapshotted at quote-submission time so
 * a customer comparing quotes never needs a deep join to CompanyProfile.
 */

const quoteSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    companyName: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    yearsExperience: { type: Number, min: 0, default: 0 },
    verified: { type: Boolean, default: false },
    estimatedPrice: { type: Number, required: [true, 'estimatedPrice is required'] },
    warrantyYears: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    status: {
      type: String,
      enum: ['submitted', 'accepted', 'won', 'lost'],
      default: 'submitted',
    },
  },
  { _id: true }
);

const projectTrackingEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: PROJECT_LIFECYCLE_STATUSES, required: true },
    message: { type: String, trim: true, maxlength: 1000 },
    important: { type: Boolean, default: false },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: { type: String, enum: ['user', 'seller-co', 'install-co', 'admin', 'system'], required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    location: { type: String, trim: true, required: [true, 'location is required'] },
    monthlyBill: { type: Number, min: 0 },
    propertyType: {
      type: String,
      enum: ['residential', 'commercial', 'industrial', 'other'],
      default: 'residential',
    },
    systemPreference: {
      type: String,
      enum: ['on-grid', 'off-grid', 'hybrid-grid'],
      default: 'on-grid',
    },
    budget: { type: Number, min: 0 },
    currentBillUrl: { type: String, default: null },
    currentBillOriginalName: { type: String, trim: true },
    currentBillMimeType: { type: String, trim: true },
    currentBillUploadedAt: { type: Date },
    estimate: { type: mongoose.Schema.Types.Mixed, default: null },
    trackingStatus: {
      type: String,
      enum: PROJECT_LIFECYCLE_STATUSES,
      default: 'project-created',
      index: true,
    },
    expectedCompletionAt: { type: Date, default: null },
    trackingHistory: { type: [projectTrackingEventSchema], default: [] },
    status: {
      type: String,
      enum: ['pending', 'quoted', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
    },
    quotes: { type: [quoteSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

const Project = mongoose.model('Project', projectSchema);

export default Project;