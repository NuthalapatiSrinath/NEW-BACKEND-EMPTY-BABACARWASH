"use strict";

const router = require("express").Router();
const controller = require("./admin-activities.controller");
const AuthHelper = require("../auth/auth.helper");

// All routes require admin authentication
router.post("/batch", AuthHelper.authenticate, controller.trackBatch);
router.get("/my-tracking", AuthHelper.authenticate, controller.getMyTracking);
router.get(
  "/all-admins",
  AuthHelper.authenticate,
  controller.getAllAdminsActivity,
);
router.get(
  "/admin/:adminId",
  AuthHelper.authenticate,
  controller.getAdminDetail,
);

module.exports = router;
