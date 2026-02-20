const crypto = require("crypto");
const jsonwebtoken = require("jsonwebtoken");
const CustomersModel = require("../../models/customers.model");
const config = require("../../../utils/config");
const helper = module.exports;

helper.getPasswordHash = (password) => {
  const salt = crypto.randomBytes(16).toString("base64");
  return `${salt}$f$${crypto
    .pbkdf2Sync(password, Buffer.from(salt, "base64"), 10000, 64, "sha512")
    .toString("base64")}`;
};

helper.verifyPasswordHash = (password, passwordHash) => {
  if (!password || !passwordHash) {
    return false;
  }
  const [salt, hash] = passwordHash.split("$f$");
  const cHash = crypto
    .pbkdf2Sync(password, Buffer.from(salt, "base64"), 10000, 64, "sha512")
    .toString("base64");
  return cHash === hash;
};

helper.createToken = (data, options) => {
  const options2 = options || {};
  return jsonwebtoken.sign(data, config.keys.secret, options2);
};

helper.verifyToken = (data) => {
  return jsonwebtoken.verify(data, config.keys.secret);
};

helper.authenticate = async (req, res, next) => {
  try {
    const { headers } = req;
    const data = jsonwebtoken.verify(headers.authorization, config.keys.secret);

    if (data) {
      const user = await CustomersModel.findOne({ _id: data._id }).lean();

      // Check if user exists
      if (!user) {
        return res
          .status(401)
          .json({ statusCode: 401, message: "UNAUTHORIZED" });
      }

      // Check if customer is deleted
      if (user.isDeleted) {
        return res
          .status(403)
          .json({ statusCode: 403, message: "ACCOUNT_DEACTIVATED" });
      }

      // Check if customer status is inactive (status 0 or 2 = inactive, 1 = active)
      // Some parts use 0=inactive, others use 2=inactive, so check both
      if (user.status === 0 || user.status === 2) {
        return res
          .status(403)
          .json({ statusCode: 403, message: "ACCOUNT_DEACTIVATED" });
      }

      req.user = user;
      return next();
    }

    res.status(401).json({ statusCode: 401, message: "UNAUTHORIZED" });
  } catch (error) {
    res.status(401).json({ statusCode: 401, message: "UNAUTHORIZED" });
  }
};
