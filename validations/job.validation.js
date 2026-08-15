const { z } = require("zod");

const createJobSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(20),
  department: z.string().optional(),
  category: z.string().min(1),
  employmentType: z.enum(["full-time", "part-time", "contract", "internship", "temporary"]),
  workMode: z.enum(["remote", "on-site", "hybrid"]),
  experienceLevel: z.enum(["entry", "junior", "mid", "senior", "lead", "executive"]),
  minimumYearsOfExperience: z.coerce.number().min(0).optional(),
  educationLevel: z.enum(["none", "ssce", "ond", "hnd", "bsc", "msc", "phd"]).optional(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  requiredCertifications: z.array(z.string()).optional(),
  responsibilities: z.array(z.string()).optional(),
  qualifications: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  salaryMin: z.coerce.number().min(0).optional(),
  salaryMax: z.coerce.number().min(0).optional(),
  salaryCurrency: z.string().optional(),
  salaryIsNegotiable: z.boolean().optional(),
  state: z.string().min(2),
  city: z.string().min(2),
  applicationDeadline: z.coerce.date(),
});

const updateJobSchema = createJobSchema.partial();

module.exports = { createJobSchema, updateJobSchema };
