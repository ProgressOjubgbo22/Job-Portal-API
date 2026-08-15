const ApplicantProfile = require("../models/ApplicantProfile");
const Education = require("../models/Education");
const Experience = require("../models/Experience");
const Skill = require("../models/Skill");
const Certification = require("../models/Certification");
const Company = require("../models/Company");

/**
 * Recalculates and persists the applicant's profile completion percentage.
 * Weighted across: core profile fields, resume, profile picture,
 * education, experience, skills, certifications (bonus).
 */
const recalculateApplicantProfileCompletion = async (applicantId) => {
  const profile = await ApplicantProfile.findOne({ user: applicantId });
  if (!profile) return 0;

  const [education, experience, skills, certifications] = await Promise.all([
    Education.countDocuments({ applicant: profile._id }),
    Experience.countDocuments({ applicant: profile._id }),
    Skill.countDocuments({ applicant: profile._id }),
    Certification.countDocuments({ applicant: profile._id }),
  ]);

  let score = 0;
  const weights = {
    professionalHeadline: 10,
    bio: 10,
    profilePicture: 10,
    state: 5,
    city: 5,
    currentJobTitle: 5,
    yearsOfExperience: 5,
    employmentStatus: 5,
    preferredWorkMode: 5,
    preferredJobType: 5,
    expectedSalary: 5,
    resume: 15,
    education: 5,
    experience: 5,
    skills: 5,
  };

  if (profile.professionalHeadline) score += weights.professionalHeadline;
  if (profile.bio) score += weights.bio;
  if (profile.profilePicture) score += weights.profilePicture;
  if (profile.state) score += weights.state;
  if (profile.city) score += weights.city;
  if (profile.currentJobTitle) score += weights.currentJobTitle;
  if (profile.yearsOfExperience !== undefined && profile.yearsOfExperience !== null)
    score += weights.yearsOfExperience;
  if (profile.employmentStatus) score += weights.employmentStatus;
  if (profile.preferredWorkMode) score += weights.preferredWorkMode;
  if (profile.preferredJobType) score += weights.preferredJobType;
  if (profile.expectedSalary !== undefined && profile.expectedSalary !== null)
    score += weights.expectedSalary;
  if (profile.resume) score += weights.resume;
  if (education > 0) score += weights.education;
  if (experience > 0) score += weights.experience;
  if (skills > 0) score += weights.skills;
  // Certifications are a small bonus, capped so total never exceeds 100
  if (certifications > 0) score += 5;

  const completion = Math.min(score, 100);
  profile.profileCompletion = completion;
  await profile.save();
  return completion;
};

/**
 * Recalculates and persists a company's profile completion percentage.
 */
const recalculateCompanyProfileCompletion = async (companyId) => {
  const company = await Company.findById(companyId);
  if (!company) return 0;

  const fields = [
    "name",
    "logo",
    "coverImage",
    "about",
    "industry",
    "companySize",
    "foundedYear",
    "website",
    "email",
    "phoneNumber",
    "state",
    "city",
    "address",
  ];

  let filled = 0;
  fields.forEach((f) => {
    if (company[f]) filled += 1;
  });

  const socialFilled = company.socialMedia
    ? Object.values(company.socialMedia.toObject ? company.socialMedia.toObject() : company.socialMedia).filter(Boolean).length
    : 0;

  const total = fields.length + 1; // +1 for having at least one social link
  const numerator = filled + (socialFilled > 0 ? 1 : 0);
  const completion = Math.round((numerator / total) * 100);

  company.profileCompletion = completion;
  await company.save();
  return completion;
};

module.exports = {
  recalculateApplicantProfileCompletion,
  recalculateCompanyProfileCompletion,
};
