const router = require("express").Router();
const controller = require("./staff-activities.controller");
const AuthHelper = require("../../controllers/auth/auth.helper");

// All admin activity routes require admin authentication
router.get(
  "/workers-list",
  AuthHelper.authenticate,
  controller.getWorkersActivityList,
);
router.get(
  "/worker/:workerId",
  AuthHelper.authenticate,
  controller.getWorkerActivityDetail,
);
router.get(
  "/sessions/:workerId",
  AuthHelper.authenticate,
  controller.getWorkerSessions,
);
router.get("/stats", AuthHelper.authenticate, controller.getStats);

module.exports = router;
