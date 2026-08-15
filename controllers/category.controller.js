const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Category = require("../models/Category");
const Job = require("../models/Job");

// POST /api/categories (admin)
const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  const existing = await Category.findOne({ name });
  if (existing) throw ApiError.conflict("Category already exists");

  const category = await Category.create({ name, description });
  return new ApiResponse(201, { category }, "Category created").send(res);
});

// GET /api/categories
const getAllCategories = asyncHandler(async (req, res) => {
  const filter = { status: "active" };
  const categories = await Category.find(filter).sort({ name: 1 });

  const withCounts = await Promise.all(
    categories.map(async (c) => {
      const jobCount = await Job.countDocuments({
        category: c._id,
        status: "published",
        isActive: true,
      });
      return { ...c.toObject(), jobCount };
    })
  );

  return new ApiResponse(200, { categories: withCounts }).send(res);
});

// GET /api/categories/:id
const getCategoryDetails = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound("Category not found");
  if (category.status !== "active") throw ApiError.notFound("Category not found");

  const jobCount = await Job.countDocuments({
    category: category._id,
    status: "published",
    isActive: true,
  });

  return new ApiResponse(200, { category, jobCount }).send(res);
});

// PATCH /api/categories/:id (admin)
const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound("Category not found");

  if (req.body.name && req.body.name !== category.name) {
    const nameExists = await Category.findOne({ name: req.body.name, _id: { $ne: category._id } });
    if (nameExists) throw ApiError.conflict("Category name already exists");
  }

  Object.assign(category, req.body);
  await category.save();

  return new ApiResponse(200, { category }, "Category updated").send(res);
});

// PATCH /api/categories/:id/activate (admin)
const activateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound("Category not found");
  category.status = "active";
  await category.save();
  return new ApiResponse(200, { category }, "Category activated").send(res);
});

// PATCH /api/categories/:id/deactivate (admin)
const deactivateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound("Category not found");
  category.status = "inactive";
  await category.save();
  return new ApiResponse(200, { category }, "Category deactivated").send(res);
});

// DELETE /api/categories/:id (admin)
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound("Category not found");

  const jobCount = await Job.countDocuments({ category: category._id });
  if (jobCount > 0) throw ApiError.badRequest("Cannot delete a category that has jobs assigned");

  await category.deleteOne();
  return new ApiResponse(200, null, "Category deleted").send(res);
});

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryDetails,
  updateCategory,
  activateCategory,
  deactivateCategory,
  deleteCategory,
};
