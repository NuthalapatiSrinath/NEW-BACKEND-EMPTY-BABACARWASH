const CustomerActivity = require("../../models/customer-activity.model");
const controller = module.exports;

/**
 * POST /api/customer/activity/track
 * Track a single customer activity
 */
controller.track = async (req, res) => {
  try {
    const customerId = req.user?._id;
    if (!customerId) {
      return res
        .status(401)
        .json({
          status: false,
          message: "Unauthorized - Customer ID not found",
        });
    }

    const activityData = {
      customer: customerId,
      sessionId: req.body.sessionId || `session_${customerId}_${Date.now()}`,
      activityType: req.body.activityType,
      page: req.body.page,
      action: req.body.action,
      scroll: req.body.scroll,
      device: {
        userAgent: req.headers["user-agent"],
        platform: req.body.device?.platform,
        isMobile: req.body.device?.isMobile ?? true,
        screenWidth: req.body.device?.screenWidth,
        screenHeight: req.body.device?.screenHeight,
        appVersion: req.body.device?.appVersion,
        osVersion: req.body.device?.osVersion,
        deviceModel: req.body.device?.deviceModel,
      },
      location: {
        ip: req.ip || req.connection?.remoteAddress,
        country: req.body.location?.country,
        city: req.body.location?.city,
        latitude: req.body.location?.latitude,
        longitude: req.body.location?.longitude,
      },
      duration: req.body.duration,
      metadata: req.body.metadata,
    };

    const activity = await CustomerActivity.create(activityData);

    return res.status(201).json({
      status: true,
      message: "Activity tracked",
      data: activity,
    });
  } catch (err) {
    console.error("Customer activity track error:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to track activity",
    });
  }
};

/**
 * POST /api/customer/activity/batch
 * Track multiple activities in batch
 */
controller.trackBatch = async (req, res) => {
  try {
    const customerId = req.user?._id;
    if (!customerId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const { activities } = req.body;
    if (!activities || !Array.isArray(activities)) {
      return res
        .status(400)
        .json({ status: false, message: "Activities array is required" });
    }

    const activitiesData = activities.map((a) => ({
      customer: customerId,
      sessionId: a.sessionId || `session_${customerId}_${Date.now()}`,
      activityType: a.activityType,
      page: a.page,
      action: a.action,
      scroll: a.scroll,
      device: {
        userAgent: req.headers["user-agent"],
        ...a.device,
      },
      location: {
        ip: req.ip || req.connection?.remoteAddress,
        ...a.location,
      },
      duration: a.duration,
      metadata: a.metadata,
      timestamp: a.timestamp || new Date(),
    }));

    const saved = await CustomerActivity.insertMany(activitiesData);

    return res.status(201).json({
      status: true,
      message: `${saved.length} activities tracked`,
    });
  } catch (err) {
    console.error("Customer activity batch error:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to track batch activities",
    });
  }
};

/**
 * GET /api/customer/activity/my-journey
 * Customer sees their own activity journey
 */
controller.myJourney = async (req, res) => {
  try {
    const customerId = req.user?._id;
    const { startDate, endDate, activityType, limit = 100 } = req.query;

    const query = { customer: customerId };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    if (activityType) query.activityType = activityType;

    const activities = await CustomerActivity.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

    return res.status(200).json({
      status: true,
      data: activities,
      count: activities.length,
    });
  } catch (err) {
    console.error("Customer myJourney error:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch journey",
    });
  }
};
