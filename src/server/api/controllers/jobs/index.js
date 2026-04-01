const router = require("express").Router();
const controller = require("./jobs.controller");
const AuthHelper = require("../auth/auth.helper");
const { hasAccess } = require("../../middleware/permissions.middleware");

const MODULE = "washes";

const allowSupervisorOrAccess = (actionType) => {
  const permissionGuard = hasAccess(MODULE, actionType);
  return (req, res, next) => {
    if (req.user?.role === "supervisor") {
      return next();
    }
    return permissionGuard(req, res, next);
  };
};

// ✅ Static/Specific Routes FIRST
router.get(
  "/",
  AuthHelper.authenticate,
  allowSupervisorOrAccess("view"),
  controller.list,
);
router.post(
  "/",
  AuthHelper.authenticate,
  allowSupervisorOrAccess("create"),
  controller.create,
);

router.get(
  "/export/list",
  AuthHelper.authenticate,
  allowSupervisorOrAccess("view"),
  controller.exportData,
);
router.get(
  "/export/statement/monthly",
  AuthHelper.authenticate,
  allowSupervisorOrAccess("view"),
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
  allowSupervisorOrAccess("delete"),
  controller.undoDelete,
); // Specific sub-resource
router.get(
  "/:id",
  AuthHelper.authenticate,
  allowSupervisorOrAccess("view"),
  controller.info,
);
router.put(
  "/:id",
  AuthHelper.authenticate,
  allowSupervisorOrAccess("edit"),
  controller.update,
);
router.delete(
  "/:id",
  AuthHelper.authenticate,
  allowSupervisorOrAccess("delete"),
  controller.delete,
);

module.exports = router;
