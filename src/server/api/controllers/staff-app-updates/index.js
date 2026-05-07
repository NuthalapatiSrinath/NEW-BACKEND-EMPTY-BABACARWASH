const router = require("express").Router();
const controller = require("./staff-app-updates.controller");
const AuthHelper = require("../auth/auth.helper");
const UploadHelper = require("../../../helpers/upload.helper");

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return res
    .status(403)
    .json({ statusCode: 403, message: "Access denied. Admin only." });
};

router.get("/", AuthHelper.authenticate, adminOnly, controller.list);
router.get("/latest", AuthHelper.authenticate, adminOnly, controller.latest);
router.post(
  "/",
  AuthHelper.authenticate,
  adminOnly,
  UploadHelper.upload,
  controller.upload,
);

module.exports = router;
