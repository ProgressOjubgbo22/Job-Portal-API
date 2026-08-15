const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const Company = require("../models/Company");
const Job = require("../models/Job");
const { getPaginationOptions } = require("../utils/pagination");

// GET /api/admin/audit-logs
const getAllAuditLogs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.user) filter.user = req.query.user;
  if (req.query.action) filter.action = req.query.action;
  if (req.query.entity) filter.entity = req.query.entity;
  if (req.query.entityId) filter.entityId = req.query.entityId;
  if (req.query.ipAddress) filter.ipAddress = req.query.ipAddress;
  if (req.query.dateFrom || req.query.dateTo) {
    filter.createdAt = {};
    if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
  }

  const { page, limit } = getPaginationOptions(req.query, { createdAt: -1 });
  const result = await AuditLog.paginate(filter, {
    page,
    limit,
    sort: { createdAt: -1 },
    populate: [{ path: "user", select: "firstName lastName email role" }],
  });

  return new ApiResponse(200, result).send(res);
});

// GET /api/admin/audit-logs/:id
const getAuditLogDetails = asyncHandler(async (req, res) => {
  const log = await AuditLog.findById(req.params.id).populate("user", "firstName lastName email role");
  if (!log) throw ApiError.notFound("Audit log not found");

  return new ApiResponse(200, { log }).send(res);
});

// GET /api/admin/activity/user/:id
const getUserActivity = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound("User not found");

  const { page, limit } = getPaginationOptions(req.query, { createdAt: -1 });
  const result = await AuditLog.paginate(
    { user: user._id },
    { page, limit, sort: { createdAt: -1 } }
  );

  return new ApiResponse(200, result).send(res);
});

// GET /api/admin/activity/company/:id
const getCompanyActivity = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound("Company not found");

  const { page, limit } = getPaginationOptions(req.query, { createdAt: -1 });
  const result = await AuditLog.paginate(
    { entity: "Company", entityId: company._id },
    { page, limit, sort: { createdAt: -1 } }
  );

  return new ApiResponse(200, result).send(res);
});

// GET /api/admin/activity/job/:id
const getJobActivity = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");

  const { page, limit } = getPaginationOptions(req.query, { createdAt: -1 });
  const result = await AuditLog.paginate(
    { entity: "Job", entityId: job._id },
    { page, limit, sort: { createdAt: -1 } }
  );

  return new ApiResponse(200, result).send(res);
});

module.exports = {
  getAllAuditLogs,
  getAuditLogDetails,
  getUserActivity,
  getCompanyActivity,
  getJobActivity,
};
