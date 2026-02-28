const CustomerActivity = require("../../models/customer-activity.model");
const CustomersModel = require("../../models/customers.model");
const controller = module.exports;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-activities/users-list
// Returns ONE row per customer with aggregated activity stats
// ─────────────────────────────────────────────────────────────────────────────
controller.getCustomersActivityList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      dateRange = "all",
      building,
      search,
    } = req.query;

    // Date filter
    const now = new Date();
    let startDate;
    if (dateRange === "today")
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (dateRange === "week") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (dateRange === "month") {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    }

    const matchQuery = {};
    if (startDate) matchQuery.timestamp = { $gte: startDate };

    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: "$customer",
          totalActivities: { $sum: 1 },
          lastSeen: { $max: "$timestamp" },
          firstSeen: { $min: "$timestamp" },
          uniqueSessions: { $addToSet: "$sessionId" },
          activityTypes: { $addToSet: "$activityType" },
          pageViews: {
            $sum: {
              $cond: [{ $eq: ["$activityType", "page_view"] }, 1, 0],
            },
          },
          logins: {
            $sum: { $cond: [{ $eq: ["$activityType", "login"] }, 1, 0] },
          },
          scrolls: {
            $sum: { $cond: [{ $eq: ["$activityType", "scroll"] }, 1, 0] },
          },
          clicks: {
            $sum: {
              $cond: [{ $eq: ["$activityType", "button_click"] }, 1, 0],
            },
          },
          totalDuration: { $sum: { $ifNull: ["$duration", 0] } },
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      {
        $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: false },
      },
      {
        $project: {
          customerId: "$_id",
          firstName: "$customerInfo.firstName",
          lastName: "$customerInfo.lastName",
          mobile: "$customerInfo.mobile",
          building: "$customerInfo.building",
          flat_no: "$customerInfo.flat_no",
          status: "$customerInfo.status",
          totalActivities: 1,
          lastSeen: 1,
          firstSeen: 1,
          sessionCount: { $size: "$uniqueSessions" },
          activityTypes: 1,
          pageViews: 1,
          logins: 1,
          scrolls: 1,
          clicks: 1,
          totalDuration: 1,
        },
      },
    ];

    // Building filter post-lookup
    if (building) {
      pipeline.push({ $match: { building: building } });
    }

    // Search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { mobile: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Count total before pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await CustomerActivity.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Sort and paginate
    pipeline.push({ $sort: { lastSeen: -1 } });
    pipeline.push({ $skip: (parseInt(page) - 1) * parseInt(limit) });
    pipeline.push({ $limit: parseInt(limit) });

    const customers = await CustomerActivity.aggregate(pipeline);

    return res.status(200).json({
      status: true,
      data: {
        customers,
        totalPages: Math.ceil(total / parseInt(limit)),
        total,
      },
    });
  } catch (err) {
    console.error("getCustomersActivityList error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error fetching customer activity list",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-activities/customer/:customerId
// Full detail for a single customer: info, stats, timeline, charts, sessions
// ─────────────────────────────────────────────────────────────────────────────
controller.getCustomerActivityDetail = async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      page = 1,
      limit = 30,
      dateRange = "all",
      startDate: qStart,
      endDate: qEnd,
      startTime,
      endTime,
    } = req.query;

    const customerInfo = await CustomersModel.findById(customerId).select(
      "-password -hPassword",
    );
    if (!customerInfo)
      return res
        .status(404)
        .json({ status: false, message: "Customer not found" });

    const matchQuery = { customer: customerInfo._id };

    // Custom date range takes priority
    if (qStart) {
      let gte = new Date(qStart);
      let lte = qEnd ? new Date(qEnd) : null;
      if (startTime) {
        const [h, m] = startTime.split(":").map(Number);
        gte.setHours(h, m, 0, 0);
      }
      if (lte && endTime) {
        const [h, m] = endTime.split(":").map(Number);
        lte.setHours(h, m, 59, 999);
      }
      matchQuery.timestamp = { $gte: gte };
      if (lte) matchQuery.timestamp.$lte = lte;
    } else {
      const now = new Date();
      let sd;
      if (dateRange === "today")
        sd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (dateRange === "week") {
        sd = new Date(now);
        sd.setDate(now.getDate() - 7);
      } else if (dateRange === "month") {
        sd = new Date(now);
        sd.setMonth(now.getMonth() - 1);
      }
      if (sd) matchQuery.timestamp = { $gte: sd };
    }

    // Activity breakdown by type
    const activityBreakdown = await CustomerActivity.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$activityType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Activity by hour (for heatmap)
    const activityByHour = await CustomerActivity.aggregate([
      { $match: matchQuery },
      { $group: { _id: { $hour: "$timestamp" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Activity by day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activityByDay = await CustomerActivity.aggregate([
      {
        $match: {
          customer: customerInfo._id,
          timestamp: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Top pages visited
    const topPages = await CustomerActivity.aggregate([
      {
        $match: {
          ...matchQuery,
          activityType: { $in: ["page_view", "screen_view", "screen_time"] },
        },
      },
      {
        $group: {
          _id: "$page.title",
          count: { $sum: 1 },
          path: { $first: "$page.path" },
          totalDuration: { $sum: { $ifNull: ["$duration", 0] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Interaction stats
    const interactionStats = await CustomerActivity.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalScrolls: {
            $sum: { $cond: [{ $eq: ["$activityType", "scroll"] }, 1, 0] },
          },
          totalClicks: {
            $sum: {
              $cond: [{ $eq: ["$activityType", "button_click"] }, 1, 0],
            },
          },
          totalPageViews: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$activityType",
                    ["page_view", "screen_view", "screen_time"],
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalLogins: {
            $sum: { $cond: [{ $eq: ["$activityType", "login"] }, 1, 0] },
          },
          totalScreenTime: {
            $sum: {
              $cond: [
                { $eq: ["$activityType", "screen_time"] },
                { $ifNull: ["$duration", 0] },
                0,
              ],
            },
          },
          totalDuration: { $sum: { $ifNull: ["$duration", 0] } },
          avgDuration: { $avg: { $ifNull: ["$duration", 0] } },
          uniqueSessions: { $addToSet: "$sessionId" },
        },
      },
    ]);

    // Device info (most recent)
    const deviceInfo = await CustomerActivity.findOne({
      customer: customerInfo._id,
    })
      .sort({ timestamp: -1 })
      .select("device location");

    // Paginated timeline
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [timeline, totalActivities] = await Promise.all([
      CustomerActivity.find(matchQuery)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      CustomerActivity.countDocuments(matchQuery),
    ]);

    const stats = interactionStats[0] || {};

    return res.status(200).json({
      status: true,
      data: {
        customer: customerInfo,
        stats: {
          totalActivities,
          sessionCount: stats.uniqueSessions?.length || 0,
          totalScrolls: stats.totalScrolls || 0,
          totalClicks: stats.totalClicks || 0,
          totalPageViews: stats.totalPageViews || 0,
          totalLogins: stats.totalLogins || 0,
          totalDuration: stats.totalDuration || 0,
          totalScreenTime: stats.totalScreenTime || 0,
          avgDuration: Math.round(stats.avgDuration || 0),
        },
        activityBreakdown,
        activityByHour,
        activityByDay,
        topPages,
        deviceInfo,
        timeline,
        totalPages: Math.ceil(totalActivities / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("getCustomerActivityDetail error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error fetching customer activity detail",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-activities/sessions/:customerId
// Session tracking data
// ─────────────────────────────────────────────────────────────────────────────
controller.getCustomerSessions = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { timeRange = "7days" } = req.query;

    const customerExists = await CustomersModel.findById(customerId);
    if (!customerExists) {
      return res
        .status(404)
        .json({ status: false, message: "Customer not found" });
    }

    const query = { customer: customerId };

    const now = new Date();
    let startDate;
    if (timeRange === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeRange === "3days") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 3);
    } else if (timeRange === "7days") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (timeRange === "30days") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
    } else if (timeRange === "90days") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 90);
    }
    if (startDate) query.timestamp = { $gte: startDate };

    // Group into sessions
    const activities = await CustomerActivity.find(query).sort({
      timestamp: 1,
    });

    const sessions = [];
    let currentSession = null;
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

    activities.forEach((activity) => {
      const activityTime = new Date(activity.timestamp).getTime();

      if (
        !currentSession ||
        activityTime - currentSession.lastActivityTime > SESSION_TIMEOUT ||
        (activity.sessionId && activity.sessionId !== currentSession.sessionId)
      ) {
        if (currentSession) sessions.push(currentSession);
        currentSession = {
          sessionId: activity.sessionId || `session-${sessions.length + 1}`,
          startTime: activity.timestamp,
          lastActivityTime: activityTime,
          endTime: activity.timestamp,
          duration: 0,
          activityCount: 1,
          activities: [activity.activityType],
        };
      } else {
        currentSession.endTime = activity.timestamp;
        currentSession.lastActivityTime = activityTime;
        currentSession.duration =
          (activityTime - new Date(currentSession.startTime).getTime()) / 1000;
        currentSession.activityCount += 1;
        currentSession.activities.push(activity.activityType);
      }
    });

    if (currentSession) sessions.push(currentSession);

    return res.status(200).json({
      status: true,
      data: {
        sessions,
        totalSessions: sessions.length,
        totalTime: sessions.reduce((sum, s) => sum + s.duration, 0),
      },
    });
  } catch (err) {
    console.error("getCustomerSessions error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error fetching customer sessions",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customer-activities/stats
// Overall customer activity stats
// ─────────────────────────────────────────────────────────────────────────────
controller.getStats = async (req, res) => {
  try {
    const totalActivities = await CustomerActivity.countDocuments();
    const uniqueCustomers = await CustomerActivity.distinct("customer");

    return res.status(200).json({
      status: true,
      data: {
        totalActivities,
        uniqueCustomers: uniqueCustomers.length,
      },
    });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch activity stats",
    });
  }
};
