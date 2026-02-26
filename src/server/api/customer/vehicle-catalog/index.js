const router = require("express").Router();
const controller = require("./vehicle-catalog.controller");
const AuthHelper = require("../auth/auth.helper");

// Public endpoints (customer app) - still require auth for security
router.get("/brands", AuthHelper.authenticate, controller.listBrands);
router.get(
  "/brands/popular",
  AuthHelper.authenticate,
  controller.popularBrands,
);
router.get("/models", AuthHelper.authenticate, controller.listModels);
router.get("/search", AuthHelper.authenticate, controller.search);

module.exports = router;
