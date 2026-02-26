const router = require("express").Router();
const controller = require("./addresses.controller");
const AuthHelper = require("../auth/auth.helper");

router.get("/", AuthHelper.authenticate, controller.list);
router.post("/", AuthHelper.authenticate, controller.create);
router.put("/:id", AuthHelper.authenticate, controller.update);
router.put("/:id/default", AuthHelper.authenticate, controller.setDefault);
router.delete("/:id", AuthHelper.authenticate, controller.delete);

module.exports = router;
