const router = require("express").Router();
const controller = require("./auth.controller");
const AuthHelper = require("../auth/auth.helper");

router.post("/signup", controller.signup);
router.post("/signin", controller.signin);

// OTP Login Routes
router.post("/send-otp", controller.sendOTP);
router.post("/verify-otp", controller.verifyOTP);
router.post("/login-password", controller.loginWithPassword);

router.get("/me", AuthHelper.authenticate, controller.me);
router.put(
  "/update-profile",
  AuthHelper.authenticate,
  controller.updateProfile,
);

module.exports = router;
