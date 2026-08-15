const Experience = require("../models/Experience");
const buildSubResourceControllers = require("./subResource.factory");

module.exports = buildSubResourceControllers(Experience, "experience");
