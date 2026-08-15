const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const ApplicantProfile = require("../models/ApplicantProfile");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const {
  recalculateApplicantProfileCompletion,
} = require("../utils/profileCompletion");

const streamUpload = (buffer, folder, resourceType = "image") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

// GET /api/applicants/me
const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id }).populate(
    "user",
    "firstName lastName email phoneNumber profileCompleted"
  );
  if (!profile) throw ApiError.notFound("Applicant profile not found");
  return new ApiResponse(200, { profile }).send(res);
});

// POST /api/applicants/profile
const createProfile = asyncHandler(async (req, res) => {
  const existing = await ApplicantProfile.findOne({ user: req.user._id });
  if (existing) throw ApiError.conflict("Profile already exists");

  const profile = await ApplicantProfile.create({
    user: req.user._id,
    ...req.body,
  });

  const completion = await recalculateApplicantProfileCompletion(req.user._id);
  await User.findByIdAndUpdate(req.user._id, {
    profileCompleted: completion >= 80,
  });

  return new ApiResponse(201, { profile }, "Profile created").send(res);
});

// PATCH /api/applicants/profile
const updateProfile = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  Object.assign(profile, req.body);
  await profile.save();

  const completion = await recalculateApplicantProfileCompletion(req.user._id);
  await User.findByIdAndUpdate(req.user._id, {
    profileCompleted: completion >= 80,
  });

  return new ApiResponse(200, { profile }, "Profile updated").send(res);
});

// POST /api/applicants/profile-picture
const uploadProfilePicture = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id }).select(
    "+profilePicturePublicId"
  );
  if (!profile) throw ApiError.notFound("Applicant profile not found");
  if (!req.file) throw ApiError.badRequest("No image file provided");

  if (profile.profilePicturePublicId) {
    await cloudinary.uploader.destroy(profile.profilePicturePublicId).catch(() => {});
  }

  const result = await streamUpload(req.file.buffer, "job-portal/profile-pictures");
  profile.profilePicture = result.secure_url;
  profile.profilePicturePublicId = result.public_id;
  await profile.save();

  await recalculateApplicantProfileCompletion(req.user._id);

  return new ApiResponse(200, { profilePicture: profile.profilePicture }, "Profile picture updated").send(res);
});

// DELETE /api/applicants/profile-picture
const deleteProfilePicture = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id }).select(
    "+profilePicturePublicId"
  );
  if (!profile) throw ApiError.notFound("Applicant profile not found");
  if (!profile.profilePicture) throw ApiError.notFound("No profile picture to delete");

  if (profile.profilePicturePublicId) {
    await cloudinary.uploader.destroy(profile.profilePicturePublicId).catch(() => {});
  }
  profile.profilePicture = null;
  profile.profilePicturePublicId = undefined;
  await profile.save();

  await recalculateApplicantProfileCompletion(req.user._id);

  return new ApiResponse(200, null, "Profile picture removed").send(res);
});

// POST /api/applicants/resume
const uploadResume = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id }).select(
    "+resumePublicId"
  );
  if (!profile) throw ApiError.notFound("Applicant profile not found");
  if (!req.file) throw ApiError.badRequest("No resume file provided");
  if (profile.resume) {
    throw ApiError.conflict("Resume already exists. Use replace resume instead.");
  }

  const result = await streamUpload(req.file.buffer, "job-portal/resumes", "raw");
  profile.resume = result.secure_url;
  profile.resumePublicId = result.public_id;
  await profile.save();

  await recalculateApplicantProfileCompletion(req.user._id);

  return new ApiResponse(201, { resume: profile.resume }, "Resume uploaded").send(res);
});

// PATCH /api/applicants/resume
const replaceResume = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id }).select(
    "+resumePublicId"
  );
  if (!profile) throw ApiError.notFound("Applicant profile not found");
  if (!profile.resume) throw ApiError.notFound("No existing resume found");
  if (!req.file) throw ApiError.badRequest("No resume file provided");

  if (profile.resumePublicId) {
    await cloudinary.uploader.destroy(profile.resumePublicId, { resource_type: "raw" }).catch(() => {});
  }

  const result = await streamUpload(req.file.buffer, "job-portal/resumes", "raw");
  profile.resume = result.secure_url;
  profile.resumePublicId = result.public_id;
  await profile.save();

  return new ApiResponse(200, { resume: profile.resume }, "Resume replaced").send(res);
});

// DELETE /api/applicants/resume
const deleteResume = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findOne({ user: req.user._id }).select(
    "+resumePublicId"
  );
  if (!profile) throw ApiError.notFound("Applicant profile not found");
  if (!profile.resume) throw ApiError.notFound("No resume to delete");

  if (profile.resumePublicId) {
    await cloudinary.uploader.destroy(profile.resumePublicId, { resource_type: "raw" }).catch(() => {});
  }
  profile.resume = null;
  profile.resumePublicId = undefined;
  await profile.save();

  await recalculateApplicantProfileCompletion(req.user._id);

  return new ApiResponse(200, null, "Resume removed").send(res);
});

// GET /api/applicants/:id (public profile)
const getPublicProfile = asyncHandler(async (req, res) => {
  const profile = await ApplicantProfile.findById(req.params.id).populate(
    "user",
    "firstName lastName"
  );
  if (!profile) throw ApiError.notFound("Applicant profile not found");

  const publicFields = {
    _id: profile._id,
    user: profile.user,
    professionalHeadline: profile.professionalHeadline,
    bio: profile.bio,
    profilePicture: profile.profilePicture,
    state: profile.state,
    city: profile.city,
    currentJobTitle: profile.currentJobTitle,
    yearsOfExperience: profile.yearsOfExperience,
    portfolio: profile.portfolio,
    linkedin: profile.linkedin,
    github: profile.github,
  };

  return new ApiResponse(200, { profile: publicFields }).send(res);
});

// GET /api/applicants/profile/completion
const getProfileCompletion = asyncHandler(async (req, res) => {
  const completion = await recalculateApplicantProfileCompletion(req.user._id);
  return new ApiResponse(200, { profileCompletion: completion }).send(res);
});

module.exports = {
  getMyProfile,
  createProfile,
  updateProfile,
  uploadProfilePicture,
  deleteProfilePicture,
  uploadResume,
  replaceResume,
  deleteResume,
  getPublicProfile,
  getProfileCompletion,
};
