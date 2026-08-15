const Education = require("../models/Education");
const buildSubResourceControllers = require("./subResource.factory");

module.exports = buildSubResourceControllers(Education, "education");
