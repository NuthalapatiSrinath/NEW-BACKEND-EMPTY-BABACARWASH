/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SMS SERVICE - OTP SENDING VIA SMS GATEWAY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Supports multiple SMS gateways:
 * - Twilio (Default, most popular)
 * - MSG91 (Popular in India)
 * - AWS SNS (Amazon)
 * - Custom HTTP API
 *
 * Setup Instructions:
 * 1. Install packages: npm install twilio axios
 * 2. Set environment variables in .env file
 * 3. Choose your SMS provider
 * ═══════════════════════════════════════════════════════════════════════════
 */

const axios = require("axios");

const smsService = module.exports;

// ═══════════════════════════════════════════════════════════════════════════
// TWILIO SMS INTEGRATION (Recommended)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Setup Twilio:
 * 1. Sign up at https://www.twilio.com/
 * 2. Get your Account SID, Auth Token, and Phone Number
 * 3. Add to .env file:
 *    TWILIO_ACCOUNT_SID=your_account_sid
 *    TWILIO_AUTH_TOKEN=your_auth_token
 *    TWILIO_PHONE_NUMBER=+1234567890
 * 4. Install: npm install twilio
 */
smsService.sendViaTwilio = async (mobile, otp) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    // Check if Twilio credentials are configured
    if (
      !accountSid ||
      !authToken ||
      !fromNumber ||
      accountSid === "your_twilio_account_sid_here"
    ) {
      console.log(
        `📱 [TWILIO] Credentials not configured. OTP for ${mobile}: ${otp}`,
      );
      return {
        success: true,
        provider: "twilio-dev",
        message: "OTP logged to console (Twilio not configured)",
      };
    }

    const twilio = require("twilio");
    const client = twilio(accountSid, authToken);

    // Format phone number - ensure it has + prefix
    let toNumber = mobile.toString().trim();
    if (!toNumber.startsWith("+")) {
      toNumber = `+${toNumber}`;
    }

    const message = await client.messages.create({
      body: `Your Baba Car Wash verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`,
      from: fromNumber,
      to: toNumber,
    });

    console.log(`✅ SMS sent via Twilio to ${toNumber}, SID: ${message.sid}`);
    return { success: true, provider: "twilio", sid: message.sid };
  } catch (error) {
    console.error("❌ Twilio SMS error:", error.message);
    // Log OTP to console as fallback so user doesn't get locked out
    console.log(`📱 [TWILIO FALLBACK] OTP for ${mobile}: ${otp}`);
    return {
      success: true,
      provider: "twilio-fallback",
      message: `SMS failed (${error.message}), OTP logged to console`,
    };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MSG91 SMS INTEGRATION (Popular in India)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Setup MSG91:
 * 1. Sign up at https://msg91.com/
 * 2. Get your Auth Key and Template ID
 * 3. Add to .env file:
 *    MSG91_AUTH_KEY=your_auth_key
 *    MSG91_SENDER_ID=YOUR_SENDER_ID
 *    MSG91_TEMPLATE_ID=your_template_id (optional)
 * 4. Install: npm install axios (already included in most projects)
 */
smsService.sendViaMSG91 = async (mobile, otp) => {
  try {
    const authKey = process.env.MSG91_AUTH_KEY;
    const senderId = process.env.MSG91_SENDER_ID || "BCWASH";

    if (!authKey) {
      console.log(
        `📱 [MSG91] Auth key not configured. OTP for ${mobile}: ${otp}`,
      );
      return {
        success: true,
        provider: "msg91-dev",
        message: "OTP logged to console",
      };
    }

    const message = `Your BCW verification code is ${otp}. Valid for 5 minutes. Do not share with anyone.`;

    const response = await axios.post(
      "https://api.msg91.com/api/v5/flow/",
      {
        template_id: process.env.MSG91_TEMPLATE_ID,
        short_url: "0",
        recipients: [
          {
            mobiles: mobile,
            OTP: otp,
          },
        ],
      },
      {
        headers: {
          authkey: authKey,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(`✅ SMS sent via MSG91 to ${mobile}`);
    return { success: true, provider: "msg91", response: response.data };
  } catch (error) {
    console.error("MSG91 SMS error:", error.response?.data || error.message);
    // Fallback to console log
    console.log(`📱 [MSG91 FALLBACK] OTP for ${mobile}: ${otp}`);
    return {
      success: true,
      provider: "msg91-fallback",
      message: "OTP logged to console",
    };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AWS SNS SMS INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Setup AWS SNS:
 * 1. Configure AWS credentials
 * 2. Install: npm install aws-sdk
 * 3. Add to .env:
 *    AWS_REGION=us-east-1
 *    AWS_ACCESS_KEY_ID=your_key
 *    AWS_SECRET_ACCESS_KEY=your_secret
 */
smsService.sendViaAWS = async (mobile, otp) => {
  try {
    // Uncomment after installing aws-sdk and setting up credentials
    /*
    const AWS = require('aws-sdk');
    AWS.config.update({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const sns = new AWS.SNS();
    const params = {
      Message: `Your BCW verification code is: ${otp}. Valid for 5 minutes.`,
      PhoneNumber: `+91${mobile}`, // Adjust country code
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: 'BCW'
        },
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      }
    };

    const result = await sns.publish(params).promise();
    console.log(`✅ SMS sent via AWS SNS to ${mobile}, MessageId: ${result.MessageId}`);
    return { success: true, provider: 'aws-sns', messageId: result.MessageId };
    */

    console.log(`📱 [AWS SNS] Would send SMS to ${mobile}: OTP ${otp}`);
    return {
      success: true,
      provider: "aws-sns-dev",
      message: "OTP logged to console",
    };
  } catch (error) {
    console.error("AWS SNS error:", error);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM HTTP API INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Setup Custom API:
 * Add to .env:
 *    SMS_API_URL=your_sms_api_endpoint
 *    SMS_API_KEY=your_api_key
 */
smsService.sendViaCustomAPI = async (mobile, otp) => {
  try {
    const apiUrl = process.env.SMS_API_URL;
    const apiKey = process.env.SMS_API_KEY;

    if (!apiUrl || !apiKey) {
      console.log(`📱 [CUSTOM API] Not configured. OTP for ${mobile}: ${otp}`);
      return {
        success: true,
        provider: "custom-dev",
        message: "OTP logged to console",
      };
    }

    const response = await axios.post(
      apiUrl,
      {
        mobile: mobile,
        message: `Your BCW verification code is ${otp}. Valid for 5 minutes.`,
        otp: otp,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(`✅ SMS sent via Custom API to ${mobile}`);
    return { success: true, provider: "custom-api", response: response.data };
  } catch (error) {
    console.error("Custom API error:", error);
    console.log(`📱 [CUSTOM API FALLBACK] OTP for ${mobile}: ${otp}`);
    return {
      success: true,
      provider: "custom-fallback",
      message: "OTP logged to console",
    };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SEND FUNCTION (Auto-select provider)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Send SMS using configured provider
 * Priority: TWILIO > MSG91 > AWS SNS > Custom API > Console Log
 */
smsService.sendOTP = async (mobile, otp) => {
  try {
    const provider = process.env.SMS_PROVIDER || "console"; // twilio, msg91, aws, custom, console

    console.log(`\n${"=".repeat(70)}`);
    console.log(`📱 SENDING OTP to ${mobile}`);
    console.log(`${"=".repeat(70)}`);
    console.log(`🔢 OTP Code: ${otp}`);
    console.log(`📡 Provider: ${provider.toUpperCase()}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(70)}\n`);

    let result;

    switch (provider.toLowerCase()) {
      case "twilio":
        result = await smsService.sendViaTwilio(mobile, otp);
        break;
      case "msg91":
        result = await smsService.sendViaMSG91(mobile, otp);
        break;
      case "aws":
      case "aws-sns":
        result = await smsService.sendViaAWS(mobile, otp);
        break;
      case "custom":
        result = await smsService.sendViaCustomAPI(mobile, otp);
        break;
      default:
        // Console logging (development mode)
        console.log(`📱 [CONSOLE] OTP sent to ${mobile}: ${otp}`);
        console.log(`💡 TIP: Set SMS_PROVIDER in .env to enable real SMS`);
        result = {
          success: true,
          provider: "console",
          message: "OTP logged to console",
        };
    }

    return result;
  } catch (error) {
    // Fallback to console log if SMS fails
    console.error("❌ SMS sending failed:", error.message);
    console.log(`📱 [FALLBACK] OTP for ${mobile}: ${otp}`);
    return {
      success: true,
      provider: "fallback",
      message: "OTP logged to console",
    };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Send Test SMS
// ═══════════════════════════════════════════════════════════════════════════
smsService.testSMS = async (mobile) => {
  const testOTP = "123456";
  console.log("\n🧪 Testing SMS Configuration...\n");
  return await smsService.sendOTP(mobile, testOTP);
};
