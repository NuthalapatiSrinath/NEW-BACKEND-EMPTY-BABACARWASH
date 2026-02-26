const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    customer: { type: String, ref: "customers", required: true },
    label: { type: String, trim: true }, // e.g. "Home", "Office"
    address: { type: String, required: true, trim: true },
    flat_no: { type: String, trim: true },
    building: { type: String, trim: true },
    community: { type: String, trim: true },
    parking_no: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    isDefault: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, strict: false },
);

module.exports = mongoose.model("addresses", schema);
