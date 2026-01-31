const moment = require("moment-timezone");
const exceljs = require("exceljs");

const JobsModel = require("../../models/jobs.model");
const PaymentsModel = require("../../models/payments.model");
const CustomersModel = require("../../models/customers.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const AuthHelper = require("../auth/auth.helper");
const WorkersModel = require("../../models/workers.model");

const service = module.exports;

// --- UTILS ---
const isValidId = (id) =>
  id && typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/);

const cleanQuery = (q) => {
  const cleaned = {};
  for (const key in q) {
    if (q[key] !== "" && q[key] !== "null" && q[key] !== undefined) {
      cleaned[key] = q[key];
    }
  }
  return cleaned;
};

// --- LIST ---
service.list = async (userInfo, rawQuery) => {
  const query = cleanQuery(rawQuery);
  const paginationData = CommonHelper.paginationData(query);
  const workers = [];

  if (userInfo.role == "supervisor" && !query.worker) {
    const workersFindQuery = {
      isDeleted: false,
      ...(userInfo.service_type == "mall"
        ? { malls: { $in: [userInfo.mall] } }
        : null),
      ...(userInfo.service_type == "residence"
        ? { buildings: { $in: userInfo.buildings } }
        : null),
    };

    const workersData = await WorkersModel.find(workersFindQuery);
    for (const iterator of JSON.parse(JSON.stringify(workersData))) {
      workers.push(iterator._id);
    }
  }

  const findQuery = {
    isDeleted: false,
    // worker: { $ne: "" }, // Allow jobs without workers (will be assigned later)
    customer: { $ne: "" },
    building: { $ne: "" },

    ...(query.startDate && !isNaN(new Date(query.startDate).getTime())
      ? {
          createdAt: {
            $gte: new Date(query.startDate),
            $lte: (() => {
              let end = query.endDate
                ? new Date(query.endDate)
                : new Date(query.startDate);
              if (!query.endDate || query.endDate.length <= 10)
                end.setHours(23, 59, 59, 999);
              return end;
            })(),
          },
        }
      : null),

    ...(isValidId(query.worker)
      ? { worker: query.worker }
      : userInfo.role == "supervisor"
        ? { worker: { $in: workers } }
        : null),

    ...(isValidId(query.customer) ? { customer: query.customer } : null),
    ...(isValidId(query.building) ? { building: query.building } : null),
    ...(isValidId(query.mall) ? { mall: query.mall } : null),
    ...(query.status ? { status: query.status } : null),
  };

  if (query.search) {
    const customers = await CustomersModel.find({
      isDeleted: false,
      $or: [
        {
          "vehicles.registration_no": { $regex: query.search, $options: "i" },
        },
        { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
      ],
    }).lean();

    if (customers.length) {
      let vehicles = [];
      for (const customer of customers) {
        for (const vehicle of customer.vehicles) {
          vehicles.push(vehicle._id);
        }
      }
      findQuery.$or = [{ vehicle: { $in: vehicles } }];
    }
  }

  const total = await JobsModel.countDocuments(findQuery);

  let data = await JobsModel.find(findQuery)
    .sort({ assignedDate: -1, createdAt: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    .lean();

  try {
    data = await JobsModel.populate(data, [
      { path: "customer", model: "customers" },
      { path: "location", model: "locations" },
      { path: "building", model: "buildings" },
      { path: "worker", model: "workers" },
    ]);
  } catch (e) {
    console.warn("List Populate Warning (Ignored):", e.message);
  }

  // Map vehicle data - use stored fields or populate from customer.vehicles
  for (const iterator of data) {
    // If job already has registration_no and parking_no stored, use those
    if (iterator.registration_no || iterator.parking_no) {
      iterator.vehicle = {
        _id: iterator.vehicle,
        registration_no: iterator.registration_no,
        parking_no: iterator.parking_no,
      };
    }
    // Otherwise, try to populate from customer.vehicles array
    else if (
      iterator.customer &&
      iterator.customer.vehicles &&
      iterator.vehicle
    ) {
      const vehicleData = iterator.customer.vehicles.find(
        (e) => e._id.toString() === iterator.vehicle?.toString(),
      );
      if (vehicleData) {
        iterator.vehicle = {
          _id: vehicleData._id,
          registration_no: vehicleData.registration_no,
          parking_no: vehicleData.parking_no,
        };
      }
    }
  }

  return { total, data };
};

service.info = async (userInfo, id) => {
  return JobsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("workers");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
    worker: payload.worker || null,
    customer: payload.customer || null,
    vehicle: payload.vehicle || null,
    hPassword: payload.password
      ? AuthHelper.getPasswordHash(payload.password)
      : undefined,
  };
  await new JobsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  if (payload.worker === "") payload.worker = null;
  if (payload.customer === "") payload.customer = null;
  await JobsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await JobsModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await JobsModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

// --- EXPORT DATA ---
service.exportData = async (userInfo, rawQuery) => {
  const query = cleanQuery(rawQuery);
  try {
    const workers = [];
    if (userInfo.role == "supervisor" && !query.worker) {
      const workersFindQuery = {
        isDeleted: false,
        ...(userInfo.service_type == "mall"
          ? { malls: { $in: [userInfo.mall] } }
          : null),
        ...(userInfo.service_type == "residence"
          ? { buildings: { $in: userInfo.buildings } }
          : null),
      };

      const workersData = await WorkersModel.find(workersFindQuery);
      for (const iterator of JSON.parse(JSON.stringify(workersData))) {
        workers.push(iterator._id);
      }
    }

    const findQuery = {
      isDeleted: false,
      worker: { $ne: "" },
      customer: { $ne: "" },
      building: { $ne: "" },

      ...(query.startDate && !isNaN(new Date(query.startDate).getTime())
        ? {
            createdAt: {
              $gte: new Date(query.startDate),
              $lte: (() => {
                let end = query.endDate
                  ? new Date(query.endDate)
                  : new Date(query.startDate);
                if (!query.endDate || query.endDate.length <= 10)
                  end.setHours(23, 59, 59, 999);
                return end;
              })(),
            },
          }
        : null),

      ...(isValidId(query.worker)
        ? { worker: query.worker }
        : userInfo.role == "supervisor"
          ? { worker: { $in: workers } }
          : null),

      ...(isValidId(query.customer) ? { customer: query.customer } : null),
      ...(isValidId(query.building) ? { building: query.building } : null),
      ...(isValidId(query.mall) ? { mall: query.mall } : null),
      ...(query.status ? { status: query.status } : null),
    };

    if (query.search) {
      const customers = await CustomersModel.find({
        isDeleted: false,
        $or: [
          {
            "vehicles.registration_no": { $regex: query.search, $options: "i" },
          },
          { "vehicles.parking_no": { $regex: query.search, $options: "i" } },
        ],
      }).lean();

      if (customers.length) {
        let vehicles = [];
        for (const customer of customers) {
          for (const vehicle of customer.vehicles) {
            vehicles.push(vehicle._id);
          }
        }
        findQuery.$or = [{ vehicle: { $in: vehicles } }];
      }
    }

    let data = await JobsModel.find(findQuery)
      .sort({ completedDate: -1 })
      .lean();

    try {
      data = await JobsModel.populate(data, [
        { path: "customer", model: "customers" },
        { path: "location", model: "locations" },
        { path: "building", model: "buildings" },
        { path: "worker", model: "workers" },
      ]);
    } catch (e) {
      console.error("⚠️ [EXPORT POPULATE ERROR]:", e.message);
    }

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet("Residence Jobs Report");

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Assigned Date", key: "assignedDate", width: 15 },
      { header: "Completed Date", key: "completedDate", width: 15 },
      { header: "Customer Name", key: "customer", width: 25 },
      { header: "Mobile", key: "mobile", width: 15 },
      { header: "Building", key: "building", width: 20 },
      { header: "Vehicle No", key: "vehicle", width: 15 },
      { header: "Parking No", key: "parking", width: 15 },
      { header: "Worker", key: "worker", width: 20 },
      { header: "Status", key: "status", width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };

    data.forEach((item) => {
      let vehicleInfo = null;
      if (item.customer && item.customer.vehicles) {
        const vId = item.vehicle?._id || item.vehicle;
        vehicleInfo = item.customer.vehicles.find(
          (v) => v._id.toString() === vId?.toString(),
        );
      }

      worksheet.addRow({
        id: item.id || "-",
        assignedDate: item.assignedDate
          ? moment(item.assignedDate).format("YYYY-MM-DD")
          : "-",
        completedDate: item.completedDate
          ? moment(item.completedDate).format("YYYY-MM-DD")
          : "-",
        customer: item.customer
          ? `${item.customer.firstName} ${item.customer.lastName}`
          : "Unknown",
        mobile: item.customer?.mobile || "-",
        building: item.building?.name || "-",
        vehicle: vehicleInfo?.registration_no || "-",
        parking: vehicleInfo?.parking_no || "-",
        worker: item.worker?.name || "Unassigned",
        status: item.status || "pending",
      });
    });

    return workbook;
  } catch (error) {
    console.error("❌ [EXPORT FATAL ERROR]:", error);
    throw error;
  }
};

// --- MONTHLY STATEMENT (UPDATED: TIPS CALCULATION + EXCEL FIXES) ---
service.monthlyStatement = async (userInfo, query) => {
  const findQuery = {
    isDeleted: false,
    status: "completed",
    assignedDate: {
      $gte: moment(new Date(query.year, query.month, 1)).startOf("month"),
      $lte: moment(new Date(query.year, query.month, 1)).endOf("month"),
    },
  };

  // Add worker filter if workerId provided (and not empty string)
  if (query.workerId && query.workerId.trim() !== "") {
    findQuery.worker = query.workerId;
  }

  // Fetch all jobs for the month
  const data = await JobsModel.find(findQuery)
    .sort({ assignedDate: 1, _id: 1 })
    .populate([
      { path: "worker", model: "workers" },
      { path: "building", model: "buildings" },
      { path: "customer", model: "customers" },
      { path: "location", model: "locations" },
    ])
    .lean();

  const daysInMonth = moment(findQuery.assignedDate.$gte).daysInMonth();
  const monthName = moment(findQuery.assignedDate.$gte).format("MMMM");
  const year = moment(findQuery.assignedDate.$gte).format("YYYY");

  // =========================================================
  // SCENARIO 1: WORKER SELECTED - SHOW SCHEDULE (Not historical washes)
  // =========================================================
  if (query.workerId) {
    // ✅ Query customers to get current vehicle assignments for this worker
    const customers = await CustomersModel.find({
      isDeleted: false,
      "vehicles.worker": query.workerId,
      "vehicles.status": 1, // Only active vehicles
    }).lean();

    const carMap = new Map();
    const monthStart = moment(new Date(query.year, query.month, 1)).startOf(
      "month",
    );
    const monthEnd = moment(new Date(query.year, query.month, 1)).endOf(
      "month",
    );

    // Process each customer's vehicles assigned to this worker
    customers.forEach((customer) => {
      const customerName =
        `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
        customer.mobile ||
        "Unknown";

      customer.vehicles.forEach((vehicle) => {
        // Only process vehicles assigned to this worker
        if (vehicle.worker !== query.workerId || vehicle.status !== 1) return;

        // Check if vehicle is active during this month
        const vehicleStart = vehicle.start_date || vehicle.onboard_date;
        const vehicleEnd = vehicle.deactivateDate;

        // Skip if vehicle starts after month ends or ended before month starts
        if (vehicleStart && moment(vehicleStart).isAfter(monthEnd)) return;
        if (vehicleEnd && moment(vehicleEnd).isBefore(monthStart)) return;

        // Convert schedule_days to day names
        let scheduleDays = [];
        if (vehicle.schedule_days && Array.isArray(vehicle.schedule_days)) {
          scheduleDays = vehicle.schedule_days
            .map((d) => {
              if (typeof d === "object" && d.day) {
                const dayMap = {
                  Mon: "monday",
                  Tue: "tuesday",
                  Wed: "wednesday",
                  Thu: "thursday",
                  Fri: "friday",
                  Sat: "saturday",
                  Sun: "sunday",
                };
                return dayMap[d.day] || d.day.toLowerCase();
              }
              return typeof d === "string" ? d.toLowerCase() : "";
            })
            .filter((d) => d);
        }

        // Calculate schedule marks for each day in the month
        const dailyMarks = new Array(daysInMonth).fill(0);
        for (let day = 1; day <= daysInMonth; day++) {
          const currentDate = moment(new Date(query.year, query.month, day));

          // Check if date is within vehicle active period
          if (vehicleStart && currentDate.isBefore(moment(vehicleStart), "day"))
            continue;
          if (vehicleEnd && currentDate.isAfter(moment(vehicleEnd), "day"))
            continue;

          // Check if this day matches the schedule
          let isScheduled = false;
          if (vehicle.schedule_type === "daily") {
            isScheduled = true;
          } else if (
            vehicle.schedule_type === "weekly" &&
            scheduleDays.length > 0
          ) {
            const dayNames = [
              "sunday",
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
            ];
            const dayName = dayNames[currentDate.day()];
            isScheduled = scheduleDays.includes(dayName);
          }

          if (isScheduled) {
            dailyMarks[day - 1] = 1; // Mark as scheduled
          }
        }

        const carKey = vehicle._id.toString();
        carMap.set(carKey, {
          parkingNo: vehicle.parking_no || "",
          carNumber: vehicle.registration_no || "",
          customerName: customerName,
          dateOfStart: vehicleStart
            ? moment(vehicleStart).format("DD-MMM")
            : "-",
          cleaning:
            vehicle.schedule_type === "daily"
              ? "D"
              : vehicle.schedule_type === "onetime"
                ? "OT"
                : "W3",
          dailyMarks: dailyMarks,
          amount: vehicle.amount || 0,
          duDate: vehicleEnd ? moment(vehicleEnd).format("DD-MMM") : "-",
          workerName: "",
          locationName: "",
          buildingName: "",
          tips: 0,
          scheduleType: vehicle.schedule_type || "daily",
          scheduleDays: scheduleDays,
          startDate: vehicleStart,
          endDate: vehicleEnd,
        });
      });
    });

    const carList = Array.from(carMap.values());

    // If format is JSON (For PDF/Preview), return raw data
    if (query.format === "json") {
      return carList;
    }

    // Note: Excel logic uses the same data structure below
  }

  // =========================================================
  // SCENARIO 2: NO WORKER SELECTED (Worker Summary Report)
  // =========================================================
  const workerMap = new Map();

  data.forEach((job) => {
    const workerId = job.worker?._id?.toString() || "unassigned";
    const workerName = job.worker?.name || "Unassigned";
    const dayOfMonth = moment(job.assignedDate).tz("Asia/Dubai").date();

    if (!workerMap.has(workerId)) {
      workerMap.set(workerId, {
        workerId,
        workerName,
        dailyCounts: new Array(daysInMonth).fill(0),
        tips: 0, // ✅ Initialize tips to 0
      });
    }

    const workerData = workerMap.get(workerId);

    // ✅ Accumulate Tips here (Fixing the 0 issue)
    workerData.tips += Number(job.tips) || 0;

    if (dayOfMonth >= 1 && dayOfMonth <= daysInMonth) {
      workerData.dailyCounts[dayOfMonth - 1]++;
    }
  });

  const workerSummaries = Array.from(workerMap.values());

  // ✅ Return JSON if requested
  if (query.format === "json") {
    return workerSummaries.map((worker, index) => ({
      slNo: index + 1,
      workerId: worker.workerId, // ✅ Include workerId for filtering
      name: worker.workerName,
      workerName: worker.workerName, // ✅ Include for consistency
      dailyCounts: worker.dailyCounts,
      tips: worker.tips, // ✅ Send tips to frontend
    }));
  }

  // =========================================================
  // EXCEL GENERATION (Shared Logic)
  // =========================================================
  const workbook = new exceljs.Workbook();
  const reportSheet = workbook.addWorksheet("Report");

  // Set row heights
  reportSheet.getRow(1).height = 40;
  reportSheet.getRow(2).height = 20;

  const isWorkerSelected = query.workerId && data.length > 0;
  const selectedWorkerName = isWorkerSelected
    ? data[0]?.worker?.name
    : "ALL WORKERS";
  const locationName = isWorkerSelected
    ? data[0]?.location?.name
    : "RESIDENCE LOCATIONS";

  // --- HEADER ROW 1: Company Name with Logo Space ---
  // Adjusted columns to include "Tips" column
  const totalCols = isWorkerSelected
    ? 5 + daysInMonth + 3
    : 2 + daysInMonth + 1;

  reportSheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = reportSheet.getCell("A1");
  titleCell.value = "BABA CAR WASHING&CLEANING L.L.C";

  // Add logo image if it exists
  const path = require("path");
  const fs = require("fs");
  const possibleLogoPaths = [
    path.join(__dirname, "../../../../../admin-panel/public/carwash.jpeg"),
    path.join(process.cwd(), "public/carwash.jpeg"),
    path.join(process.cwd(), "../admin-panel/public/carwash.jpeg"),
  ];

  let logoPath = null;
  for (const testPath of possibleLogoPaths) {
    if (fs.existsSync(testPath)) {
      logoPath = testPath;
      break;
    }
  }

  if (logoPath) {
    try {
      const imageId = workbook.addImage({
        filename: logoPath,
        extension: "jpeg",
      });

      reportSheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 80, height: 40 },
        editAs: "oneCell",
      });
    } catch (err) {
      console.warn("Could not add logo to Excel:", err.message);
    }
  }

  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "00B050" },
  };
  titleCell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  // --- HEADER ROW 2: Month/Location/Cleaner info ---
  if (isWorkerSelected) {
    reportSheet.mergeCells(2, 1, 2, Math.ceil(totalCols / 3));
    const monthCell = reportSheet.getCell("A2");
    monthCell.value = `Month & Year: ${monthName.toUpperCase()} ${year}`;
    monthCell.font = { bold: true, size: 10 };
    monthCell.alignment = { horizontal: "center", vertical: "middle" };
    monthCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9D9D9" },
    };

    const midCol = Math.ceil(totalCols / 3) + 1;
    const endCol = Math.ceil((totalCols * 2) / 3);
    reportSheet.mergeCells(2, midCol, 2, endCol);
    const locationCell = reportSheet.getCell(2, midCol);
    locationCell.value = `LOCATION: ${locationName}`;
    locationCell.font = { bold: true, size: 10 };
    locationCell.alignment = { horizontal: "center", vertical: "middle" };
    locationCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9D9D9" },
    };

    reportSheet.mergeCells(2, endCol + 1, 2, totalCols);
    const cleanerCell = reportSheet.getCell(2, endCol + 1);
    cleanerCell.value = `CLEANER'S NAME: ${selectedWorkerName}`;
    cleanerCell.font = { bold: true, size: 10 };
    cleanerCell.alignment = { horizontal: "center", vertical: "middle" };
    cleanerCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9D9D9" },
    };
  } else {
    reportSheet.mergeCells(2, 1, 2, totalCols);
    const subtitleCell = reportSheet.getCell("A2");
    subtitleCell.value = `${monthName.toUpperCase()} ${year} - RESIDENCE LOCATIONS ONLY`;
    subtitleCell.font = { bold: true, size: 11 };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    subtitleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9D9D9" },
    };
  }

  // --- ROW 3: Column Headers (Added TIPS) ---
  let headerRow1;
  if (isWorkerSelected) {
    headerRow1 = reportSheet.addRow([
      "S.N O",
      "PARKING NO",
      "CAR NO.",
      "DATE OF START",
      "CLEANING",
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
      "Total",
      "Tips", // ✅ Added Tips Header
      "DU DATE",
    ]);
  } else {
    headerRow1 = reportSheet.addRow([
      "Sl. No",
      "Name",
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
      "Total",
      "Tips", // ✅ Added Tips Header
    ]);
  }

  headerRow1.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "1F4E78" },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    const dayColumnStart = isWorkerSelected ? 5 : 2;
    if (
      colNumber > dayColumnStart &&
      colNumber <= dayColumnStart + daysInMonth
    ) {
      const dayIndex = colNumber - dayColumnStart - 1;
      const date = moment(findQuery.assignedDate.$gte).add(dayIndex, "days");
      if (date.day() === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF00" },
        };
        cell.font = { bold: true, size: 10, color: { argb: "000000" } };
      }
    }
  });

  // --- ROW 4: Day Names ---
  let dayNamesRow;
  if (isWorkerSelected) {
    dayNamesRow = reportSheet.addRow([
      "",
      "",
      "",
      "",
      "",
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const date = moment(findQuery.assignedDate.$gte).add(i, "days");
        return date.format("ddd").substring(0, 2);
      }),
      "",
      "",
      "",
    ]);
  } else {
    dayNamesRow = reportSheet.addRow([
      "",
      "",
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const date = moment(findQuery.assignedDate.$gte).add(i, "days");
        return date.format("ddd").substring(0, 2);
      }),
      "",
      "",
    ]);
  }

  dayNamesRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    const dayColumnStart = isWorkerSelected ? 5 : 2;
    if (
      colNumber > dayColumnStart &&
      colNumber <= dayColumnStart + daysInMonth
    ) {
      const dayIndex = colNumber - dayColumnStart - 1;
      const date = moment(findQuery.assignedDate.$gte).add(dayIndex, "days");
      if (date.day() === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF00" },
        };
      }
    }
  });

  // --- DATA ROWS ---
  let rowNumber = 1;
  let dataSource;

  if (isWorkerSelected) {
    // We already calculated the carMap above for JSON, we can regenerate or reuse.
    // Regenerating for clean Excel logic scope:
    const carMapExcel = new Map();
    data.forEach((job) => {
      let vehicleInfo = null;
      if (job.customer && job.customer.vehicles && job.vehicle) {
        vehicleInfo = job.customer.vehicles.find(
          (v) => v._id.toString() === job.vehicle.toString(),
        );
      }
      const carKey = job.vehicle
        ? job.vehicle.toString()
        : `unknown_${job._id}`;
      const dayOfMonth = moment(job.assignedDate).tz("Asia/Dubai").date();

      if (!carMapExcel.has(carKey)) {
        carMapExcel.set(carKey, {
          parkingNo: vehicleInfo?.parking_no || "",
          carNumber: vehicleInfo?.registration_no || "",
          dateOfStart: moment(job.assignedDate).format("DD-MMM"),
          cleaning: job.immediate ? "D" : "W3",
          dailyMarks: Array(daysInMonth).fill(0),
          amount: job.price || 0,
          duDate: moment(job.completedDate || job.assignedDate).format(
            "DD-MMM",
          ),
          tips: 0,
        });
      }
      const carData = carMapExcel.get(carKey);
      carData.tips += Number(job.tips) || 0; // Sum tips
      if (dayOfMonth >= 1 && dayOfMonth <= daysInMonth)
        carData.dailyMarks[dayOfMonth - 1]++;
    });
    dataSource = Array.from(carMapExcel.values());
  } else {
    dataSource = workerSummaries; // We can reuse this from JSON calculation earlier
  }

  for (const item of dataSource) {
    let rowData;
    if (isWorkerSelected) {
      // Calculate row total for car
      const rowTotal = item.dailyMarks.reduce((a, b) => a + b, 0);
      rowData = [
        rowNumber,
        item.parkingNo,
        item.carNumber,
        item.dateOfStart,
        item.cleaning,
        ...item.dailyMarks.map((count) => (count > 0 ? count : "")),
        rowTotal,
        item.tips, // ✅ Added Tips
        item.duDate,
      ];
    } else {
      const rowTotal = item.dailyCounts.reduce((a, b) => a + b, 0);
      rowData = [
        rowNumber,
        item.name,
        ...item.dailyCounts.map((count) => (count > 0 ? count : "")),
        rowTotal,
        item.tips, // ✅ Added Tips
      ];
    }

    const dataRow = reportSheet.addRow(rowData);
    rowNumber++;

    dataRow.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { size: 9 };

      if (
        (!isWorkerSelected && colNumber === 2) ||
        (isWorkerSelected && colNumber === 2)
      ) {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }

      const dayColumnStart = isWorkerSelected ? 5 : 2;
      if (
        colNumber > dayColumnStart &&
        colNumber <= dayColumnStart + daysInMonth
      ) {
        const dayIndex = colNumber - dayColumnStart - 1;
        const date = moment(findQuery.assignedDate.$gte).add(dayIndex, "days");
        if (date.day() === 0) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFF00" },
          };
        }
      }
    });
  }

  // --- SUMMARY ROW ---
  const dayCounts = new Array(daysInMonth).fill(0);
  let totalAllTips = 0;
  let totalAllCars = 0;

  if (isWorkerSelected) {
    data.forEach((job) => {
      const dayOfMonth = moment(job.assignedDate).tz("Asia/Dubai").date();
      if (dayOfMonth >= 1 && dayOfMonth <= daysInMonth)
        dayCounts[dayOfMonth - 1]++;
      totalAllTips += Number(job.tips) || 0;
      totalAllCars++;
    });
  } else {
    workerSummaries.forEach((worker) => {
      worker.dailyCounts.forEach((count, dayIndex) => {
        dayCounts[dayIndex] += count;
      });
      totalAllTips += worker.tips;
      totalAllCars += worker.dailyCounts.reduce((a, b) => a + b, 0);
    });
  }

  let summaryRow;
  if (isWorkerSelected) {
    summaryRow = reportSheet.addRow([
      "",
      "Total Cleaned Cars",
      "",
      "",
      "",
      ...dayCounts,
      totalAllCars,
      totalAllTips, // ✅ Total Tips
      "",
    ]);
  } else {
    summaryRow = reportSheet.addRow([
      "",
      "Total Cleaned Cars",
      ...dayCounts,
      totalAllCars,
      totalAllTips, // ✅ Total Tips
    ]);
  }

  summaryRow.eachCell((cell, colNumber) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    cell.font = { bold: true, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D3D3D3" },
    };
    if (colNumber === 2)
      cell.alignment = { horizontal: "left", vertical: "middle" };

    const dayColumnStart = isWorkerSelected ? 5 : 2;
    if (
      colNumber > dayColumnStart &&
      colNumber <= dayColumnStart + daysInMonth
    ) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      const dayIndex = colNumber - dayColumnStart - 1;
      const date = moment(findQuery.assignedDate.$gte).add(dayIndex, "days");
      if (date.day() === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF00" },
        };
      }
    }
  });

  // Set column widths
  if (isWorkerSelected) {
    reportSheet.getColumn(1).width = 6;
    reportSheet.getColumn(2).width = 12;
    reportSheet.getColumn(3).width = 15;
    reportSheet.getColumn(4).width = 12;
    reportSheet.getColumn(5).width = 10;
    for (let i = 6; i <= 5 + daysInMonth; i++) {
      reportSheet.getColumn(i).width = 3.5;
    }
    reportSheet.getColumn(6 + daysInMonth).width = 10;
    reportSheet.getColumn(7 + daysInMonth).width = 10;
    reportSheet.getColumn(8 + daysInMonth).width = 10; // DU Date
  } else {
    reportSheet.getColumn(1).width = 8;
    reportSheet.getColumn(2).width = 20;
    for (let i = 3; i <= 2 + daysInMonth; i++) {
      reportSheet.getColumn(i).width = 4;
    }
    reportSheet.getColumn(3 + daysInMonth).width = 10; // Total
    reportSheet.getColumn(4 + daysInMonth).width = 10; // Tips
  }

  return workbook;
};
