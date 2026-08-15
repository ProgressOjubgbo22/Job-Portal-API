const mongoose = require("mongoose");

const certificationSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplicantProfile",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    issuingOrganization: { type: String, required: true, trim: true },
    issueDate: { type: Date, required: true },
    expirationDate: { type: Date },
    credentialUrl: { type: String },
  },
  { timestamps: true }
);

certificationSchema.index({ applicant: 1 });

module.exports = mongoose.model("Certification", certificationSchema);
