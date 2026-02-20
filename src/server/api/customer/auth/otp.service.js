const moment = require("moment");
const OTPModel = require("../../models/otps.model");
const CustomersModel = require("../../models/customers.model");
const AuthHelper = require("./auth.helper");
const smsService = require("./sms.service");

const service = module.exports;

/**
 * Generate a random 6-digit OTP
 */
service.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

/**
 * Send OTP to customer mobile
 * For now, just saves OTP to database
 * TODO: Integrate SMS gateway (Twilio, MSG91, etc.)
 */
service.sendOTP = async (mobile) => {
  try {
    // Check if customer exists
    const customer = await CustomersModel.findOne({ mobile });
    if (!customer) {
      throw "CUSTOMER_NOT_FOUND";
    }

    // Check if customer is active
    if (customer.isDeleted || customer.status === 0 || customer.status === 2) {
      throw "ACCOUNT_DEACTIVATED";
    }

    // Generate OTP
    const otp = service.generateOTP();
    const expiresAt = moment().add(5, "minutes").toDate();

    // Save OTP to database
    await new OTPModel({
      mobile,
      otp,
      expiresAt,
      verified: false,
    }).save();

    // Send SMS via configured gateway
    try {
      await smsService.sendOTP(mobile, otp);
    } catch (smsError) {
      console.error("SMS sending error:", smsError);
      // Continue even if SMS fails - OTP is still valid
    }

    return {
      message: "OTP sent successfully",
      // For development, return OTP (remove in production)
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verify OTP and return auth token
 */
service.verifyOTP = async (mobile, otp) => {
  try {
    // Find the latest OTP for this mobile
    const otpRecord = await OTPModel.findOne({
      mobile,
      otp: parseInt(otp),
      verified: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      throw "INVALID_OTP";
    }

    // Check if OTP expired
    if (moment().isAfter(otpRecord.expiresAt)) {
      throw "OTP_EXPIRED";
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Get customer data
    const customer = await CustomersModel.findOne({ mobile });
    if (!customer) {
      throw "CUSTOMER_NOT_FOUND";
    }

    // Check if customer is active
    if (customer.isDeleted || customer.status === 0 || customer.status === 2) {
      throw "ACCOUNT_DEACTIVATED";
    }

    // Generate auth token
    const token = AuthHelper.createToken({ _id: customer._id });

    const customerData = customer.toObject();
    delete customerData.hPassword;
    delete customerData.password;

    return { token, ...customerData };
  } catch (error) {
    throw error;
  }
};

/**
 * Login with password "00" for existing customers
 * OR verify actual password if set
 */
service.loginWithPassword = async (mobile, password) => {
  try {
    const customer = await CustomersModel.findOne({ mobile });
    if (!customer) {
      throw "UNAUTHORIZED";
    }

    // Check if customer is active
    if (customer.isDeleted || customer.status === 0 || customer.status === 2) {
      throw "ACCOUNT_DEACTIVATED";
    }

    // Allow password "00" for all customers as default
    // OR verify actual hashed password if customer has one
    const isDefaultPassword = password === "00";
    const isValidPassword =
      customer.hPassword &&
      AuthHelper.verifyPasswordHash(password, customer.hPassword);

    if (!isDefaultPassword && !isValidPassword) {
      throw "UNAUTHORIZED";
    }

    // Generate auth token
    const token = AuthHelper.createToken({ _id: customer._id });

    const customerData = customer.toObject();
    delete customerData.hPassword;
    delete customerData.password;

    return { token, ...customerData };
  } catch (error) {
    throw error;
  }
};
