const service = require("./notifications.service");
const controller = module.exports;

controller.registerDeviceToken = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.registerDeviceToken(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ statusCode: 400, message: error });
    }
    console.error(error);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

controller.removeDeviceToken = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.removeDeviceToken(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ statusCode: 400, message: error });
    }
    console.error(error);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

controller.listMyDeviceTokens = async (req, res) => {
  try {
    const { user } = req;
    const data = await service.listMyDeviceTokens(user);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

controller.inAppCount = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.inAppCount(user, query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.inApp = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.inApp(user, query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.getAllNotifications = async (req, res) => {
  try {
    const { user } = req;
    const data = await service.getAllNotifications(user);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.markAllAsRead = async (req, res) => {
  try {
    const { user } = req;
    const data = await service.markAllAsRead(user);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
