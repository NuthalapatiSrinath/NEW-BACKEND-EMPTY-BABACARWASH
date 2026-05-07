const StaffAppUpdatesModel = require("../../models/staff-app-updates.model");
const WorkersModel = require("../../models/workers.model");

const service = module.exports;

service.latest = async () => {
  return StaffAppUpdatesModel.findOne({}).sort({ createdAt: -1 }).lean();
};

service.markDownloaded = async (userInfo, updateId) => {
  const update = await StaffAppUpdatesModel.findById(updateId).lean();
  if (!update) {
    throw "NOT_FOUND";
  }

  const now = new Date();
  await WorkersModel.updateOne(
    { _id: userInfo._id },
    {
      $set: {
        "appUpdate.downloadedUpdateId": update._id,
        "appUpdate.downloadedVersion": update.version,
        "appUpdate.downloadedBuildNumber": update.buildNumber,
        "appUpdate.downloadedAt": now,
        "appUpdate.lastCheckAt": now,
      },
    },
  );

  return { updateId: update._id, downloadedAt: now };
};

service.reportInstalled = async (userInfo, payload = {}) => {
  const version = String(payload.version || "").trim();
  const buildNumber = String(payload.buildNumber || "").trim();
  const platform = String(payload.platform || "android").trim();

  if (!version) {
    throw "VERSION_REQUIRED";
  }

  const now = new Date();
  await WorkersModel.updateOne(
    { _id: userInfo._id },
    {
      $set: {
        "appUpdate.installedVersion": version,
        "appUpdate.installedBuildNumber": buildNumber || undefined,
        "appUpdate.installedAt": now,
        "appUpdate.platform": platform,
        "appUpdate.lastCheckAt": now,
      },
    },
  );

  return { installedAt: now };
};
