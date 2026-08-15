const { z } = require("zod");

const createReviewSchema = z.object({
  company: z.string().min(1),
  rating: z.coerce.number().min(1).max(5),
  comment: z.string().min(10).max(3000),
  anonymous: z.boolean().optional().default(false),
});

const updateReviewSchema = z.object({
  rating: z.coerce.number().min(1).max(5).optional(),
  comment: z.string().min(10).max(3000).optional(),
  anonymous: z.boolean().optional(),
});

module.exports = { createReviewSchema, updateReviewSchema };
