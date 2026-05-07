const path = require("path");
const fs = require("fs");
const StaffAppUpdatesModel = require("../../models/staff-app-updates.model");
const oracleService = require("../../../cloud/oracle");

const service = module.exports;

service.list = async () => {
  const data = await StaffAppUpdatesModel.find({})
    .sort({ createdAt: -1 })
    .lean();
  return { data, total: data.length };
};

service.latest = async () => {
  return StaffAppUpdatesModel.findOne({}).sort({ createdAt: -1 }).lean();
};

service.upload = async (userInfo, payload, fileData) => {
  const version = String(payload.version || "").trim();
  const buildNumber = String(payload.buildNumber || "").trim();
  const releaseNotes = String(payload.releaseNotes || "").trim();

  if (!version) {
    throw "VERSION_REQUIRED";
  }
  if (!fileData?.path) {
    throw "FILE_REQUIRED";
  }

  const ext =
    path.extname(fileData.filename || "").toLowerCase() ||
    path.extname(fileData.path || "").toLowerCase() ||
    ".apk";

  const safeVersion = version.replace(/[^0-9A-Za-z._-]/g, "");
  const safeBuild = buildNumber
    ? buildNumber.replace(/[^0-9A-Za-z._-]/g, "")
    : "build";

  const oracleFileName = `staff-app-${safeVersion}-${safeBuild}-${Date.now()}${ext}`;
  const publicUrl = await oracleService.uploadFile(fileData.path, oracleFileName, {
    contentDisposition: "attachment",
  });

  try {
    fs.unlinkSync(fileData.path);
  } catch (e) {}

  const update = await new StaffAppUpdatesModel({
    version,
    buildNumber: buildNumber || undefined,
    releaseNotes: releaseNotes || undefined,
    file: {
      url: publicUrl,
      filename: oracleFileName,
      originalName: fileData.filename,
      size: fileData.size,
      mimeType: fileData.mimetype,
    },
    uploadedBy: userInfo?._id,
    platform: "android",
  }).save();

  return update.toObject();
};
