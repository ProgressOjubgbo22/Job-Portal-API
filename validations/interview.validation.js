const { z } = require("zod");

const scheduleInterviewSchema = z.object({
  application: z.string().min(1),
  date: z.coerce.date(),
  location: z.string().min(3),
  notes: z.string().optional(),
});

const rescheduleInterviewSchema = z.object({
  date: z.coerce.date(),
  location: z.string().min(3).optional(),
});

const outcomeSchema = z.object({
  outcome: z.enum(["passed", "failed", "pending"]),
  outcomeNotes: z.string().optional(),
});

module.exports = { scheduleInterviewSchema, rescheduleInterviewSchema, outcomeSchema };
