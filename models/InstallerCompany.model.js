import mongoose from 'mongoose';

/**
 * InstallerCompany — team assignments of an installer company.
 * Each team is an array of installer sub-objects. Sub-object structure is
 * kept loose (Mixed) on purpose: { name, role, phone, designation, … }.
 */

const installerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    role: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    extra: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: true }
);

const installerCompanySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'companyId is required'],
      unique: true,
      index: true,
    },
    team1: { type: [installerSchema], default: [] },
    team2: { type: [installerSchema], default: [] },
    team3: { type: [installerSchema], default: [] },
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

const InstallerCompany = mongoose.model('InstallerCompany', installerCompanySchema);

export default InstallerCompany;