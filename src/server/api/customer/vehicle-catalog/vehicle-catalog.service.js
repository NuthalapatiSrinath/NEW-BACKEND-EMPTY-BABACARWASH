const VehicleBrandsModel = require("../../models/vehicle-brands.model");
const VehicleModelsModel = require("../../models/vehicle-models.model");
const service = module.exports;

// List active brands (for app display)
service.listBrands = async (query) => {
  const { vehicleType, search } = query;
  const filter = { isDeleted: false, status: "active" };
  if (search) filter.name = { $regex: search, $options: "i" };

  const brands = await VehicleBrandsModel.find(filter).sort({ name: 1 }).lean();

  // If vehicleType filter is given, only return brands that have models of that type
  if (vehicleType) {
    const filteredBrands = [];
    for (const brand of brands) {
      const modelCount = await VehicleModelsModel.countDocuments({
        brandId: brand._id,
        vehicleType,
        isDeleted: false,
        status: "active",
      });
      if (modelCount > 0) {
        brand.modelCount = modelCount;
        filteredBrands.push(brand);
      }
    }
    return { total: filteredBrands.length, data: filteredBrands };
  }

  // Get model counts for each brand
  const brandsWithCount = await Promise.all(
    brands.map(async (brand) => {
      const modelCount = await VehicleModelsModel.countDocuments({
        brandId: brand._id,
        isDeleted: false,
        status: "active",
      });
      return { ...brand, modelCount };
    }),
  );

  return { total: brandsWithCount.length, data: brandsWithCount };
};

// List active models for a brand (for app display)
service.listModels = async (query) => {
  const { brandId, vehicleType, category, search } = query;
  const filter = { isDeleted: false, status: "active" };
  if (brandId) filter.brandId = brandId;
  if (vehicleType) filter.vehicleType = vehicleType;
  if (category) filter.category = category;
  if (search) filter.name = { $regex: search, $options: "i" };

  const models = await VehicleModelsModel.find(filter)
    .populate("brandId", "name logo")
    .sort({ name: 1 })
    .lean();

  return { total: models.length, data: models };
};

// Search across brands and models
service.search = async (query) => {
  const { q, vehicleType } = query;
  if (!q || q.length < 2) return { brands: [], models: [] };

  const searchRegex = { $regex: q, $options: "i" };
  const baseFilter = { isDeleted: false, status: "active" };

  const brandFilter = { ...baseFilter, name: searchRegex };
  const modelFilter = { ...baseFilter, name: searchRegex };
  if (vehicleType) modelFilter.vehicleType = vehicleType;

  const [brands, models] = await Promise.all([
    VehicleBrandsModel.find(brandFilter).sort({ name: 1 }).limit(10).lean(),
    VehicleModelsModel.find(modelFilter)
      .populate("brandId", "name logo")
      .sort({ name: 1 })
      .limit(20)
      .lean(),
  ]);

  return { brands, models };
};

// Get popular brands (top 6 with most models)
service.popularBrands = async (vehicleType) => {
  const filter = { isDeleted: false, status: "active" };
  if (vehicleType) filter.vehicleType = vehicleType;

  const pipeline = [
    { $match: { isDeleted: false, status: "active" } },
    ...(vehicleType
      ? [
          {
            $lookup: {
              from: "vehicle_models",
              let: { brandId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$brandId", "$$brandId"] },
                    isDeleted: false,
                    status: "active",
                    vehicleType,
                  },
                },
              ],
              as: "models",
            },
          },
        ]
      : [
          {
            $lookup: {
              from: "vehicle_models",
              let: { brandId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$brandId", "$$brandId"] },
                    isDeleted: false,
                    status: "active",
                  },
                },
              ],
              as: "models",
            },
          },
        ]),
    { $addFields: { modelCount: { $size: "$models" } } },
    { $match: { modelCount: { $gt: 0 } } },
    { $sort: { modelCount: -1 } },
    { $limit: 6 },
    { $project: { name: 1, logo: 1, modelCount: 1 } },
  ];

  const brands = await VehicleBrandsModel.aggregate(pipeline);
  return { total: brands.length, data: brands };
};
