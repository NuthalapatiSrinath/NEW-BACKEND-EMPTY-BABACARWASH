const InAppNotificationsModel = require("../../models/in-app-notifications.model");
const UsersModel = require("../../models/users.model");
const StaffDeviceTokenModel = require("../../models/staff-device-tokens.model");

const service = module.exports;

service.registerDeviceToken = async (userInfo, payload = {}) => {
  const token = String(payload.token || "").trim();
  const platform = String(payload.platform || "android")
    .trim()
    .toLowerCase();
  const appVersion = String(payload.appVersion || "").trim();
  const deviceInfo = String(payload.deviceInfo || "").trim();

  if (!token) throw "Device token is required";

  const allowedPlatforms = ["android", "ios", "web"];
  const platformValue = allowedPlatforms.includes(platform)
    ? platform
    : "android";

  const data = await StaffDeviceTokenModel.findOneAndUpdate(
    { token },
    {
      $set: {
        worker: String(userInfo._id),
        token,
        platform: platformValue,
        appVersion,
        deviceInfo,
        isActive: true,
        lastSeenAt: new Date(),
        invalidatedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return data;
};

service.removeDeviceToken = async (userInfo, payload = {}) => {
  const token = String(payload.token || "").trim();
  if (!token) throw "Device token is required";

  await StaffDeviceTokenModel.updateOne(
    { worker: String(userInfo._id), token },
    {
      $set: {
        isActive: false,
        invalidatedAt: new Date(),
      },
    },
  );

  return { success: true };
};

service.listMyDeviceTokens = async (userInfo) => {
  return StaffDeviceTokenModel.find(
    { worker: String(userInfo._id) },
    {
      token: 1,
      platform: 1,
      appVersion: 1,
      deviceInfo: 1,
      isActive: 1,
      lastSeenAt: 1,
    },
  )
    .sort({ updatedAt: -1 })
    .lean();
};

service.inAppCount = async (userInfo) => {
  if (!userInfo || !userInfo._id) {
    console.error(
      "⚠️ [NOTIFICATIONS] userInfo or userInfo._id is null/undefined",
    );
    return 0;
  }
  return InAppNotificationsModel.countDocuments({
    worker: userInfo._id,
    isRead: false,
  });
};

service.inApp = async (userInfo) => {
  if (!userInfo || !userInfo._id) {
    console.error(
      "⚠️ [NOTIFICATIONS] userInfo or userInfo._id is null/undefined",
    );
    return [];
  }
  const data = await InAppNotificationsModel.find({
    worker: userInfo._id,
    isRead: false,
  }).sort({ _id: -1 });
  await InAppNotificationsModel.updateMany(
    { _id: data.map((e) => e._id) },
    { $set: { isRead: true } },
  );
  return data;
};

/**
 * Get all notifications (read + unread) with role-based filtering
 * - Supervisors see ALL notifications
 * - Admins/Managers see only admin/manager-created notifications (NOT supervisor ones)
 */
service.getAllNotifications = async (userInfo) => {
  if (!userInfo || !userInfo._id) {
    console.error(
      "⚠️ [NOTIFICATIONS] userInfo or userInfo._id is null/undefined",
    );
    return [];
  }

  try {
    // Get all notifications for this user
    const allNotifications = await InAppNotificationsModel.find({
      worker: userInfo._id,
    }).sort({ _id: -1 });

    // If user is a supervisor, return all notifications
    if (userInfo.role === "supervisor") {
      return allNotifications;
    }

    // If user is admin/manager, filter out supervisor-created notifications
    if (userInfo.role === "admin" || userInfo.role === "manager") {
      // Get creator IDs
      const creatorIds = [
        ...new Set(allNotifications.map((n) => n.createdBy).filter(Boolean)),
      ];

      // Fetch creator roles in one query
      const creators = await UsersModel.find(
        { _id: { $in: creatorIds } },
        { _id: 1, role: 1 },
      );

      // Create a map of userId -> role
      const roleMap = {};
      creators.forEach((creator) => {
        roleMap[creator._id.toString()] = creator.role;
      });

      // Filter notifications: exclude those created by supervisors
      const filtered = allNotifications.filter((notification) => {
        if (!notification.createdBy) return true; // Include system notifications
        const creatorRole = roleMap[notification.createdBy.toString()];
        return creatorRole !== "supervisor"; // Exclude supervisor-created notifications
      });

      return filtered;
    }

    // Default: return all notifications
    return allNotifications;
  } catch (error) {
    console.error("⚠️ [NOTIFICATIONS] Error in getAllNotifications:", error);
    return [];
  }
};

/**
 * Mark all notifications as read for the current user
 */
service.markAllAsRead = async (userInfo) => {
  if (!userInfo || !userInfo._id) {
    console.error(
      "⚠️ [NOTIFICATIONS] userInfo or userInfo._id is null/undefined",
    );
    return { modifiedCount: 0 };
  }

  try {
    const result = await InAppNotificationsModel.updateMany(
      { worker: userInfo._id, isRead: false },
      { $set: { isRead: true } },
    );
    return result;
  } catch (error) {
    console.error("⚠️ [NOTIFICATIONS] Error in markAllAsRead:", error);
    throw error;
  }
};
