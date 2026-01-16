"use strict";

const mongoose = require("mongoose");

/**
 * Staff Schema
 * Updated with Mobile, Email, Visa Number, and flexible Site field
 */
const schema = new mongoose.Schema(
  {
    // Auto-incremented ID from CounterService
    id: { type: Number },

    // Core Personal Details
    name: { type: String, required: true },
    employeeCode: { type: String, unique: true },
    companyName: { type: String },

    // ✅ Flexible Site Field: Accepts ObjectId (from Dropdown) OR String (from Excel)
    // Ref points to 'sites' model for population when an ID is present
    site: { type: mongoose.Schema.Types.Mixed, ref: "sites" },

    joiningDate: { type: Date },
    mobile: { type: String }, // ✅ Added: Mobile Number
    email: { type: String }, // ✅ Added: Email Address

    // ✅ Profile Image structure for Cloud/Oracle Storage
    profileImage: {
      url: { type: String },
      publicId: { type: String },
      filename: { type: String },
    },

    // Passport Details
    passportNumber: { type: String },
    passportExpiry: { type: Date },
    passportDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // ✅ Visa Details (Updated with Visa Number)
    visaNumber: { type: String }, // ✅ Added: Visa Number
    visaExpiry: { type: Date },
    visaDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // Emirates ID Details
    emiratesId: { type: String },
    emiratesIdExpiry: { type: Date },
    emiratesIdDocument: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: { type: Date },
    },

    // System Fields
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    deleteReason: { type: String },
  },
  {
    versionKey: false,
    strict: false, // Allows flexibility for dynamic fields from Excel if needed
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Indexes for better search performance
schema.index({ name: "text", employeeCode: "text", mobile: "text" });

module.exports = mongoose.model("staff", schema);
