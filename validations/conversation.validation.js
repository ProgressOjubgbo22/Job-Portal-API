const { z } = require("zod");

const startConversationSchema = z.object({
  receiverId: z.string().min(1),
  application: z.string().optional(),
  message: z.string().min(1).max(3000),
});

const sendMessageSchema = z.object({
  conversation: z.string().min(1),
  message: z.string().min(1).max(3000),
});

const reportConversationSchema = z.object({
  reason: z.string().min(5).max(1000),
});

module.exports = { startConversationSchema, sendMessageSchema, reportConversationSchema };
