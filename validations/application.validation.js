const { z } = require("zod");
const Application = require("../models/Application");

const applySchema = z.object({
  job: z.string().min(1),
  coverLetter: z.string().max(5000).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(Application.STATUSES),
});

const coverLetterSchema = z.object({
  coverLetter: z.string().min(1).max(5000),
});

module.exports = { applySchema, updateStatusSchema, coverLetterSchema };
