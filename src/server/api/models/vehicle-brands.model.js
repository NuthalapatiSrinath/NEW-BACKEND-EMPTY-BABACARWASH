"use strict";

const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    logo: { type: String }, // file path to logo image
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    isDeleted: { type: Boolean, default: false },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("vehicle_brands", schema);
