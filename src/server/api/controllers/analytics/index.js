const router = require("express").Router();
const controller = require("./analytics.controller");
const AuthHelper = require("../auth/auth.helper");

router.get("/dashboard-all", AuthHelper.authenticate, controller.dashboardAll);
router.post("/admin", AuthHelper.authenticate, controller.admin);
router.post("/admin/charts", AuthHelper.authenticate, controller.charts);
router.post("/supervisors", AuthHelper.authenticate, controller.supervisors);
router.get(
  "/revenue-trends",
  AuthHelper.authenticate,
  controller.revenueTrends,
);
router.get("/top-workers", AuthHelper.authenticate, controller.topWorkers);
router.get(
  "/recent-activities",
  AuthHelper.authenticate,
  controller.recentActivities,
);
router.get(
  "/service-distribution",
  AuthHelper.authenticate,
  controller.serviceDistribution,
);
router.get(
  "/building-analytics",
  AuthHelper.authenticate,
  controller.buildingAnalytics,
);
router.get(
  "/comparative",
  AuthHelper.authenticate,
  controller.comparativeAnalytics,
);

module.exports = router;
