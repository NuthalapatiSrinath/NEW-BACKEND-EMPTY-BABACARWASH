"use strict";

const mongoose = require("mongoose");
const { ObjectId } = require("mongoose").Types;

const schema = new mongoose.Schema(
  {
    id: { type: Number },
    job: { type: ObjectId },
    status: { type: String, default: "pending" },
    createdBy: { type: String, required: true, ref: "users" },
    worker: { type: String, ref: "worker" },
    customer: { type: String, ref: "customers" },
    building: { type: String, ref: "buildings" }, // ✅ ADDED: Building reference
    mall: { type: String, ref: "malls" }, // ✅ ADDED: Mall reference
    amount_charged: { type: Number, default: 0 },
    amount_paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    old_balance: { type: Number, default: 0 },

    // ✅ ADD THESE FIELDS
    receipt_no: { type: String }, // Required for "Receipt Number" column
    notes: { type: String }, // Required for "Remarks" column

    tip_amount: { type: Number, default: 0 },
    total_amount: { type: Number, default: 0 },
    settled: { type: String, default: "pending" },
    onewash: { type: Boolean, default: false },
    collectedDate: { type: Date },
    settledDate: { type: Date },
    updatedBy: { type: String },
    deletedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("payments", schema);
