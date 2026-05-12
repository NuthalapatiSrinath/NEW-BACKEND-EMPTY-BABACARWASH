"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    worker: { type: String, ref: "workers", index: true, required: true },
    token: { type: String, required: true, unique: true, index: true },
    platform: {
      type: String,
      enum: ["android", "ios", "web"],
      default: "android",
    },
    appVersion: { type: String },
    deviceInfo: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
    invalidatedAt: { type: Date },
  },
  {
    versionKey: false,
    strict: true,
    timestamps: true,
  },
);

schema.index({ worker: 1, isActive: 1 });

module.exports = mongoose.model("staff-device-tokens", schema);
