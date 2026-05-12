"use strict";

const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String },
    filename: { type: String },
    relativePath: { type: String },
    url: { type: String },
    mimetype: { type: String },
    size: { type: Number },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    ticket: { type: String, ref: "support-tickets", index: true },
    senderType: { type: String, enum: ["staff", "admin"], required: true },
    senderId: { type: String },
    senderName: { type: String },
    message: { type: String },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { versionKey: false, strict: false, timestamps: true },
);

schema.index({ ticket: 1, createdAt: 1 });

module.exports = mongoose.model("support-ticket-messages", schema);
