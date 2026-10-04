import mongoose from 'mongoose';

/**
 * Customer — registration data from the "register customer" flow.
 *
 * The mobile number is the primary identifier; email is optional. The
 * electricity bill is stored as a private generated filename in electricityBill
 * and served only through an authorized API route.
 */

const customerSchema = new mongoose.Schema(
  {
    // Optional authenticated User (role 'user') associated with this inquiry.
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
    // Private electricity bill filename; never served by the public static route.
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