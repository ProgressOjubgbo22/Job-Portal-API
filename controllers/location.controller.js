const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const locations = require("../config/nigeriaLocations");

// GET /api/locations - all Nigerian states with their cities
const getLocations = asyncHandler(async (req, res) => {
  return new ApiResponse(200, { locations }).send(res);
});

// GET /api/locations/states - just the state names
const getStates = asyncHandler(async (req, res) => {
  return new ApiResponse(200, { states: Object.keys(locations) }).send(res);
});

// GET /api/locations/:state/cities
const getCitiesForState = asyncHandler(async (req, res) => {
  const { state } = req.params;
  const cities = locations[state] || [];
  return new ApiResponse(200, { state, cities }).send(res);
});

module.exports = { getLocations, getStates, getCitiesForState };
