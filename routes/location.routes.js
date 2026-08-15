const router = require("express").Router();
const locationController = require("../controllers/location.controller");

router.get("/", locationController.getLocations);
router.get("/states", locationController.getStates);
router.get("/:state/cities", locationController.getCitiesForState);

module.exports = router;
