const VehiclesModel = require("../../models/vehicles.model");
const CustomersModel = require("../../models/customers.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const service = module.exports;

service.list = async (userInfo, query) => {
  const data = await CustomersModel.findOne({
    isDeleted: false,
    _id: userInfo._id,
  }).lean();
  return { total: data?.vehicles?.length, data: data?.vehicles || [] };
};

service.info = async (userInfo, id) => {
  const data = await CustomersModel.findOne({ _id: userInfo._id });
  return data.vehicles.find((e) => e._id == id);
};

service.create = async (userInfo, payload) => {
  const vehicleData = {
    registration_no: payload.registration_no,
    vehicle_type: payload.vehicle_type,
    brandId: payload.brandId,
    brandName: payload.brandName,
    modelId: payload.modelId,
    modelName: payload.modelName,
    modelImage: payload.modelImage,
    category: payload.category,
    vehicleName: payload.vehicleName,
  };
  // Remove undefined fields
  Object.keys(vehicleData).forEach(
    (key) => vehicleData[key] === undefined && delete vehicleData[key],
  );
  await CustomersModel.updateOne(
    { _id: userInfo._id },
    { $push: { vehicles: vehicleData } },
  );
};

service.update = async (userInfo, id, payload) => {
  const updateFields = {
    "vehicles.$.registration_no": payload.registration_no,
    "vehicles.$.vehicle_type": payload.vehicle_type,
  };
  if (payload.brandId) updateFields["vehicles.$.brandId"] = payload.brandId;
  if (payload.brandName)
    updateFields["vehicles.$.brandName"] = payload.brandName;
  if (payload.modelId) updateFields["vehicles.$.modelId"] = payload.modelId;
  if (payload.modelName)
    updateFields["vehicles.$.modelName"] = payload.modelName;
  if (payload.modelImage)
    updateFields["vehicles.$.modelImage"] = payload.modelImage;
  if (payload.category) updateFields["vehicles.$.category"] = payload.category;
  if (payload.vehicleName)
    updateFields["vehicles.$.vehicleName"] = payload.vehicleName;

  // Remove undefined fields
  Object.keys(updateFields).forEach(
    (key) => updateFields[key] === undefined && delete updateFields[key],
  );

  await CustomersModel.updateOne(
    { "vehicles._id": id },
    { $set: updateFields },
  );
};

service.delete = async (userInfo, id) => {
  await CustomersModel.updateOne(
    { "vehicles._id": id },
    { $pull: { vehicles: { _id: id } } },
  );
  const data = await CustomersModel.findOne({
    isDeleted: false,
    _id: userInfo._id,
  }).lean();
  return data.vehicles;
};

service.undoDelete = async (userInfo, id) => {
  return await VehiclesModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};
