const service = require("./staff-app-updates.service");
const controller = module.exports;

controller.list = async (req, res) => {
  try {
    const data = await service.list();
    return res.status(200).json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error("Staff App Updates List Error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
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

controller.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const uploadedFile = req.file;
    const fileData = {
      filename:
        uploadedFile.originalFilename ||
        uploadedFile.name ||
        uploadedFile.filename,
      path: uploadedFile.filepath || uploadedFile.path,
      mimetype: uploadedFile.mimetype,
      size: uploadedFile.size,
    };

    const data = await service.upload(req.user, req.body, fileData);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error === "VERSION_REQUIRED") {
      return res
        .status(400)
        .json({ statusCode: 400, message: "Version is required" });
    }
    console.error("Staff App Updates Upload Error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
