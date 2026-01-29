"use strict";

const response = require("../../helpers/response.helper");
const AuditLog = require("../models/audit-logs.model"); // You must create this file (see below)

/**
 * Middleware: Check if user has granular permission for a module
 * Usage: router.delete('/:id', hasAccess('staff', 'delete'), ...)
 */
exports.hasAccess = (moduleName, actionType) => {
  return (req, res, next) => {
    try {
      const user = req.user; // Populated by your auth middleware

      if (!user) return res.status(401).json({ message: "Unauthorized." });

      // 1. Admin Override (Admins can do everything)
      if (user.role === "admin") return next();

      // 2. Check Specific Permission
      // Example: user.permissions.staff.delete
      const modulePerms = user.permissions
        ? user.permissions[moduleName]
        : null;
      const allowed = modulePerms ? modulePerms[actionType] : false;

      if (allowed) {
        return next();
      }

      return res
        .status(403)
        .json({ message: "Access Denied: You do not have permission." });
    } catch (err) {
      console.error("RBAC Error:", err);
      return res.status(500).json({ message: "Permission check failed." });
    }
  };
};

/**
 * Middleware: Force user to provide a reason for this action
 * Usage: router.post('/delete', requireReason, ...)
 */
exports.requireReason = (req, res, next) => {
  const { reason } = req.body;

  // You can decide if Admins also need to provide reasons or not:
  // if (req.user.role === 'admin') return next();

  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    return res
      .status(400)
      .json({ message: "A valid 'reason' is required for this action." });
  }
  next();
};

/**
 * Helper: Save the action log to DB
 * Call this INSIDE your controller after a successful action
 */
exports.logAction = async (user, module, action, targetId, reason) => {
  try {
    await AuditLog.create({
      performedBy: user._id,
      role: user.role,
      module: module, // e.g. "Staff"
      action: action, // e.g. "DELETE"
      targetId: targetId, // e.g. Staff ID
      reason: reason, // e.g. "Employee resigned"
    });
  } catch (err) {
    console.error("Audit Log Error:", err.message);
    // Don't crash the request if logging fails, just log to console
  }
};
