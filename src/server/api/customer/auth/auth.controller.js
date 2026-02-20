const service = require("./auth.service");
const otpService = require("./otp.service");
const controller = module.exports;

controller.signup = async (req, res) => {
  try {
    const { body } = req;
    const data = await service.signup(body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error == "ALREADY-REGISTERED") {
      return res
        .status(401)
        .json({
          status: false,
          message: "The mobile is already regsitered. Please sign in.",
        });
    }

    console.error(error);
    return res
      .status(401)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.signin = async (req, res) => {
  try {
    const { body } = req;
    const data = await service.signin(body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error == "UNAUTHORIZED") {
      return res
        .status(401)
        .json({ statusCode: 401, message: "Invalid mobile or password" });
    }

    console.error(error);
    return res
      .status(401)
      .json({ statusCode: 500, message: "Internal server error", error });
  }
};

controller.forgotPassword = async (req, res) => {
  try {
    const { body } = req;
    const data = await service.forgotPassword(body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);

    if (error == "INVALID") {
      return res
        .status(401)
        .json({
          status: false,
          message: "Email is not registerd. Please try again",
        });
    }

    return res
      .status(401)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.resetPassword = async (req, res) => {
  try {
    const { body } = req;
    if (!body.token) {
      return res
        .status(400)
        .json({ statusCode: 200, message: "Token is required" });
    }
    const data = await service.resetPassword(body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);

    if (error == "INVALID") {
      return res
        .status(401)
        .json({ status: false, message: "Invalid token or expired" });
    }

    return res
      .status(401)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.forgotPassword = async (req, res) => {
  try {
    const { body } = req;
    const data = await service.forgotPassword(body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);

    if (error == "INVALID") {
      return res
        .status(401)
        .json({
          status: false,
          message: "Email is not registerd. Please try again",
        });
    }

    return res
      .status(401)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.me = async (req, res) => {
  try {
    const { user } = req;
    const data = await service.me(user);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    if (typeof error == "string") {
      return res.status(401).json({ status: false, message: error });
    }
    return res
      .status(401)
      .json({ status: false, message: "Internal server error", error });
  }
};

// OTP Login Controllers
controller.sendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile) {
      return res
        .status(400)
        .json({ statusCode: 400, message: "Mobile number is required" });
    }
    const data = await otpService.sendOTP(mobile);
    return res
      .status(200)
      .json({ statusCode: 200, message: "OTP sent successfully", data });
  } catch (error) {
    console.error("Send OTP error:", error);

    if (error === "CUSTOMER_NOT_FOUND") {
      return res
        .status(404)
        .json({ statusCode: 404, message: "Customer not found" });
    }

    if (error === "ACCOUNT_DEACTIVATED") {
      return res
        .status(403)
        .json({ statusCode: 403, message: "Account is deactivated" });
    }

    return res
      .status(500)
      .json({
        statusCode: 500,
        message: "Internal server error",
        error: error.toString(),
      });
  }
};

controller.verifyOTP = async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    if (!mobile || !otp) {
      return res
        .status(400)
        .json({ statusCode: 400, message: "Mobile and OTP are required" });
    }
    const data = await otpService.verifyOTP(mobile, otp);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Login successful", data });
  } catch (error) {
    console.error("Verify OTP error:", error);

    if (error === "INVALID_OTP") {
      return res.status(401).json({ statusCode: 401, message: "Invalid OTP" });
    }

    if (error === "OTP_EXPIRED") {
      return res
        .status(401)
        .json({
          statusCode: 401,
          message: "OTP expired. Please request a new one.",
        });
    }

    if (error === "CUSTOMER_NOT_FOUND") {
      return res
        .status(404)
        .json({ statusCode: 404, message: "Customer not found" });
    }

    if (error === "ACCOUNT_DEACTIVATED") {
      return res
        .status(403)
        .json({ statusCode: 403, message: "Account is deactivated" });
    }

    return res
      .status(500)
      .json({
        statusCode: 500,
        message: "Internal server error",
        error: error.toString(),
      });
  }
};

controller.loginWithPassword = async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password) {
      return res
        .status(400)
        .json({ statusCode: 400, message: "Mobile and password are required" });
    }
    const data = await otpService.loginWithPassword(mobile, password);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Login successful", data });
  } catch (error) {
    console.error("Login with password error:", error);

    if (error === "UNAUTHORIZED") {
      return res
        .status(401)
        .json({ statusCode: 401, message: "Invalid mobile or password" });
    }

    if (error === "ACCOUNT_DEACTIVATED") {
      return res
        .status(403)
        .json({ statusCode: 403, message: "ACCOUNT_DEACTIVATED" });
    }

    return res
      .status(500)
      .json({
        statusCode: 500,
        message: "Internal server error",
        error: error.toString(),
      });
  }
};
