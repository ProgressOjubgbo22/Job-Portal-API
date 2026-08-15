const { z } = require("zod");

const acceptInvitationSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(72),
});

const recruiterLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createRecruiterSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  jobTitle: z.string().optional(),
  company: z.string().min(1),
});

module.exports = { acceptInvitationSchema, recruiterLoginSchema, createRecruiterSchema };
