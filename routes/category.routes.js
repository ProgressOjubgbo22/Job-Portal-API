const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const categoryController = require("../controllers/category.controller");
const { categorySchema, updateCategorySchema } = require("../validations/category.validation");

router.get("/", categoryController.getAllCategories);
router.get("/:id", categoryController.getCategoryDetails);

router.use(authenticate, authorize("admin"));

router.post("/", validate(categorySchema), categoryController.createCategory);
router.patch("/:id", validate(updateCategorySchema), categoryController.updateCategory);
router.patch("/:id/activate", categoryController.activateCategory);
router.patch("/:id/deactivate", categoryController.deactivateCategory);
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;
