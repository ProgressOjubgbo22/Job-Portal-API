const ApplicantSkill = require("../models/ApplicantSkill");
const buildSubResourceControllers = require("./subResource.factory");

module.exports = buildSubResourceControllers(ApplicantSkill, "skill");
