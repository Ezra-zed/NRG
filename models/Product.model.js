import mongoose from 'mongoose';

/**
 * Product — catalogue items sold through the marketplace.
 *
 * sellerId references the User that listed the product (role 'seller-co').
 * specs is freely shaped (wattage, efficiency, warranty, dimensions…).
 */

const productSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['solar-module', 'inverter', 'cable', 'structure', 'BOS'],
      required: [true, 'category is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'product name is required'],
      trim: true,
      index: true,
    },
    price: {
      type: Number,
      required: [true, 'price is required'],
      min: [0, 'price cannot be negative'],
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'sellerId is required'],
      index: true,
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'stock cannot be negative'],
    },
    // Arbitrary manufacturer/spec data — kept intentionally loose.
    specs: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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

// Case-insensitive indexed search over product names.
productSchema.index({ name: 'text' });

const Product = mongoose.model('Product', productSchema);

export default Product;