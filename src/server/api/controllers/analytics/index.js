const router = require("express").Router();
const controller = require("./analytics.controller");
const AuthHelper = require("../auth/auth.helper");

// ⚡ ULTRA-FAST Unified Dashboard Endpoint - Returns ALL data in one optimized call (< 2 seconds)
// This is the PRIMARY endpoint - all dashboard data in parallel
router.get("/dashboard-all", AuthHelper.authenticate, controller.dashboardAll);

// ========== LEGACY ROUTES (for backward compatibility) ==========
// Use dashboard-all instead for best performance
router.post("/admin", AuthHelper.authenticate, controller.admin);
router.post("/admin/charts", AuthHelper.authenticate, controller.charts);
router.post("/supervisors", AuthHelper.authenticate, controller.supervisors);
router.get("/revenue-trends", AuthHelper.authenticate, controller.revenueTrends);
router.get("/top-workers", AuthHelper.authenticate, controller.topWorkers);
router.get("/recent-activities", AuthHelper.authenticate, controller.recentActivities);
router.get("/service-distribution", AuthHelper.authenticate, controller.serviceDistribution);
router.get("/building-analytics", AuthHelper.authenticate, controller.buildingAnalytics);
router.get("/comparative", AuthHelper.authenticate, controller.comparativeAnalytics);

module.exports = router;
