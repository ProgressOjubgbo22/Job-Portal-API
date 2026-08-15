const Certification = require("../models/Certification");
const buildSubResourceControllers = require("./subResource.factory");

module.exports = buildSubResourceControllers(Certification, "certification");
