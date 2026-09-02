import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

/**
 * User — all three actor types live in a single collection, differentiated by role.
 *
 * role:         'seller-co' (solar/product seller) | 'install-co' (installer company) | 'user' (customer)
 * authProvider: 'O-auth' | 'JWT-auth' | 'no-password'
 * oauthId:      provider-side identifier for OAuth accounts.
 * password:     only stored for JWT-auth accounts (bcrypt hashed).
 */

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['seller-co', 'install-co', 'user'],
      required: [true, 'role is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      minlength: [2, 'name must be at least 2 characters'],
      maxlength: [100, 'name must be at most 100 characters'],
    },
    // Identity fields are enforced as *required* by the signup Joi schema;
    // they stay optional at the DB layer because a user can be auto-created
    // by the no-password (phone only) or OAuth flows.
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'email must be a valid email address'],
      index: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, 'phone must be a valid phone number'],
      index: true,
    },
    // Password is optional: OAuth / no-password flows never store one.
    password: {
      type: String,
      required: false,
      select: false, // never returned by default queries
      minlength: [6, 'password must be at least 6 characters'],
    },
    authProvider: {
      type: String,
      enum: ['O-auth', 'JWT-auth', 'no-password'],
      default: 'JWT-auth',
      required: true,
    },
    // For OAuth users only — provider's stable identifier (e.g. Google sub).
    oauthId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    // Seller company details (role === 'seller-co')
    businessName: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    // Installer company details (role === 'install-co')
    licenseNumber: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.password;
        return ret;
      },
    },
  }
);

/**
 * Hash the password before a save whenever it has been modified
 * (covers signup and password reset).
 */
userSchema.pre('save', async function preSaveHashPassword(next) {
  if (!this.isModified('password')) return next();
  if (!this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

/**
 * Compare a candidate password with the stored bcrypt hash.
 * @param {string} candidate Plain-text candidate password.
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;