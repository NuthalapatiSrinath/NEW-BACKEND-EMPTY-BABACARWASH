const router = require("express").Router();
const controller = require("./staff.controller");
const AuthHelper = require("../auth/auth.helper");
const UploadHelper = require("../../../helpers/upload.helper");
// ✅ Import Permissions Middleware
const permit = require("../../middleware/permissions.middleware");

const MODULE = "staff"; // Define module name for permissions

// ==========================================
// 📄 EXPORT / IMPORT / TEMPLATE
// ==========================================

router.get(
  "/template",
  AuthHelper.authenticate,
  permit(MODULE, "view"), // Requires 'view' permission
  controller.generateTemplate
);

router.get(
  "/export",
  AuthHelper.authenticate,
  permit(MODULE, "view"),
  controller.exportData
);

router.post(
  "/import",
  AuthHelper.authenticate,
  permit(MODULE, "create"), // Requires 'create' permission
  UploadHelper.upload,
  controller.importData
);

// ==========================================
// ⚠️ ALERTS
// ==========================================

router.get(
  "/expiring",
  AuthHelper.authenticate,
  permit(MODULE, "view"),
  controller.getExpiringDocuments
);

// ==========================================
// 🛠️ CRUD OPERATIONS
// ==========================================

router.get(
  "/",
  AuthHelper.authenticate,
  permit(MODULE, "view"),
  controller.list
);

router.post(
  "/",
  AuthHelper.authenticate,
  permit(MODULE, "create"),
  controller.create
);

router.get(
  "/:id",
  AuthHelper.authenticate,
  permit(MODULE, "view"),
  controller.info
);

router.put(
  "/:id",
  AuthHelper.authenticate,
  permit(MODULE, "edit"), // Requires 'edit' permission
  controller.update
);

router.delete(
  "/:id",
  AuthHelper.authenticate,
  permit(MODULE, "delete"), // Requires 'delete' permission
  controller.delete
);

router.delete(
  "/:id/undo",
  AuthHelper.authenticate,
  permit(MODULE, "delete"),
  controller.undoDelete
);

// ==========================================
// 📂 DOCUMENT & IMAGE MANAGEMENT
// ==========================================

// ✅ NEW: Upload Profile Image (This fixes the 404 error)
router.post(
  "/:id/profile-image",
  AuthHelper.authenticate,
  permit(MODULE, "edit"), // Changing profile pic is an 'edit' action
  UploadHelper.upload, // Middleware to handle the file upload
  controller.uploadProfileImage
);

// Upload Document (Passport, Visa, EID)
router.post(
  "/:id/upload-document",
  AuthHelper.authenticate,
  permit(MODULE, "edit"),
  UploadHelper.upload,
  controller.uploadDocument
);

// Delete Document
router.delete(
  "/:id/document",
  AuthHelper.authenticate,
  permit(MODULE, "delete"),
  controller.deleteDocument
);

// View Document (Secure Proxy/Redirect)
// Note: No AuthHelper here because the controller handles Token/User auth internally
// This allows viewing inside iframes or via secure links with tokens.
router.get("/:id/document/:documentType", controller.getDocument);

module.exports = router;
