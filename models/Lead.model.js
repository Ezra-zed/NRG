import mongoose from 'mongoose';

/**
 * Lead — a sales-pipeline entry linking a company to a customer project.
 *
 * status mirrors the company funnel: new → contacted → site-visit →
 * quote-submitted → won | lost. A submitted quote is stored in the `quote`
 * sub-document and mirrored onto the project's quotes array.
 */

const leadQuoteSchema = new mongoose.Schema(
  {
    estimatedPrice: { type: Number, min: 0 },
    warrantyYears: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true },
    submittedAt: { type: Date },
  },
  { _id: true }
);

const leadSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'companyId is required'],
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'projectId is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['new', 'accepted', 'contacted', 'site-visit', 'quote-submitted', 'won', 'lost', 'rejected'],
      default: 'new',
      index: true,
    },
    quote: { type: leadQuoteSchema, default: null },
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

const Lead = mongoose.model('Lead', leadSchema);

export default Lead;