const { z } = require("zod");

const createTicketSchema = z.object({
  subject: z.string().min(5),
  category: z
    .enum(["account", "billing", "technical", "job_posting", "application", "other"])
    .optional(),
  description: z.string().min(10),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

const ticketMessageSchema = z.object({
  message: z.string().min(1),
});

module.exports = { createTicketSchema, ticketMessageSchema };
