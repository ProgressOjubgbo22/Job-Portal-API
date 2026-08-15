const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const controller = require("../controllers/experience.controller");
const { experienceSchema } = require("../validations/applicant.validation");

router.use(authenticate, authorize("applicant"));

router.post("/", validate(experienceSchema), controller.create);
router.get("/", controller.list);
router.patch("/:id", validate(experienceSchema.partial()), controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
