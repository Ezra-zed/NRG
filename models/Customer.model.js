import mongoose from 'mongoose';

/**
 * Customer — registration data from the "register customer" flow.
 *
 * The mobile number is the primary identifier; email is optional. The
 * electricity bill is an uploaded file whose client-accessible URL is stored
 * in electricityBill.
 */

const customerSchema = new mongoose.Schema(
  {
    // The auth User (role 'user') this customer maps to, if auto-created.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
    },
    mobile: {
      type: String,
      required: [true, 'mobile is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'email must be a valid email address'],
    },
    location: { type: String, trim: true },
    pincode: { type: String, trim: true },
    propertyType: {
      type: String,
      enum: ['residential', 'commercial', 'industrial', 'other'],
      default: 'residential',
    },
    // Uploaded electricity bill — stored as a public /uploads file URL.
    electricityBill: { type: String, trim: true },
    monthlyBillAmount: { type: Number, min: 0 },
    requiredPower: { type: Number, min: 0 },
    requiredSystemSize: { type: String, trim: true },
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

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;