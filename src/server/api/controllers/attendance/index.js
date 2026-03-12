const router = require("express").Router();
const controller = require("./attendance.controller");
const AuthHelper = require("../auth/auth.helper");
const { hasAccess } = require("../../middleware/permissions.middleware");

const MODULE = "attendance";

router.get(
  "/org/list",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.orgList,
);

router.get(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.list,
);
router.put(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.update,
);

router.get(
  "/export/list",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.exportData,
);

module.exports = router;
