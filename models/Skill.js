const mongoose = require("mongoose");

// Global master list of skills (used by both applicants and jobs)
const skillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Skill", skillSchema);
