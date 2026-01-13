const router = require("express").Router();
const controller = require("./users.controller");
const AuthHelper = require("../auth/auth.helper");

// ✅ Oracle Cloud Upload Helper (replaces AWS)
const { oracle } = require("../../../cloud");

// Middleware wrapper to keep same behavior as AWS UploadImages
const OracleUploadMiddleware = async (req, res, next) => {
  try {
    if (!req.file) return next();
    const url = await oracle.uploadFile(req.file.path, req.file.originalname);
    req.body.profileImage = url; // same behavior as before
    next();
  } catch (err) {
    console.error("Oracle upload error:", err);
    res.status(500).json({ error: "File upload failed" });
  }
};

router.post(
  "/set-permissions",
  AuthHelper.authenticate,
  controller.setPermissions
);

router.get("/", controller.list);
router.get("/:id", controller.info);
router.get("/:id/accountId", controller.infoByAccountId);
router.get("/team/list", AuthHelper.authenticate, controller.team);

router.get("/me/info", AuthHelper.authenticate, controller.me);

// ✅ Same route, now uses Oracle instead of AWS
router.put(
  "/",
  AuthHelper.authenticate,
  OracleUploadMiddleware,
  controller.update
);

router.put("/invite-team", AuthHelper.authenticate, controller.inviteTeam);

router.get("/team/export/list", AuthHelper.authenticate, controller.exportData);

module.exports = router;
