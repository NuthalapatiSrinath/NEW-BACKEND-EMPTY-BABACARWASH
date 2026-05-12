"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    buildNumber: { type: String },
    releaseNotes: { type: String },
    platform: { type: String, default: "android" },
    file: {
      url: { type: String, required: true },
      filename: { type: String, required: true },
      originalName: { type: String },
      size: { type: Number },
      mimeType: { type: String },
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("staff-app-updates", schema);
