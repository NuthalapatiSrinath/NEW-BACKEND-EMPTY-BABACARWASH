const SupportTicketsModel = require("../../models/support-tickets.model");
const SupportTicketMessagesModel = require("../../models/support-ticket-messages.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const EmailNotifications = require("../../../notifications/email.notifications");

const service = module.exports;

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return "-";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const buildEmailBody = (ticket) => {
  const attachments = Array.isArray(ticket.attachments)
    ? ticket.attachments
    : [];
  const attachmentRows = attachments
    .map((file) => {
      const name = file.originalName || file.filename || "attachment";
      const size = formatBytes(file.size);
      const url = file.url || file.relativePath || "";
      return `<li><a href="${url}">${name}</a> (${file.mimetype || "file"}, ${size})</li>`;
    })
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
      <h2 style="margin: 0 0 12px;">New Staff Support Ticket</h2>
      <p style="margin: 0 0 6px;"><strong>Ticket ID:</strong> #${ticket.id}</p>
      <p style="margin: 0 0 6px;"><strong>Status:</strong> ${ticket.status}</p>
      <p style="margin: 0 0 6px;"><strong>Category:</strong> ${ticket.category}</p>
      <p style="margin: 0 0 6px;"><strong>Staff:</strong> ${ticket.workerName || "-"} (${ticket.workerMobile || "-"})</p>
      <p style="margin: 12px 0 6px;"><strong>Description:</strong></p>
      <div style="padding: 10px 12px; background: #f3f4f6; border-radius: 8px;">
        ${ticket.description || "-"}
      </div>
      <p style="margin: 12px 0 6px;"><strong>Attachments:</strong></p>
      <ul style="padding-left: 18px; margin: 0;">
        ${attachmentRows || "<li>No attachments</li>"}
      </ul>
    </div>
  `;
};

service.create = async (userInfo, payload = {}) => {
  const category = String(payload.category || "").trim();
  const description = String(payload.description || "").trim();
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];

  if (!category) throw "Category is required";
  if (!description) throw "Description is required";

  const id = await CounterService.id("support_ticket");
  const ticket = await SupportTicketsModel.create({
    id,
    worker: String(userInfo._id),
    workerName: userInfo.name || "",
    workerMobile: userInfo.mobile || "",
    category,
    description,
    status: "open",
    attachments,
    createdBy: String(userInfo._id),
    updatedBy: String(userInfo._id),
  });

  const email =
    process.env.SUPPORT_TICKET_EMAIL || process.env.SMTP_USERNAME || "";
  if (email) {
    await EmailNotifications.sendMail({
      email,
      subject: `New Staff Support Ticket #${id} - ${category}`,
      body: buildEmailBody(ticket.toObject()),
    });
  }

  return ticket.toObject();
};

service.listMine = async (userInfo, query = {}) => {
  const pageNo = Math.max(toInt(query.pageNo ?? query.page, 0), 0);
  const pageSize = Math.min(
    Math.max(toInt(query.pageSize ?? query.limit, 20), 1),
    100,
  );

  const filter = {
    worker: String(userInfo._id),
  };

  if (query.status) {
    filter.status = String(query.status || "").trim();
  }

  const [total, data] = await Promise.all([
    SupportTicketsModel.countDocuments(filter),
    SupportTicketsModel.find(filter)
      .sort({ _id: -1 })
      .skip(pageNo * pageSize)
      .limit(pageSize)
      .lean(),
  ]);

  return {
    data,
    total,
    pageNo,
    pageSize,
  };
};

service.getMine = async (userInfo, id) => {
  if (!id) return null;
  return SupportTicketsModel.findOne({
    _id: id,
    worker: String(userInfo._id),
  }).lean();
};

service.listMessages = async (userInfo, ticketId) => {
  const ticket = await service.getMine(userInfo, ticketId);
  if (!ticket) return [];

  return SupportTicketMessagesModel.find({ ticket: String(ticketId) })
    .sort({ createdAt: 1 })
    .lean();
};

service.createMessage = async (userInfo, ticketId, payload = {}) => {
  const ticket = await service.getMine(userInfo, ticketId);
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
    senderType: "staff",
    senderId: String(userInfo._id),
    senderName: userInfo.name || userInfo.mobile || "Staff",
    message,
    attachments,
  });

  await SupportTicketsModel.updateOne(
    { _id: ticketId },
    { $set: { updatedBy: String(userInfo._id) } },
  );

  return doc.toObject();
};

service.reopen = async (userInfo, ticketId) => {
  const ticket = await service.getMine(userInfo, ticketId);
  if (!ticket) throw "Ticket not found";

  await SupportTicketsModel.updateOne(
    { _id: ticketId },
    {
      $set: {
        status: "open",
        resolvedAt: null,
        resolvedBy: null,
        updatedBy: String(userInfo._id),
      },
    },
  );

  return SupportTicketsModel.findOne({ _id: ticketId }).lean();
};
