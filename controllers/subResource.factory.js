const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const ApplicantProfile = require("../models/ApplicantProfile");
const {
  recalculateApplicantProfileCompletion,
} = require("../utils/profileCompletion");

/**
 * Builds a set of standard controllers (create, list, update, delete) for a
 * sub-resource of the applicant profile (Education, Experience, Certification).
 * Each document has an `applicant` field referencing ApplicantProfile._id.
 */
const buildSubResourceControllers = (Model, resourceName) => {
  const create = asyncHandler(async (req, res) => {
    const profile = await ApplicantProfile.findOne({ user: req.user._id });
    if (!profile) throw ApiError.notFound("Applicant profile not found. Create your profile first.");

    const doc = await Model.create({ applicant: profile._id, ...req.body });
    await recalculateApplicantProfileCompletion(req.user._id);

    return new ApiResponse(201, { [resourceName]: doc }, `${resourceName} added`).send(res);
  });

  const list = asyncHandler(async (req, res) => {
    const profile = await ApplicantProfile.findOne({ user: req.user._id });
    if (!profile) throw ApiError.notFound("Applicant profile not found");

    const docs = await Model.find({ applicant: profile._id }).sort({ startDate: -1, createdAt: -1 });
    return new ApiResponse(200, { [`${resourceName}s`]: docs }).send(res);
  });

  const update = asyncHandler(async (req, res) => {
    const profile = await ApplicantProfile.findOne({ user: req.user._id });
    if (!profile) throw ApiError.notFound("Applicant profile not found");

    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound(`${resourceName} not found`);
    if (String(doc.applicant) !== String(profile._id)) {
      throw ApiError.forbidden(`You do not have access to this ${resourceName}`);
    }

    Object.assign(doc, req.body);
    await doc.save();
    await recalculateApplicantProfileCompletion(req.user._id);

    return new ApiResponse(200, { [resourceName]: doc }, `${resourceName} updated`).send(res);
  });

  const remove = asyncHandler(async (req, res) => {
    const profile = await ApplicantProfile.findOne({ user: req.user._id });
    if (!profile) throw ApiError.notFound("Applicant profile not found");

    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound(`${resourceName} not found`);
    if (String(doc.applicant) !== String(profile._id)) {
      throw ApiError.forbidden(`You do not have access to this ${resourceName}`);
    }

    await doc.deleteOne();
    await recalculateApplicantProfileCompletion(req.user._id);

    return new ApiResponse(200, null, `${resourceName} deleted`).send(res);
  });

  return { create, list, update, remove };
};

module.exports = buildSubResourceControllers;
