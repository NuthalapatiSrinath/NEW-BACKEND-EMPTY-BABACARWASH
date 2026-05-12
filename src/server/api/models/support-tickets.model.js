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
    id: { type: Number, index: true },
    worker: { type: String, ref: "workers", index: true },
    workerName: { type: String },
    workerMobile: { type: String },
    category: { type: String },
    description: { type: String },
    status: { type: String, default: "open", index: true },
    attachments: { type: [attachmentSchema], default: [] },
    adminNote: { type: String },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { versionKey: false, strict: false, timestamps: true },
);

schema.index({ worker: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("support-tickets", schema);
