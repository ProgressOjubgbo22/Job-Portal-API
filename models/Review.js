const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const reviewSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 3000 },
    anonymous: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["visible", "hidden"],
      default: "visible",
    },
    hideReason: { type: String },
    hiddenAt: { type: Date },
    hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

reviewSchema.index({ applicant: 1, company: 1 }, { unique: true });
reviewSchema.index({ company: 1, status: 1 });
reviewSchema.plugin(paginate);

module.exports = mongoose.model("Review", reviewSchema);
