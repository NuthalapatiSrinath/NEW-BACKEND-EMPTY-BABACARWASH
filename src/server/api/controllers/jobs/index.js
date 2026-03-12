const router = require("express").Router();
const controller = require("./jobs.controller");
const AuthHelper = require("../auth/auth.helper");
const { hasAccess } = require("../../middleware/permissions.middleware");

const MODULE = "washes";

// ✅ Static/Specific Routes FIRST
router.get(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.list,
);
router.post(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "create"),
  controller.create,
);

router.get(
  "/export/list",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.exportData,
);
router.get(
  "/export/statement/monthly",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.monthlyStatement,
);
router.post(
  "/run-scheduler",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.runScheduler,
);

// ✅ Dynamic Parameter Routes LAST
// (This prevents "export" from being caught as an ":id")
router.delete(
  "/:id/undo",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"),
  controller.undoDelete,
); // Specific sub-resource
router.get(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.info,
);
router.put(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.update,
);
router.delete(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"),
  controller.delete,
);

module.exports = router;
