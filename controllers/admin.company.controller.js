const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Company = require("../models/Company");
const Recruiter = require("../models/Recruiter");
const Job = require("../models/Job");
const { getPaginationOptions } = require("../utils/pagination");
const { logAction } = require("../utils/auditLog");
const { notifyUser } = require("../utils/notify");

// GET /api/admin/companies
const getAllCompanies = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.industry) filter.industry = req.query.industry;
  if (req.query.state) filter.state = req.query.state;
  if (req.query.verificationStatus) filter.verificationStatus = req.query.verificationStatus;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) filter.$text = { $search: req.query.search };

  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Company.paginate(filter, { page, limit, sort });

  return new ApiResponse(200, result).send(res);
});

// GET /api/admin/companies/:id
const getCompanyDetails = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");

  const [recruiters, jobs, jobCount, applicationCount] = await Promise.all([
    Recruiter.find({ company: company._id }).populate("user", "firstName lastName email status"),
    Job.find({ company: company._id }).select("title status applicationsCount"),
    Job.countDocuments({ company: company._id }),
    Job.aggregate([
      { $match: { company: company._id } },
      { $group: { _id: null, total: { $sum: "$applicationsCount" } } },
    ]),
  ]);

  return new ApiResponse(200, {
    company,
    recruiters,
    jobs,
    statistics: { jobCount, applicationCount: applicationCount[0]?.total || 0 },
  }).send(res);
});

// POST /api/admin/companies
const createCompany = asyncHandler(async (req, res) => {
  const existing = await Company.findOne({ name: req.body.name });
  if (existing) throw ApiError.conflict("A company with this name already exists");

  const company = await Company.create({ ...req.body, createdBy: req.user._id });

  await logAction({ req, action: "create_company", entity: "Company", entityId: company._id });

  return new ApiResponse(201, { company }, "Company created").send(res);
});

// PATCH /api/admin/companies/:id
const updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");

  if (req.body.name && req.body.name !== company.name) {
    const conflict = await Company.findOne({ name: req.body.name, _id: { $ne: company._id } });
    if (conflict) throw ApiError.conflict("A company with this name already exists");
  }

  Object.assign(company, req.body);
  await company.save();

  await logAction({ req, action: "update_company", entity: "Company", entityId: company._id });

  return new ApiResponse(200, { company }, "Company updated").send(res);
});

// PATCH /api/admin/companies/:id/verify
const verifyCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");
  if (company.verificationStatus === "verified") throw ApiError.badRequest("Company is already verified");

  company.verificationStatus = "verified";
  company.verifiedAt = new Date();
  company.verifiedBy = req.user._id;
  company.rejectionReason = undefined;
  await company.save();

  await logAction({ req, action: "verify_company", entity: "Company", entityId: company._id });

  const owner = await Recruiter.findOne({ company: company._id, isOwner: true }).populate("user");
  if (owner?.user) {
    await notifyUser({
      user: owner.user._id,
      title: "Company verified",
      message: `${company.name} has been verified. You can now publish jobs.`,
      type: "recruiter",
    });
  }

  return new ApiResponse(200, { company }, "Company verified").send(res);
});

// PATCH /api/admin/companies/:id/reject
const rejectCompanyVerification = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");
  if (company.verificationStatus === "verified") throw ApiError.badRequest("Company is already verified");
  if (!req.body.reason) throw ApiError.badRequest("A rejection reason is required");

  company.verificationStatus = "rejected";
  company.rejectionReason = req.body.reason;
  await company.save();

  await logAction({
    req,
    action: "reject_company_verification",
    entity: "Company",
    entityId: company._id,
    description: req.body.reason,
  });

  const owner = await Recruiter.findOne({ company: company._id, isOwner: true }).populate("user");
  if (owner?.user) {
    await notifyUser({
      user: owner.user._id,
      title: "Company verification rejected",
      message: `${company.name}'s verification was rejected. Reason: ${req.body.reason}`,
      type: "recruiter",
    });
  }

  return new ApiResponse(200, { company }, "Company verification rejected").send(res);
});

// PATCH /api/admin/companies/:id/suspend
const suspendCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");
  if (company.status === "suspended") throw ApiError.badRequest("Company is already suspended");
  if (!req.body.reason) throw ApiError.badRequest("A suspension reason is required");

  company.status = "suspended";
  company.suspensionReason = req.body.reason;
  company.suspendedAt = new Date();
  await company.save();

  await Job.updateMany({ company: company._id, status: "published" }, { isActive: false });

  await logAction({
    req,
    action: "suspend_company",
    entity: "Company",
    entityId: company._id,
    description: req.body.reason,
  });

  const owner = await Recruiter.findOne({ company: company._id, isOwner: true }).populate("user");
  if (owner?.user) {
    await notifyUser({
      user: owner.user._id,
      title: "Company suspended",
      message: `${company.name} has been suspended. Reason: ${req.body.reason}`,
      type: "recruiter",
    });
  }

  return new ApiResponse(200, { company }, "Company suspended").send(res);
});

// PATCH /api/admin/companies/:id/activate
const activateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");
  if (company.status === "active") throw ApiError.badRequest("Company is already active");

  company.status = "active";
  company.suspensionReason = undefined;
  company.suspendedAt = undefined;
  await company.save();

  const eligibleJobs = await Job.find({
    company: company._id,
    status: "published",
    applicationDeadline: { $gte: new Date() },
  });
  await Job.updateMany(
    { _id: { $in: eligibleJobs.map((j) => j._id) } },
    { isActive: true }
  );

  await logAction({ req, action: "activate_company", entity: "Company", entityId: company._id });

  return new ApiResponse(200, { company }, "Company activated").send(res);
});

// DELETE /api/admin/companies/:id
const deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");

  const hasActiveJobs = await Job.exists({ company: company._id, status: { $in: ["published", "draft"] } });

  if (hasActiveJobs) {
    company.status = "suspended";
    company.suspensionReason = "Company deleted by admin (soft delete due to active jobs)";
    await company.save();
  } else {
    await company.deleteOne();
  }

  await logAction({
    req,
    action: "delete_company",
    entity: "Company",
    entityId: company._id,
    description: hasActiveJobs ? "Soft-deleted" : "Hard-deleted",
  });

  return new ApiResponse(200, null, "Company deleted").send(res);
});

// GET /api/admin/companies/:id/recruiters
const getCompanyRecruiters = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");

  const recruiters = await Recruiter.find({ company: company._id }).populate(
    "user",
    "firstName lastName email status"
  );

  return new ApiResponse(200, { recruiters }).send(res);
});

// GET /api/admin/companies/:id/jobs
const getCompanyJobs = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");

  const { page, limit, sort } = getPaginationOptions(req.query);
  const result = await Job.paginate({ company: company._id }, { page, limit, sort, populate: [{ path: "category", select: "name" }] });

  return new ApiResponse(200, result).send(res);
});

module.exports = {
  getAllCompanies,
  getCompanyDetails,
  createCompany,
  updateCompany,
  verifyCompany,
  rejectCompanyVerification,
  suspendCompany,
  activateCompany,
  deleteCompany,
  getCompanyRecruiters,
  getCompanyJobs,
};
