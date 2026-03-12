const router = require("express").Router();
const controller = require("./payments.controller");
const AuthHelper = require("../auth/auth.helper");
const { hasAccess } = require("../../middleware/permissions.middleware");

const MODULE = "payments";

router.get(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.list,
);
router.post(
  "/",
  AuthHelper.authenticate,
  hasAccess(MODULE, "create"),
  controller.create,
);

// GET routes with specific paths MUST come before /:id to avoid conflicts
router.get(
  "/months-with-pending",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.getMonthsWithPending,
);
router.get(
  "/export/pdf",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.exportPDF,
);
router.get(
  "/settlements/list",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.settlements,
);
router.get(
  "/export/list",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.exportData,
);
router.get(
  "/export/statement/monthly",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.monthlyStatement,
);

// Edit history
router.get(
  "/edit-history",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.getEditHistory,
);

// Get payment history (amount edits + transactions)
router.get(
  "/:id/history",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.getPaymentHistory,
);

// Invoice generation (manual run + check)
router.post(
  "/run-invoice",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.runInvoice,
);
router.get(
  "/check-invoice",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.checkInvoice,
);

// Parameterized routes come after specific routes
router.get(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "view"),
  controller.info,
);
router.put(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.update,
);
router.delete(
  "/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"),
  controller.delete,
);
router.delete(
  "/:id/undo",
  AuthHelper.authenticate,
  hasAccess(MODULE, "delete"),
  controller.undoDelete,
);

router.put(
  "/:id/update",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.updatePayment,
);
router.put(
  "/:id/collect",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.collectPayment,
);
router.put(
  "/:id/edit-amount",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.editPaymentAmount,
);
router.put(
  "/collect/settle",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.settlePayment,
);
router.put(
  "/settlements/:id",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.updateSettlements,
);

router.put(
  "/bulk/status",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.bulkUpdateStatus,
);

router.post(
  "/close-month",
  AuthHelper.authenticate,
  hasAccess(MODULE, "edit"),
  controller.closeMonth,
);

module.exports = router;
