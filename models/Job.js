const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const jobSchema = new mongoose.Schema(
  {
    recruiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recruiter",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    department: { type: String },
    employmentType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "internship", "temporary"],
      required: true,
    },
    workMode: {
      type: String,
      enum: ["remote", "on-site", "hybrid"],
      required: true,
    },

    experienceLevel: {
      type: String,
      enum: ["entry", "junior", "mid", "senior", "lead", "executive"],
      required: true,
    },
    minimumYearsOfExperience: { type: Number, default: 0 },
    educationLevel: {
      type: String,
      enum: ["none", "ssce", "ond", "hnd", "bsc", "msc", "phd"],
      default: "none",
    },
    requiredSkills: [{ type: String, trim: true }],
    preferredSkills: [{ type: String, trim: true }],
    requiredCertifications: [{ type: String, trim: true }],

    responsibilities: [{ type: String }],
    qualifications: [{ type: String }],
    benefits: [{ type: String }],

    salaryMin: { type: Number },
    salaryMax: { type: Number },
    salaryCurrency: { type: String, default: "NGN" },
    salaryIsNegotiable: { type: Boolean, default: false },

    state: { type: String, required: true },
    city: { type: String, required: true },

    applicationDeadline: { type: Date, required: true },

    status: {
      type: String,
      enum: ["draft", "published", "closed", "suspended"],
      default: "draft",
    },
    isActive: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    featuredAt: { type: Date },
    featuredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    suspensionReason: { type: String },
    suspendedAt: { type: Date },

    publishedAt: { type: Date },
    closedAt: { type: Date },

    views: { type: Number, default: 0 },
    applicationsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

jobSchema.plugin(paginate);
jobSchema.index({
  title: "text",
  description: "text",
  requiredSkills: "text",
});
jobSchema.index({ status: 1, isActive: 1, applicationDeadline: 1 });
jobSchema.index({ company: 1 });
jobSchema.index({ category: 1 });
jobSchema.index({ state: 1, city: 1 });

// A job is publicly visible only when published, active, and not past its deadline
jobSchema.methods.isPubliclyVisible = function () {
  return (
    this.status === "published" &&
    this.isActive &&
    new Date(this.applicationDeadline) >= new Date()
  );
};

module.exports = mongoose.model("Job", jobSchema);
