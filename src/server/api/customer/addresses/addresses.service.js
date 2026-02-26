const AddressModel = require("../../models/addresses.model");
const service = module.exports;

// List all addresses for the customer, default first, then most recent
service.list = async (userInfo, query) => {
  const customerId = userInfo.id || userInfo._id;
  const data = await AddressModel.find({
    customer: customerId,
    isDeleted: false,
  })
    .sort({ isDefault: -1, updatedAt: -1 })
    .lean();
  return { total: data.length, data };
};

// Create a new address
service.create = async (userInfo, payload) => {
  const customerId = userInfo.id || userInfo._id;

  // If this is the first address or marked as default, set it as default
  const existingCount = await AddressModel.countDocuments({
    customer: customerId,
    isDeleted: false,
  });
  const isDefault = existingCount === 0 ? true : payload.isDefault === true;

  // If setting as default, unset other defaults
  if (isDefault) {
    await AddressModel.updateMany(
      { customer: customerId, isDeleted: false },
      { $set: { isDefault: false } },
    );
  }

  const address = await AddressModel.create({
    ...payload,
    customer: customerId,
    isDefault,
    createdBy: customerId,
  });

  return address;
};

// Update an address
service.update = async (userInfo, addressId, payload) => {
  const customerId = userInfo.id || userInfo._id;
  const address = await AddressModel.findOneAndUpdate(
    { _id: addressId, customer: customerId, isDeleted: false },
    { $set: { ...payload, updatedBy: customerId } },
    { new: true },
  );
  if (!address) throw new Error("Address not found");
  return address;
};

// Set an address as default (and unset others)
service.setDefault = async (userInfo, addressId) => {
  const customerId = userInfo.id || userInfo._id;

  // Unset all defaults for this customer
  await AddressModel.updateMany(
    { customer: customerId, isDeleted: false },
    { $set: { isDefault: false } },
  );

  // Set the target as default
  const address = await AddressModel.findOneAndUpdate(
    { _id: addressId, customer: customerId, isDeleted: false },
    { $set: { isDefault: true } },
    { new: true },
  );
  if (!address) throw new Error("Address not found");
  return address;
};

// Soft delete an address
service.delete = async (userInfo, addressId) => {
  const customerId = userInfo.id || userInfo._id;
  const address = await AddressModel.findOneAndUpdate(
    { _id: addressId, customer: customerId, isDeleted: false },
    { $set: { isDeleted: true, deletedBy: customerId } },
    { new: true },
  );
  if (!address) throw new Error("Address not found");

  // If the deleted one was default, make the most recent one default
  if (address.isDefault) {
    const next = await AddressModel.findOne({
      customer: customerId,
      isDeleted: false,
    }).sort({ updatedAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  return address;
};
