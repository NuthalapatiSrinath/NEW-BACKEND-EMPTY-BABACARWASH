const SupportTicketsModel = require("../../models/support-tickets.model");
const SupportTicketMessagesModel = require("../../models/support-ticket-messages.model");
const StaffDeviceTokenModel = require("../../models/staff-device-tokens.model");
const InAppNotificationsModel = require("../../models/in-app-notifications.model");
const pushNotifications = require("../../../notifications/push.notifications");

const service = module.exports;

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const normalizeRoute = (value) => {
  const route = String(value || "/notifications").trim();
  if (!route) return "/notifications";
  return route.startsWith("/") ? route : `/${route}`;
};

const buildStatusMessage = (ticket, status) => {
  const ticketId = ticket?.id ? `#${ticket.id}` : "your ticket";
  if (status === "resolved") {
    return `${ticketId} has been resolved by the support team.`;
  }
  return `${ticketId} has been reopened. Our team will review it again.`;
};

const notifyStatusChange = async ({ ticket, status, userInfo }) => {
  if (!ticket || !ticket.worker) return;

  const title = "Support Ticket Update";
  const message = buildStatusMessage(ticket, status);
  const route = normalizeRoute("/support_ticket");
  const dataPayload = {
    type: "support_ticket_status",
    ticketId: String(ticket._id || ""),
    status,
    route,
  };

  try {
    await InAppNotificationsModel.create({
      worker: String(ticket.worker),
      title,
      message,
      type: "support_ticket_status",
      route,
      data: dataPayload,
      isRead: false,
      createdBy: userInfo?._id ? String(userInfo._id) : "",
      updatedBy: userInfo?._id ? String(userInfo._id) : "",
      sentAt: new Date(),
    });
  } catch (error) {
    console.error("Support ticket notification persist failed:", error);
  }

  const tokenRows = await StaffDeviceTokenModel.find(
    { worker: String(ticket.worker), isActive: true },
    { token: 1 },
  ).lean();

  const tokens = tokenRows.map((row) => row.token).filter(Boolean);
  if (!pushNotifications.isConfigured() || tokens.length === 0) return;

  try {
    const sendResult = await pushNotifications.sendToTokens({
      tokens,
      title,
      body: message,
      data: dataPayload,
      channelId: "bcw_staff_high_importance",
    });

    if (sendResult.invalidTokens.length > 0) {
      await StaffDeviceTokenModel.updateMany(
        { token: { $in: sendResult.invalidTokens } },
        { $set: { isActive: false, invalidatedAt: new Date() } },
      );
    }
  } catch (error) {
    console.error("Support ticket push failed:", error);
  }
};

const notifyMessage = async ({ ticket, message, userInfo }) => {
  if (!ticket || !ticket.worker) return;

  const title = "Support Ticket Reply";
  const ticketId = ticket?.id ? `#${ticket.id}` : "your ticket";
  const preview = String(message || "").trim();
  const body = preview
    ? `${ticketId}: ${preview}`
    : `${ticketId}: New message from support.`;
  const route = normalizeRoute("/support_ticket");
  const dataPayload = {
    type: "support_ticket_message",
    ticketId: String(ticket._id || ""),
    route,
  };

  try {
    await InAppNotificationsModel.create({
      worker: String(ticket.worker),
      title,
      message: body,
      type: "support_ticket_message",
      route,
      data: dataPayload,
      isRead: false,
      createdBy: userInfo?._id ? String(userInfo._id) : "",
      updatedBy: userInfo?._id ? String(userInfo._id) : "",
      sentAt: new Date(),
    });
  } catch (error) {
    console.error("Support ticket message persist failed:", error);
  }

  const tokenRows = await StaffDeviceTokenModel.find(
    { worker: String(ticket.worker), isActive: true },
    { token: 1 },
  ).lean();

  const tokens = tokenRows.map((row) => row.token).filter(Boolean);
  if (!pushNotifications.isConfigured() || tokens.length === 0) return;

  try {
    const sendResult = await pushNotifications.sendToTokens({
      tokens,
      title,
      body,
      data: dataPayload,
      channelId: "bcw_staff_high_importance",
    });

    if (sendResult.invalidTokens.length > 0) {
      await StaffDeviceTokenModel.updateMany(
        { token: { $in: sendResult.invalidTokens } },
        { $set: { isActive: false, invalidatedAt: new Date() } },
      );
    }
  } catch (error) {
    console.error("Support ticket message push failed:", error);
  }
};

const buildDateRangeFilter = (query = {}) => {
  const startDate = String(query.startDate || "").trim();
  const endDate = String(query.endDate || "").trim();

  const range = {};
  if (startDate) {
    const parsed = new Date(startDate);
    if (!Number.isNaN(parsed.getTime())) {
      range.$gte = parsed;
    }
  }

  if (endDate) {
    const parsed = new Date(endDate);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      range.$lte = parsed;
    }
  }

  return Object.keys(range).length ? range : null;
};

