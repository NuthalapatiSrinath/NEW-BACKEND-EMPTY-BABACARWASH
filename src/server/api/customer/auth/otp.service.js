const moment = require("moment");
const OTPModel = require("../../models/otps.model");
const CustomersModel = require("../../models/customers.model");
const AuthHelper = require("./auth.helper");
const smsService = require("./sms.service");

const service = module.exports;

/**
 * Country code prefixes for flexible phone number matching
 */
const COUNTRY_CODES = [
  "971",
  "91",
  "966",
  "974",
  "965",
  "973",
  "968",
  "92",
  "880",
  "63",
];

/**
 * Find customer by mobile number with flexible matching
 * Tries: exact match, without country code, with different country codes
 */
service.findCustomerByMobile = async (mobile) => {
  // Normalize: remove + and spaces
  const normalizedMobile = mobile.replace(/[\s+\-]/g, "");

  // Try exact match first
  let customer = await CustomersModel.findOne({ mobile: normalizedMobile });
  if (customer) return { customer, matchedMobile: normalizedMobile };

  // Try with leading zeros stripped
  const noLeadingZero = normalizedMobile.replace(/^0+/, "");
  if (noLeadingZero !== normalizedMobile) {
    customer = await CustomersModel.findOne({ mobile: noLeadingZero });
    if (customer) return { customer, matchedMobile: noLeadingZero };
  }

  // Try extracting local number by stripping country codes
  for (const code of COUNTRY_CODES) {
    if (normalizedMobile.startsWith(code)) {
      const localNumber = normalizedMobile.slice(code.length);
      customer = await CustomersModel.findOne({ mobile: localNumber });
      if (customer) return { customer, matchedMobile: localNumber };
    }
  }

  // Try matching last 9-10 digits (common mobile length)
  if (normalizedMobile.length > 10) {
    const last10 = normalizedMobile.slice(-10);
    customer = await CustomersModel.findOne({ mobile: last10 });
    if (customer) return { customer, matchedMobile: last10 };

    const last9 = normalizedMobile.slice(-9);
    customer = await CustomersModel.findOne({ mobile: last9 });
    if (customer) return { customer, matchedMobile: last9 };
  }

  return { customer: null, matchedMobile: normalizedMobile };
};

/**
 * Generate a random 6-digit OTP
 */
service.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

/**
 * Send OTP to customer mobile
 * Supports international format with flexible matching
 */
service.sendOTP = async (mobile) => {
  try {
    // Find customer with flexible matching
    const { customer, matchedMobile } =
      await service.findCustomerByMobile(mobile);
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

    // Save OTP using the original mobile number sent (for verification)
    const normalizedMobile = mobile.replace(/[\s+\-]/g, "");
    await new OTPModel({
      mobile: normalizedMobile,
      otp,
      expiresAt,
      verified: false,
    }).save();

    // Send SMS via configured gateway (use full international number for SMS)
    try {
      await smsService.sendOTP(normalizedMobile, otp);
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
 * Supports international format with flexible matching
 */
service.verifyOTP = async (mobile, otp) => {
  try {
    // Normalize mobile number
    const normalizedMobile = mobile.replace(/[\s+\-]/g, "");

    // Find the latest OTP for this mobile
    const otpRecord = await OTPModel.findOne({
      mobile: normalizedMobile,
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

    // Get customer data using flexible matching
    const { customer } = await service.findCustomerByMobile(normalizedMobile);
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
 * Supports international format with flexible matching
 */
service.loginWithPassword = async (mobile, password) => {
  try {
    // Find customer with flexible matching
    const { customer } = await service.findCustomerByMobile(mobile);
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
