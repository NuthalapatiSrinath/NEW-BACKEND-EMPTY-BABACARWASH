const service = require("./support-tickets.service");

const controller = module.exports;

const buildAttachments = (req, files = []) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = req.get("host");
  const baseUrl = host ? `${protocol}://${host}` : "";

  return Array.isArray(files)
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
};

controller.listMine = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.listMine(user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.create = async (req, res) => {
  try {
    const { user, body, files } = req;
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim();
    const protocol = forwardedProto || req.protocol || "http";
    const host = req.get("host");
    const baseUrl = host ? `${protocol}://${host}` : "";

    const attachments = Array.isArray(files)
      ? files.map((file) => {
          const relativePath = `/uploads/support-tickets/${file.filename}`;
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

    const data = await service.create(user, payload);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ statusCode: 400, message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.info = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.getMine(user, params.id);
    if (!data) {
      return res.status(404).json({ statusCode: 404, message: "Not found" });
    }
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.listMessages = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.listMessages(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.createMessage = async (req, res) => {
  try {
    const { user, body, files, params } = req;
    const attachments = buildAttachments(req, files);
    const payload = { ...body, attachments };
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

controller.reopen = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.reopen(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
