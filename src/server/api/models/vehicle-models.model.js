"use strict";

const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vehicle_brands",
      required: true,
    },
    name: { type: String, required: true },
    image: { type: String }, // file path to vehicle image
    vehicleType: {
      type: String,
      enum: ["4wheeler", "2wheeler"],
      default: "4wheeler",
    },
    category: {
      type: String,
      enum: ["hatchback", "sedan", "suv", "muv", "bike", "scooter", "other"],
      default: "hatchback",
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    isDeleted: { type: Boolean, default: false },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("vehicle_models", schema);
