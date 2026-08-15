const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const controller = require("../controllers/certification.controller");
const { certificationSchema } = require("../validations/applicant.validation");

router.use(authenticate, authorize("applicant"));

router.post("/", validate(certificationSchema), controller.create);
router.get("/", controller.list);
router.patch("/:id", validate(certificationSchema.partial()), controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
