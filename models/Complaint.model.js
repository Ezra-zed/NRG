import mongoose from 'mongoose';

/**
 * Complaint — an issue raised (typically by a customer = userId) against an
 * installer/seller company (companyId). Both sides live in the User collection
 * but play different roles here.
 */

const complaintSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'companyId is required'],
      index: true,
    },
    message: {
      type: String,
      required: [true, 'message is required'],
      trim: true,
      maxlength: [2000, 'message must be at most 2000 characters'],
    },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
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

const Complaint = mongoose.model('Complaint', complaintSchema);

export default Complaint;