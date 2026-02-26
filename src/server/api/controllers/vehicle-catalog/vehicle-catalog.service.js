const VehicleBrandsModel = require("../../models/vehicle-brands.model");
const VehicleModelsModel = require("../../models/vehicle-models.model");
const fs = require("fs");
const path = require("path");
const service = module.exports;

// ============== BRANDS ==============

service.listBrands = async (query) => {
  const { search, status } = query;
  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (search) filter.name = { $regex: search, $options: "i" };

  const brands = await VehicleBrandsModel.find(filter).sort({ name: 1 }).lean();

  // Get model counts for each brand
  const brandsWithCount = await Promise.all(
    brands.map(async (brand) => {
      const modelCount = await VehicleModelsModel.countDocuments({
        brandId: brand._id,
        isDeleted: false,
      });
      return { ...brand, modelCount };
    }),
  );

  return { total: brandsWithCount.length, data: brandsWithCount };
};

service.createBrand = async (payload, file) => {
  const existing = await VehicleBrandsModel.findOne({
    name: { $regex: `^${payload.name}$`, $options: "i" },
    isDeleted: false,
  });
  if (existing) throw "Brand already exists";

  const brandData = {
    name: payload.name,
    status: payload.status || "active",
  };

  if (file) {
    const uploadDir = path.join(
      __dirname,
      "../../../../uploads/vehicle-brands",
    );
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(
      file.originalFilename || file.newFilename || ".png",
    );
    const fileName = `brand-${Date.now()}${ext}`;
    const destPath = path.join(uploadDir, fileName);

    fs.copyFileSync(file.filepath || file.path, destPath);
    brandData.logo = `/uploads/vehicle-brands/${fileName}`;
  }

  return await VehicleBrandsModel.create(brandData);
};

service.updateBrand = async (id, payload, file) => {
  const brand = await VehicleBrandsModel.findById(id);
  if (!brand || brand.isDeleted) throw "Brand not found";

  if (payload.name) brand.name = payload.name;
  if (payload.status) brand.status = payload.status;

  if (file) {
    const uploadDir = path.join(
      __dirname,
      "../../../../uploads/vehicle-brands",
    );
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(
      file.originalFilename || file.newFilename || ".png",
    );
    const fileName = `brand-${Date.now()}${ext}`;
    const destPath = path.join(uploadDir, fileName);

    fs.copyFileSync(file.filepath || file.path, destPath);

    // Delete old logo if exists
    if (brand.logo) {
      const oldPath = path.join(__dirname, "../../../../", brand.logo);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    brand.logo = `/uploads/vehicle-brands/${fileName}`;
  }

  return await brand.save();
};

service.deleteBrand = async (id) => {
  const brand = await VehicleBrandsModel.findById(id);
  if (!brand) throw "Brand not found";

  // Soft delete all models under this brand
  await VehicleModelsModel.updateMany({ brandId: id }, { isDeleted: true });

  brand.isDeleted = true;
  return await brand.save();
};

// ============== MODELS ==============

service.listModels = async (query) => {
  const { brandId, search, vehicleType, category, status } = query;
  const filter = { isDeleted: false };
  if (brandId) filter.brandId = brandId;
  if (vehicleType) filter.vehicleType = vehicleType;
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (search) filter.name = { $regex: search, $options: "i" };

  const models = await VehicleModelsModel.find(filter)
    .populate("brandId", "name logo")
    .sort({ name: 1 })
    .lean();

  return { total: models.length, data: models };
};

service.createModel = async (payload, file) => {
  // Validate brand exists
  const brand = await VehicleBrandsModel.findById(payload.brandId);
  if (!brand || brand.isDeleted) throw "Brand not found";

  const modelData = {
    brandId: payload.brandId,
    name: payload.name,
    vehicleType: payload.vehicleType || "4wheeler",
    category: payload.category || "hatchback",
    status: payload.status || "active",
  };

  if (file) {
    const uploadDir = path.join(
      __dirname,
      "../../../../uploads/vehicle-models",
    );
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(
      file.originalFilename || file.newFilename || ".png",
    );
    const fileName = `model-${Date.now()}${ext}`;
    const destPath = path.join(uploadDir, fileName);

    fs.copyFileSync(file.filepath || file.path, destPath);
    modelData.image = `/uploads/vehicle-models/${fileName}`;
  }

  return await VehicleModelsModel.create(modelData);
};

service.updateModel = async (id, payload, file) => {
  const model = await VehicleModelsModel.findById(id);
  if (!model || model.isDeleted) throw "Model not found";

  if (payload.name) model.name = payload.name;
  if (payload.vehicleType) model.vehicleType = payload.vehicleType;
  if (payload.category) model.category = payload.category;
  if (payload.status) model.status = payload.status;
  if (payload.brandId) model.brandId = payload.brandId;

  if (file) {
    const uploadDir = path.join(
      __dirname,
      "../../../../uploads/vehicle-models",
    );
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(
      file.originalFilename || file.newFilename || ".png",
    );
    const fileName = `model-${Date.now()}${ext}`;
    const destPath = path.join(uploadDir, fileName);

    fs.copyFileSync(file.filepath || file.path, destPath);

    // Delete old image if exists
    if (model.image) {
      const oldPath = path.join(__dirname, "../../../../", model.image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    model.image = `/uploads/vehicle-models/${fileName}`;
  }

  return await model.save();
};

service.deleteModel = async (id) => {
  const model = await VehicleModelsModel.findById(id);
  if (!model) throw "Model not found";

  model.isDeleted = true;
  return await model.save();
};

// ============== STATS ==============

service.getStats = async () => {
  const totalBrands = await VehicleBrandsModel.countDocuments({
    isDeleted: false,
  });
  const totalModels = await VehicleModelsModel.countDocuments({
    isDeleted: false,
  });
  const fourWheelers = await VehicleModelsModel.countDocuments({
    isDeleted: false,
    vehicleType: "4wheeler",
  });
  const twoWheelers = await VehicleModelsModel.countDocuments({
    isDeleted: false,
    vehicleType: "2wheeler",
  });

  return { totalBrands, totalModels, fourWheelers, twoWheelers };
};
