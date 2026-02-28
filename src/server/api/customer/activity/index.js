const router = require("express").Router();
const controller = require("./activity.controller");
const AuthHelper = require("../auth/auth.helper");

// All activity routes require customer authentication
router.post("/track", AuthHelper.authenticate, controller.track);
router.post("/batch", AuthHelper.authenticate, controller.trackBatch);
router.get("/my-journey", AuthHelper.authenticate, controller.myJourney);

module.exports = router;
