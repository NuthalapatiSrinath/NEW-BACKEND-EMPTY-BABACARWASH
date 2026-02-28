"use strict";

const mongoose = require("mongoose");

const customerActivitySchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customers",
      required: true,
      index: true,
    },
    sessionId: { type: String, index: true },
    activityType: {
      type: String,
      enum: [
        "login",
        "logout",
        "page_view",
        "scroll",
        "button_click",
        "navigation",
        "form_submit",
        "booking_view",
        "booking_create",
        "payment_view",
        "payment_action",
        "vehicle_add",
        "vehicle_edit",
        "profile_view",
        "profile_update",
        "schedule_view",
        "history_view",
        "notification_view",
        "enquiry_submit",
        "onewash_view",
        "search",
        "app_open",
        "app_close",
        "app_background",
        "app_foreground",
        "screen_view",
        "screen_time",
        "other",
      ],
      required: true,
      index: true,
    },
    page: {
      path: { type: String },
      title: { type: String },
      referrer: { type: String },
    },
    action: {
      element: { type: String },
      value: { type: String },
    },
    scroll: {
      depth: { type: Number },
      maxDepth: { type: Number },
    },
    device: {
      userAgent: { type: String },
      platform: { type: String },
      isMobile: { type: Boolean },
      screenWidth: { type: Number },
      screenHeight: { type: Number },
      appVersion: { type: String },
      osVersion: { type: String },
      deviceModel: { type: String },
    },
    location: {
      ip: { type: String },
      country: { type: String },
      city: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
    },
    duration: { type: Number }, // milliseconds
    timestamp: { type: Date, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed }, // Flexible extra data
  },
  {
    versionKey: false,
    strict: false,
    timestamps: true,
  },
);

// Compound indexes for performance
customerActivitySchema.index({ customer: 1, timestamp: -1 });
customerActivitySchema.index({ customer: 1, activityType: 1 });
customerActivitySchema.index({ customer: 1, sessionId: 1 });
customerActivitySchema.index({ activityType: 1, timestamp: -1 });

// Static: Get popular pages
customerActivitySchema.statics.getPopularPages = function (limit = 20) {
  return this.aggregate([
    { $match: { activityType: "page_view" } },
    {
      $group: {
        _id: "$page.path",
        title: { $first: "$page.title" },
        visits: { $sum: 1 },
        uniqueUsers: { $addToSet: "$customer" },
      },
    },
    {
      $project: {
        path: "$_id",
        title: 1,
        visits: 1,
        uniqueUsers: { $size: "$uniqueUsers" },
      },
    },
    { $sort: { visits: -1 } },
    { $limit: limit },
  ]);
};

// Static: Get customer engagement
customerActivitySchema.statics.getCustomerEngagement = function (customerId) {
  return this.aggregate([
    { $match: { customer: customerId } },
    {
      $group: {
        _id: null,
        totalActivities: { $sum: 1 },
        uniqueSessions: { $addToSet: "$sessionId" },
        avgDuration: { $avg: "$duration" },
        lastSeen: { $max: "$timestamp" },
        firstSeen: { $min: "$timestamp" },
      },
    },
    {
      $project: {
        totalActivities: 1,
        sessionCount: { $size: "$uniqueSessions" },
        avgDuration: { $round: ["$avgDuration", 0] },
        lastSeen: 1,
        firstSeen: 1,
      },
    },
  ]);
};

module.exports = mongoose.model("customer_activities", customerActivitySchema);
