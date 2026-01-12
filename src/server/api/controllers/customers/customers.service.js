const CustomersModel = require("../../models/customers.model");
const LocationsModel = require("../locations/locations.model");
const BuildingsModel = require("../../models/buildings.model");
const MallsModel = require("../../models/malls.model");
const WorkersModel = require("../../models/workers.model");
const ImportLogsModel = require("../../models/import-logs.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const JobsService = require("../../staff/jobs/jobs.service");
const JobsModel = require("../../models/jobs.model");
const moment = require("moment");
const service = module.exports;

// ---------------------------------------------------------
// STANDARD CRUD (UNCHANGED)
// ---------------------------------------------------------

service.list = async (userInfo, query) => {
  console.log("🔍 [CUSTOMERS SERVICE] List called with query:", query);

  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    "vehicles.status": Number(query.status) || 1,
    ...(query.search
      ? {
          $or: [
            { mobile: { $regex: query.search, $options: "i" } },
            { flat_no: { $regex: query.search, $options: "i" } },
            {
              "vehicles.registration_no": {
                $regex: query.search,
                $options: "i",
              },
            },
            { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
  };

  if (query.search) {
    const buildings = await BuildingsModel.find(
      { isDeleted: false, name: { $regex: query.search, $options: "i" } },
      { _id: 1 }
    ).lean();

    if (buildings.length) {
      findQuery.$or.push({
        building: { $in: buildings.map((e) => e._id.toString()) },
      });
    }

    const workers = await WorkersModel.find(
      { isDeleted: false, name: { $regex: query.search, $options: "i" } },
      { _id: 1 }
    ).lean();

    if (workers.length) {
      findQuery.$or.push({
        "vehicles.worker": { $in: workers.map((e) => e._id.toString()) },
      });
    }
  }

  const total = await CustomersModel.aggregate([
    { $match: findQuery },
    {
      $group: {
        _id: null,
        total: { $sum: { $size: "$vehicles" } },
      },
    },
  ]);

  let data = await CustomersModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  for (let customer of data) {
    if (customer.building) {
      try {
        const building = await BuildingsModel.findOne({
          _id: customer.building,
          isDeleted: false,
        })
          .populate("location_id")
          .lean();
        customer.building = building || null;
      } catch (e) {
        console.log("⚠️ Failed to populate building:", customer.building);
        customer.building = null;
      }
    }

    if (customer.vehicles && customer.vehicles.length > 0) {
      for (let vehicle of customer.vehicles) {
        if (vehicle.worker) {
          try {
            const worker = await WorkersModel.findOne({
              _id: vehicle.worker,
              isDeleted: false,
            }).lean();
            vehicle.worker = worker || null;
          } catch (e) {
            console.log("⚠️ Failed to populate worker:", vehicle.worker);
            vehicle.worker = null;
          }
        }
      }
    }
  }

  for (const iterator of data) {
    iterator.vehicles = iterator.vehicles.filter(
      (e) => e.status == (Number(query.status) || 1)
    );
  }

  return { total: total.length ? total[0].total : null, data };
};

service.info = async (userInfo, id) => {
  return CustomersModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const findUserQuery = { isDeleted: false, $or: [{ mobile: payload.mobile }] };
  if (payload.email) {
    findUserQuery.$or.push({ email: payload.email });
  }
  const userExists = await CustomersModel.countDocuments(findUserQuery);
  if (userExists) {
    throw "USER-EXISTS";
  }
  const id = await CounterService.id("customers");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  const customerData = await new CustomersModel(data).save();
  await JobsService.createJob(customerData);
};

service.update = async (userInfo, id, payload) => {
  const vehicle = payload.vehicles[0];
  delete payload.vehicles;
  await CustomersModel.updateOne({ _id: id }, { $set: payload });
  await CustomersModel.updateOne(
    { _id: id, "vehicles._id": vehicle._id },
    { $set: { "vehicles.$": vehicle } }
  );
  const customerData = await CustomersModel.findOne({ _id: id }).lean();
  await JobsService.createJob(customerData);
};

service.delete = async (userInfo, id, reason) => {
  return await CustomersModel.updateOne(
    { _id: id },
    {
      isDeleted: true,
      deletedBy: userInfo._id,
      deletedAt: new Date(),
      deleteReason: reason || null,
    }
  );
};

service.undoDelete = async (userInfo, id) => {
  return await CustomersModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

service.vehicleDeactivate = async (userInfo, id, payload) => {
  await CustomersModel.updateOne(
    { "vehicles._id": id },
    {
      $set: {
        "vehicles.$.status": 2,
        "vehicles.$.deactivateReason": payload.deactivateReason,
        "vehicles.$.deactivateDate": payload.deactivateDate,
        "vehicles.$.deactivatedBy": userInfo._id,
      },
    }
  );
};

service.vehicleActivate = async (userInfo, id, payload) => {
  await CustomersModel.updateOne(
    { "vehicles._id": id },
    {
      $set: {
        "vehicles.$.status": 1,
        "vehicles.$.start_date": payload.start_date,
        "vehicles.$.activatedBy": userInfo._id,
      },
    }
  );
};

service.deactivate = async (userInfo, id, payload) => {
  await CustomersModel.updateOne(
    { _id: id },
    { $set: { status: 2, ...payload } }
  );
};

service.archive = async (userInfo, id, payload) => {
  return await CustomersModel.updateOne(
    { _id: id },
    { $set: { status: 9, archivedAt: new Date(), archivedBy: userInfo._id } }
  );
};

// ---------------------------------------------------------
// ✅ UPDATED IMPORT & EXPORT LOGIC
// ---------------------------------------------------------

// ✅ IMPORT: Processes array of data parsed by Controller
service.importData = async (userInfo, excelData) => {
  console.log("🔵 [SERVICE] Import started with", excelData?.length, "rows");

  const buildPayload = {
    customer: (data, location, building) => {
      return {
        mobile: data.mobile,
        ...(data.flat_no ? { flat_no: data.flat_no } : null),
        ...(data.firstName ? { firstName: data.firstName } : null),
        ...(data.lastName ? { lastName: data.lastName } : null),
        ...(data.email ? { email: data.email } : null),
        ...(location ? { location: location._id } : null),
        ...(building ? { building: building._id } : null),
        imported: true,
      };
    },
    vehicle: (data, worker) => {
      const schedule_days = [];
      if (
        data.schedule_type &&
        data.schedule_type.toLowerCase() === "weekly" &&
        data.schedule_days
      ) {
        // Handle "Mon,Wed,Fri" or "Mon, Wed, Fri"
        const days = data.schedule_days.includes(",")
          ? data.schedule_days.split(",")
          : data.schedule_days.split(" ");

        for (const day of days) {
          let dayValue = day.trim();
          if (dayValue) {
            schedule_days.push({
              day: dayValue,
              value: CommonHelper.getDayNumber(dayValue),
            });
          }
        }
      }

      return {
        registration_no: data.registration_no || data.vehicleNo,
        parking_no: data.parking_no || data.parkingNo,
        // If worker found, link ID. If not, link nothing.
        worker: worker ? worker._id : null,
        amount: data.amount || 0,
        schedule_type: data.schedule_type || "daily",
        schedule_days,
        start_date: data.start_date || new Date(),
        advance_amount: data.advance_amount || 0,
        status: 1, // Default active
      };
    },
  };

  if (excelData && excelData.length) {
    const counts = { duplicates: [], errors: [], success: 0 };

    for (const iterator of excelData) {
      try {
        if (!iterator.mobile) throw "Mobile number is required";
        if (!iterator.registration_no)
          throw "Vehicle registration number is required";

        // --- 1. Find Existing Customer ---
        const findUserQuery = {
          isDeleted: false,
          $or: [{ mobile: iterator.mobile }],
        };
        // Optional: Match email if provided
        if (iterator.email) findUserQuery.$or.push({ email: iterator.email });

        let customerInfo = await CustomersModel.findOne(findUserQuery);

        // --- 2. Lookups (Building, Location, Worker) ---
        const location = iterator.location
          ? await LocationsModel.findOne({
              isDeleted: false,
              address: { $regex: new RegExp(iterator.location.trim(), "i") },
            })
          : null;

        const building = iterator.building
          ? await BuildingsModel.findOne({
              isDeleted: false,
              name: { $regex: new RegExp(iterator.building.trim(), "i") },
            })
          : null;

        let worker = null;
        if (iterator.worker) {
          worker = await WorkersModel.findOne({
            isDeleted: false,
            name: { $regex: new RegExp(iterator.worker.trim(), "i") },
          });
        }

        let addVehicle = false;

        if (customerInfo) {
          // --- Update Existing Customer ---
          const customerUpdateData = buildPayload.customer(
            iterator,
            location,
            building
          );
          await CustomersModel.updateOne(
            { _id: customerInfo._id },
            { $set: customerUpdateData }
          );

          // Check if vehicle exists
          const regNo = iterator.registration_no;
          const hasVehicle = customerInfo.vehicles.find(
            (v) => v.registration_no === regNo
          );

          if (hasVehicle) {
            // Update Vehicle
            const vehicleUpdateData = buildPayload.vehicle(iterator, worker);
            await CustomersModel.updateOne(
              { "vehicles._id": hasVehicle._id },
              { $set: { "vehicles.$": vehicleUpdateData } }
            );
            counts.success++;
            continue; // Move to next row
          }
          addVehicle = true;
        }

        const vehicleInfo = buildPayload.vehicle(iterator, worker);

        if (addVehicle) {
          // Add vehicle to existing customer
          await CustomersModel.updateOne(
            { _id: customerInfo._id },
            { $push: { vehicles: vehicleInfo } }
          );
        } else {
          // --- Create New Customer ---
          const customer = {
            ...buildPayload.customer(iterator, location, building),
            vehicles: [vehicleInfo],
          };

          const id = await CounterService.id("customers");
          const data = {
            createdBy: userInfo._id,
            updatedBy: userInfo._id,
            id,
            ...customer,
          };
          customerInfo = await new CustomersModel(data).save();
        }

        // --- 3. Create Job ---
        // Ensure job creation runs for the imported entry
        await JobsService.createJob(customerInfo, "Import API");
        counts.success++;
      } catch (error) {
        console.error("❌ [SERVICE] Import Row Error:", error);
        counts.errors.push({
          row: `${iterator.firstName || ""} ${iterator.lastName || ""} - ${
            iterator.registration_no || "N/A"
          }`,
          error: error.message || error,
        });
      }
    }

    // Log the import attempt
    const importLog = await new ImportLogsModel({
      type: "customers-import-excel",
      logs: counts,
    }).save();

    return { _id: importLog._id, ...counts };
  } else {
    throw "No data in the file";
  }
};

// ✅ EXPORT: Returns clean JSON array for Frontend Excel generation
service.exportData = async (userInfo, query) => {
  // Use the status from the UI (1 for Active, 2 for Inactive)
  const findQuery = {
    isDeleted: false,
    "vehicles.status": Number(query.status) || 1,
  };

  const customerData = await CustomersModel.find(findQuery)
    .sort({ _id: -1 })
    .populate([
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
      { path: "vehicles.worker", model: "workers" },
    ])
    .lean();

  const exportMap = [];

  for (const iterator of customerData) {
    if (!iterator.vehicles || iterator.vehicles.length === 0) continue;

    for (const vehicle of iterator.vehicles) {
      // Only export vehicles that match the filter
      if (vehicle.status !== (Number(query.status) || 1)) continue;

      let row = {
        firstName: iterator.firstName,
        lastName: iterator.lastName,
        mobile: iterator.mobile,
        email: iterator.email,
        registration_no: vehicle.registration_no,
        parking_no: vehicle.parking_no,
        flat_no: iterator.flat_no,
        amount: vehicle.amount,
        advance_amount: vehicle.advance_amount,

        // Flatten populated fields safely
        building: iterator.building?.name || "",
        location: iterator.location?.address || "",
        worker: vehicle.worker?.name || "",

        // Format Schedule
        schedule_type: vehicle.schedule_type || "daily",
        schedule_days:
          vehicle.schedule_type === "weekly" && vehicle.schedule_days
            ? vehicle.schedule_days.map((e) => e.day).join(", ")
            : "",

        // Format Dates
        start_date: vehicle.start_date
          ? moment(vehicle.start_date).format("YYYY-MM-DD")
          : "",
        createdAt: vehicle.start_date
          ? moment(vehicle.start_date).format("YYYY-MM-DD")
          : "",
      };

      exportMap.push(row);
    }
  }

  return exportMap;
};

// ---------------------------------------------------------
// WASHES LIST (UNCHANGED)
// ---------------------------------------------------------

service.washesList = async (userInfo, query, customerId) => {
  const paginationData = CommonHelper.paginationData(query);
  const findQuery = {
    isDeleted: false,
    customer: customerId,
    ...(query.startDate && query.startDate.trim() !== ""
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte:
              query.endDate && query.endDate.trim() !== ""
                ? new Date(query.endDate)
                : new Date(),
          },
        }
      : {}),
    ...(query.search
      ? {
          $or: [{ name: { $regex: query.search, $options: "i" } }],
        }
      : {}),
  };

  const total = await JobsModel.countDocuments(findQuery);
  let data = await JobsModel.find(findQuery)
    .sort({ _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  for (let i = 0; i < data.length; i++) {
    try {
      if (data[i].building) {
        data[i].building = await BuildingsModel.findById(
          data[i].building
        ).lean();
      }
      if (data[i].location) {
        data[i].location = await LocationsModel.findById(
          data[i].location
        ).lean();
      }
      if (data[i].mall) {
        data[i].mall = await MallsModel.findById(data[i].mall).lean();
      }
      if (data[i].customer) {
        const customer = await CustomersModel.findById(data[i].customer).lean();
        if (customer && customer.vehicles && data[i].vehicle) {
          const vehicleId = data[i].vehicle.toString();
          data[i].vehicle =
            customer.vehicles.find(
              (v) => v._id && v._id.toString() === vehicleId
            ) || null;
        } else {
          data[i].vehicle = null;
        }
        data[i].customer = customer;
      }
    } catch (e) {
      data[i].customer = null;
      data[i].vehicle = null;
    }
  }

  return { total, data };
};

service.exportWashesList = async (userInfo, query, customerId) => {
  const findQuery = {
    isDeleted: false,
    customer: customerId,
    ...(query.startDate && query.startDate.trim() !== ""
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte:
              query.endDate && query.endDate.trim() !== ""
                ? new Date(query.endDate)
                : new Date(),
          },
        }
      : {}),
    ...(query.search
      ? {
          $or: [{ name: { $regex: query.search, $options: "i" } }],
        }
      : {}),
  };

  let data = await JobsModel.find(findQuery).sort({ _id: -1 }).lean();

  // Populate logic (same as list)
  for (let i = 0; i < data.length; i++) {
    try {
      if (data[i].building)
        data[i].building = await BuildingsModel.findById(
          data[i].building
        ).lean();
      if (data[i].location)
        data[i].location = await LocationsModel.findById(
          data[i].location
        ).lean();
      if (data[i].mall)
        data[i].mall = await MallsModel.findById(data[i].mall).lean();
      if (data[i].customer) {
        const customer = await CustomersModel.findById(data[i].customer).lean();
        if (customer && customer.vehicles && data[i].vehicle) {
          const vehicleId = data[i].vehicle.toString();
          data[i].vehicle =
            customer.vehicles.find(
              (v) => v._id && v._id.toString() === vehicleId
            ) || null;
        }
        data[i].customer = customer;
      }
    } catch (e) {
      data[i].customer = null;
    }
  }

  const exportMap = [];
  for (const iterator of data) {
    const row = {
      scheduleId: iterator.scheduleId || "",
      assignedDate: iterator.assignedDate
        ? moment(iterator.assignedDate).format("YYYY-MM-DD HH:mm:ss")
        : "",
      status: (iterator.status || "").toUpperCase(),
      vehicleNo: iterator.vehicle?.registration_no || "",
      parkingNo: iterator.vehicle?.parking_no || "",
      building: iterator.building?.name || "",
      location: iterator.location?.address || "",
      customerMobile: iterator.customer?.mobile || "",
      customerName: iterator.customer?.firstName
        ? `${iterator.customer.firstName} ${
            iterator.customer.lastName || ""
          }`.trim()
        : "",
    };
    exportMap.push(row);
  }

  return exportMap;
};
