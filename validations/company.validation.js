const { z } = require("zod");

const companyProfileSchema = z.object({
  name: z.string().min(2).optional(),
  about: z.string().max(5000).optional(),
  industry: z.string().optional(),
  companySize: z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]).optional(),
  foundedYear: z.coerce.number().min(1800).max(new Date().getFullYear()).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  state: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  socialMedia: z
    .object({
      linkedin: z.string().url().optional().or(z.literal("")),
      facebook: z.string().url().optional().or(z.literal("")),
      twitter: z.string().url().optional().or(z.literal("")),
      instagram: z.string().url().optional().or(z.literal("")),
      youtube: z.string().url().optional().or(z.literal("")),
    })
    .optional(),
  hiringStatus: z.enum(["open", "closed"]).optional(),
  companyCulture: z.string().optional(),
  mission: z.string().optional(),
  vision: z.string().optional(),
});

module.exports = { companyProfileSchema };
