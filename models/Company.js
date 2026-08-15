const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    logo: { type: String, default: null },
    logoPublicId: { type: String, select: false },
    coverImage: { type: String, default: null },
    coverImagePublicId: { type: String, select: false },
    about: { type: String },
    industry: { type: String },
    companySize: {
      type: String,
      enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
    },
    foundedYear: { type: Number },

    email: { type: String, lowercase: true, trim: true },
    phoneNumber: { type: String },
    website: { type: String },

    state: { type: String },
    city: { type: String },
    address: { type: String },
    postalCode: { type: String },

    socialMedia: {
      linkedin: { type: String },
      facebook: { type: String },
      twitter: { type: String },
      instagram: { type: String },
      youtube: { type: String },
    },

    hiringStatus: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    companyCulture: { type: String },
    mission: { type: String },
    vision: { type: String },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    suspensionReason: { type: String },
    suspendedAt: { type: Date },

    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },

    profileCompletion: { type: Number, default: 0, min: 0, max: 100 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

companySchema.plugin(paginate);
companySchema.index({ name: "text", about: "text", industry: "text" });

module.exports = mongoose.model("Company", companySchema);
