const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const savedJobSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplicantProfile",
      required: true,
    },
    job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

savedJobSchema.index({ applicant: 1, job: 1 }, { unique: true });
savedJobSchema.plugin(paginate);

module.exports = mongoose.model("SavedJob", savedJobSchema);
