const multer = require("multer");
const ApiError = require("../utils/apiError");

const storage = multer.memoryStorage();

const imageFileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(ApiError.badRequest("Only JPG, PNG, or WEBP images are allowed"));
};

const resumeFileFilter = (req, file, cb) => {
  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(ApiError.badRequest("Only PDF or Word documents are allowed for resumes"));
};

const uploadImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const uploadResume = multer({
  storage,
  fileFilter: resumeFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = { uploadImage, uploadResume };