const buildMatch = (query = {}) => {
  const filter = {};

  const status = String(query.status || "").trim();
  if (status) filter.status = status;

  const category = String(query.category || "").trim();
  if (category) filter.category = category;

  const range = buildDateRangeFilter(query);
  if (range) {
    filter.createdAt = range;
  }

  return filter;
};

const buildPipeline = ({
  query = {},
  skip = 0,
  limit = 20,
  includeLimit = true,
}) => {
  const match = buildMatch(query);
  const search = String(query.search || "").trim();

  const pipeline = [
    { $match: match },
    { $addFields: { idString: { $toString: "$id" } } },
    {
      $lookup: {
        from: "workers",
        let: { workerId: "$worker" },
        pipeline: [
          { $addFields: { idString: { $toString: "$_id" } } },
          { $match: { $expr: { $eq: ["$idString", "$$workerId"] } } },
          { $project: { _id: 1, idString: 1, name: 1, mobile: 1 } },
        ],
        as: "workerInfo",
      },
    },
    { $addFields: { workerInfo: { $arrayElemAt: ["$workerInfo", 0] } } },
    {
      $addFields: {
        workerName: { $ifNull: ["$workerInfo.name", ""] },
        workerMobile: { $ifNull: ["$workerInfo.mobile", ""] },
      },
    },
  ];

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { idString: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { workerName: { $regex: search, $options: "i" } },
          { workerMobile: { $regex: search, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  if (includeLimit) {
    pipeline.push({ $skip: skip }, { $limit: limit });
  }

  pipeline.push({
    $project: {
      _id: 1,
      id: 1,
      category: 1,
      description: 1,
      status: 1,
      attachments: 1,
      worker: 1,
      workerName: 1,
      workerMobile: 1,
      createdAt: 1,
      updatedAt: 1,
      resolvedAt: 1,
      adminNote: 1,
    },
  });

  return pipeline;
};

service.list = async (query = {}) => {
  const pageNo = Math.max(toInt(query.pageNo ?? query.page, 0), 0);
  const pageSize = Math.min(
    Math.max(toInt(query.pageSize ?? query.limit, 20), 1),
    100,
  );

  const [rows, totalResult] = await Promise.all([
    SupportTicketsModel.aggregate(
      buildPipeline({ query, skip: pageNo * pageSize, limit: pageSize }),
    ),
    SupportTicketsModel.aggregate(
      buildPipeline({ query, skip: 0, limit: 0, includeLimit: false }).concat([
        { $count: "total" },
      ]),
    ),
  ]);

  const total = totalResult?.[0]?.total || 0;

  return {
    data: rows,
    total,
    pageNo,
    pageSize,
  };
};

service.info = async (id) => {
  return SupportTicketsModel.findOne({ _id: id }).lean();
};

service.update = async (userInfo, id, payload = {}) => {
  const existing = await SupportTicketsModel.findOne({ _id: id }).lean();
  const status = String(payload.status || "")
    .trim()
    .toLowerCase();
  const adminNote = String(payload.adminNote || "").trim();

  const update = { updatedBy: String(userInfo._id) };
  if (adminNote) update.adminNote = adminNote;

  if (status) {
    if (!["open", "resolved"].includes(status)) {
      throw "INVALID_STATUS";
    }
    update.status = status;
    if (status === "resolved") {
      update.resolvedAt = new Date();
      update.resolvedBy = String(userInfo._id);
    } else {
      update.resolvedAt = null;
      update.resolvedBy = null;
    }
  }

  await SupportTicketsModel.updateOne({ _id: id }, { $set: update });
  const updated = await SupportTicketsModel.findOne({ _id: id }).lean();

  if (
    status &&
    existing &&
    updated &&
    status !== String(existing.status || "").toLowerCase()
  ) {
    await notifyStatusChange({ ticket: updated, status, userInfo });
  }

  return updated;
};

service.listMessages = async (ticketId) => {
  if (!ticketId) return [];
  return SupportTicketMessagesModel.find({ ticket: String(ticketId) })
    .sort({ createdAt: 1 })
    .lean();
};

service.createMessage = async (userInfo, ticketId, payload = {}) => {
  const ticket = await SupportTicketsModel.findOne({ _id: ticketId }).lean();
  if (!ticket) throw "Ticket not found";

  const message = String(payload.message || "").trim();
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];

  if (!message && attachments.length === 0) {
    throw "Message or attachment is required";
  }

  const doc = await SupportTicketMessagesModel.create({
    ticket: String(ticketId),
    senderType: "admin",
    senderId: userInfo?._id ? String(userInfo._id) : "",
    senderName: userInfo?.name || userInfo?.email || "Admin",
    message,
    attachments,
  });

  await SupportTicketsModel.updateOne(
    { _id: ticketId },
    { $set: { updatedBy: String(userInfo._id) } },
  );

  await notifyMessage({ ticket, message, userInfo });

  return doc.toObject();
};
