const service = require("./support-tickets.service");

const controller = module.exports;

controller.list = async (req, res) => {
  try {
    const { query } = req;
    const data = await service.list(query);
    return res.status(200).json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.info = async (req, res) => {
  try {
    const data = await service.info(req.params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.update = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.update(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error === "INVALID_STATUS") {
      return res.status(400).json({ statusCode: 400, message: "Invalid status" });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.listMessages = async (req, res) => {
  try {
    const data = await service.listMessages(req.params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.createMessage = async (req, res) => {
  try {
    const { user, body, files, params } = req;

    const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim();
    const protocol = forwardedProto || req.protocol || "http";
    const host = req.get("host");
    const baseUrl = host ? `${protocol}://${host}` : "";

    const attachments = Array.isArray(files)
      ? files.map((file) => {
          const relativePath = `/uploads/support-ticket-messages/${file.filename}`;
          const url = baseUrl ? `${baseUrl}${relativePath}` : relativePath;
          return {
            originalName: file.originalname,
            filename: file.filename,
            relativePath,
            url,
            mimetype: file.mimetype,
            size: file.size,
          };
        })
      : [];

    const payload = {
      ...body,
      attachments,
    };

    const data = await service.createMessage(user, params.id, payload);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ statusCode: 400, message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
