const { z } = require("zod");

const categorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

const updateCategorySchema = categorySchema.partial();

module.exports = { categorySchema, updateCategorySchema };
