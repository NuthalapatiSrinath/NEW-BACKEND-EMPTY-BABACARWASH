const router = require("express").Router();
const controller = require("./app-updates.controller");
const AuthHelper = require("../auth/auth.helper");

router.get("/latest", AuthHelper.authenticate, controller.latest);
router.post("/:id/downloaded", AuthHelper.authenticate, controller.markDownloaded);
router.post("/installed", AuthHelper.authenticate, controller.reportInstalled);

module.exports = router;
