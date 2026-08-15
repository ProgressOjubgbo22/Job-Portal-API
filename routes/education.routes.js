const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const controller = require("../controllers/education.controller");
const { educationSchema } = require("../validations/applicant.validation");

router.use(authenticate, authorize("applicant"));

router.post("/", validate(educationSchema), controller.create);
router.get("/", controller.list);
router.patch("/:id", validate(educationSchema.partial()), controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
