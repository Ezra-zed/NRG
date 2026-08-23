import mongoose from 'mongoose';

/**
 * CallLog — a follow-up note attached to a complaint.
 * calledBy is a free-text reference to whoever logged the call.
 */

const callLogSchema = new mongoose.Schema(
  {
    complaintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      required: [true, 'complaintId is required'],
      index: true,
    },
    notes: {
      type: String,
      required: [true, 'notes are required'],
      trim: true,
    },
    calledBy: {
      type: String,
      required: [true, 'calledBy is required'],
      trim: true,
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

const CallLog = mongoose.model('CallLog', callLogSchema);

export default CallLog;