import mongoose from 'mongoose';

/**
 * CompanyProfile — the public/operational profile of a seller-co or install-co.
 *
 * companyId references the auth User that owns the profile. Verification badges
 * (GST Verified, Business Verified, Installer Verified, Top Rated) are applied
 * by admins; rating/experience are surfaced to customers comparing quotes.
 */

const pricingPackageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    price: { type: Number, min: 0 },
    description: { type: String, trim: true },
  },
  { _id: true }
);

const companyProfileSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'companyId is required'],
      unique: true,
      index: true,
    },
    // Uploaded certificates — public /uploads file URLs.
    gstCertificate: { type: String, trim: true },
    businessRegistration: { type: String, trim: true },
    installExperienceYears: {
      type: Number,
      min: 0,
      default: 0,
    },
    serviceLocations: { type: [String], default: [] },
    products: { type: [String], default: [] },
    brands: { type: [String], default: [] },
    pricingPackages: { type: [pricingPackageSchema], default: [] },
    completedProjectPhotos: { type: [String], default: [] },
    verificationBadges: {
      type: [String],
      enum: ['GST Verified', 'Business Verified', 'Installer Verified', 'Top Rated'],
      default: [],
    },
    // Derived aggregate state (see controllers).
    verified: { type: Boolean, default: false },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
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

const CompanyProfile = mongoose.model('CompanyProfile', companyProfileSchema);

export default CompanyProfile;