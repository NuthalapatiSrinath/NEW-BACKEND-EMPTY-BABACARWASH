const service = require("./app-updates.service");
const controller = module.exports;

const ensureWorker = (user) => {
  const role = user?.role || "";
  return role === "worker" || role === "supervisor" || role === "";
};

controller.latest = async (req, res) => {
  try {
    const data = await service.latest();
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error("Staff App Updates Latest Error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.markDownloaded = async (req, res) => {
  try {
    if (!ensureWorker(req.user)) {
      return res
        .status(403)
        .json({ statusCode: 403, message: "Access denied" });
    }

    const data = await service.markDownloaded(req.user, req.params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error === "NOT_FOUND") {
      return res
        .status(404)
        .json({ statusCode: 404, message: "Update not found" });
    }
    console.error("Staff App Updates Downloaded Error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.reportInstalled = async (req, res) => {
  try {
    if (!ensureWorker(req.user)) {
      return res
        .status(403)
        .json({ statusCode: 403, message: "Access denied" });
    }

    const data = await service.reportInstalled(req.user, req.body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error === "VERSION_REQUIRED") {
      return res
        .status(400)
        .json({ statusCode: 400, message: "Version is required" });
    }
    console.error("Staff App Updates Installed Error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
