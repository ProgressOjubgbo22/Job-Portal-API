const { z } = require("zod");

const profileSchema = z.object({
  professionalHeadline: z.string().max(150).optional(),
  bio: z.string().max(2000).optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  currentJobTitle: z.string().optional(),
  yearsOfExperience: z.coerce.number().min(0).max(60).optional(),
  employmentStatus: z
    .enum(["employed", "unemployed", "self-employed", "student", "freelancer"])
    .optional(),
  preferredWorkMode: z.enum(["remote", "on-site", "hybrid"]).optional(),
  preferredJobType: z
    .enum(["full-time", "part-time", "contract", "internship", "temporary"])
    .optional(),
  expectedSalary: z.coerce.number().min(0).optional(),
  portfolio: z.string().url().optional().or(z.literal("")),
  linkedin: z.string().url().optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
});

const educationSchema = z.object({
  school: z.string().min(2),
  degree: z.string().min(2),
  fieldOfStudy: z.string().min(2),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  currentlyStudying: z.boolean().optional().default(false),
  grade: z.string().optional(),
});

const experienceSchema = z.object({
  company: z.string().min(2),
  position: z.string().min(2),
  employmentType: z.enum([
    "full-time",
    "part-time",
    "contract",
    "internship",
    "temporary",
    "freelance",
  ]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  currentlyWorking: z.boolean().optional().default(false),
  description: z.string().optional(),
});

const skillSchema = z.object({
  name: z.string().min(1),
  level: z.enum(["beginner", "intermediate", "advanced", "expert"]),
});

const certificationSchema = z.object({
  name: z.string().min(2),
  issuingOrganization: z.string().min(2),
  issueDate: z.coerce.date(),
  expirationDate: z.coerce.date().optional(),
  credentialUrl: z.string().url().optional().or(z.literal("")),
});

module.exports = {
  profileSchema,
  educationSchema,
  experienceSchema,
  skillSchema,
  certificationSchema,
};
