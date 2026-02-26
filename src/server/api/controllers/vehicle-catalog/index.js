const router = require("express").Router();
const controller = require("./vehicle-catalog.controller");
const AuthHelper = require("../auth/auth.helper");
const UploadHelper = require("../../../helpers/upload.helper");

// ============== BRANDS ==============
router.get("/brands", AuthHelper.authenticate, controller.listBrands);
router.post(
  "/brands",
  AuthHelper.authenticate,
  UploadHelper.upload,
  controller.createBrand,
);
router.put(
  "/brands/:id",
  AuthHelper.authenticate,
  UploadHelper.upload,
  controller.updateBrand,
);
router.delete("/brands/:id", AuthHelper.authenticate, controller.deleteBrand);

// ============== MODELS ==============
router.get("/models", AuthHelper.authenticate, controller.listModels);
router.post(
  "/models",
  AuthHelper.authenticate,
  UploadHelper.upload,
  controller.createModel,
);
router.put(
  "/models/:id",
  AuthHelper.authenticate,
  UploadHelper.upload,
  controller.updateModel,
);
router.delete("/models/:id", AuthHelper.authenticate, controller.deleteModel);

// ============== STATS ==============
router.get("/stats", AuthHelper.authenticate, controller.getStats);

module.exports = router;
