const router = require("express").Router();
const controller = require("./customer-activities.controller");
const AuthHelper = require("../../controllers/auth/auth.helper");

// All admin activity routes require admin authentication
router.get(
  "/users-list",
  AuthHelper.authenticate,
  controller.getCustomersActivityList,
);
router.get(
  "/customer/:customerId",
  AuthHelper.authenticate,
  controller.getCustomerActivityDetail,
);
router.get(
  "/sessions/:customerId",
  AuthHelper.authenticate,
  controller.getCustomerSessions,
);
router.get("/stats", AuthHelper.authenticate, controller.getStats);

module.exports = router;
