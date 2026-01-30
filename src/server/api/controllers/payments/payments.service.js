const moment = require("moment");
const exceljs = require("exceljs");
const mongoose = require("mongoose");

const PaymentsModel = require("../../models/payments.model");
const PaymentSettlementsModel = require("../../models/payment-settlements.model");
const TransactionsModel = require("../../models/transactions.model");
const WorkersModel = require("../../models/workers.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");

const service = module.exports;

service.list = async (userInfo, query) => {
  try {
    console.log("🔵 [SERVICE] Payments list started with query:", query);
    const paginationData = CommonHelper.paginationData(query);

    // Validate and parse dates
    let dateFilter = null;
    if (query.startDate && query.startDate.trim() !== "") {
      const startDate = new Date(query.startDate);

      // Check if startDate is valid
      if (!isNaN(startDate.getTime())) {
        dateFilter = {
          createdAt: {
            $gte: startDate,
          },
        };

        // Add endDate if provided and valid
        if (query.endDate && query.endDate.trim() !== "") {
          const endDate = new Date(query.endDate);
          if (!isNaN(endDate.getTime())) {
            dateFilter.createdAt.$lte = endDate;
          }
        }
      } else {
        console.warn(
          "⚠️ [SERVICE] Invalid startDate format, skipping date filter",
        );
      }
    }

    const findQuery = {
      isDeleted: false,
      ...dateFilter,
      onewash: query.onewash == "true",
      ...(query.status ? { status: query.status } : null),
      ...(query.worker && query.worker.trim() !== ""
        ? { worker: query.worker }
        : null),
      ...(query.building && query.building.trim() !== ""
        ? { building: query.building }
        : null),
      ...(query.mall && query.mall.trim() !== "" ? { mall: query.mall } : null),
      ...(query.search
        ? {
            $or: [
              {
                "vehicle.registration_no": {
                  $regex: query.search,
                  $options: "i",
                },
              },
              { "vehicle.parking_no": { $regex: query.search, $options: "i" } },
            ],
          }
        : null),
    };
    console.log("🔍 [SERVICE] Find query:", JSON.stringify(findQuery, null, 2));

    const total = await PaymentsModel.countDocuments(findQuery);
    console.log("📊 [SERVICE] Total count:", total);

    // Fetch data without populate first
    let data = await PaymentsModel.find(findQuery)
      .sort({ _id: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .lean();

    console.log(
      "📦 [SERVICE] Data fetched (unpopulated):",
      data.length,
      "records",
    );

    // CRITICAL FIX: Convert empty strings to null before populating
    // Mongoose populate fails on empty strings "" - they must be null or valid ObjectIds
    data = data.map((payment) => {
      if (payment.worker === "") payment.worker = null;
      if (payment.building === "") payment.building = null;
      if (payment.customer && payment.customer.building === "")
        payment.customer.building = null;
      if (payment.customer && payment.customer.location === "")
        payment.customer.location = null;
      return payment;
    });

    // Try to populate each reference separately and catch errors
    try {
      // Populate worker (filter out null values)
      data = await PaymentsModel.populate(data, {
        path: "worker",
        model: "workers",
      });
      console.log("✅ [SERVICE] Workers populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Worker populate failed:", e.message);
    }

    try {
      // Populate building (direct field on payment)
      data = await PaymentsModel.populate(data, {
        path: "building",
        model: "buildings",
      });
      console.log("✅ [SERVICE] Buildings populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Building populate failed:", e.message);
    }

    try {
      // Populate mall (usually reliable)
      data = await PaymentsModel.populate(data, {
        path: "mall",
        model: "malls",
      });
      console.log("✅ [SERVICE] Malls populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Mall populate failed:", e.message);
    }

    try {
      // Populate job (usually reliable)
      data = await PaymentsModel.populate(data, { path: "job", model: "jobs" });
      console.log("✅ [SERVICE] Jobs populated");
    } catch (e) {
      console.warn("⚠️ [SERVICE] Job populate failed:", e.message);
    }

    try {
      // Populate customer (may have issues with nested location/building)
      data = await PaymentsModel.populate(data, {
        path: "customer",
        model: "customers",
      });
      console.log("✅ [SERVICE] Customers populated");

      // Try nested populates
      try {
        data = await PaymentsModel.populate(data, {
          path: "customer.building",
          model: "buildings",
        });
        console.log("✅ [SERVICE] Buildings populated");
      } catch (e) {
        console.warn("⚠️ [SERVICE] Building populate failed:", e.message);
      }

      try {
        data = await PaymentsModel.populate(data, {
          path: "customer.location",
          model: "locations",
        });
        console.log("✅ [SERVICE] Locations populated");
      } catch (e) {
        console.warn(
          "⚠️ [SERVICE] Location populate failed (expected for empty strings):",
          e.message,
        );
      }
    } catch (e) {
      console.warn("⚠️ [SERVICE] Customer populate failed:", e.message);
    }

    console.log("📦 [SERVICE] Final data count:", data.length, "records");

    // Log sample populated data for debugging
    if (data.length > 0) {
      console.log("🔍 [SERVICE] Sample payment document structure:");
      console.log("- building:", data[0].building);
      console.log("- worker:", data[0].worker);
      console.log("- customer.building:", data[0].customer?.building);
    }

    const totalPayments = await PaymentsModel.aggregate([
      { $match: findQuery },
      { $group: { _id: "$payment_mode", amount: { $sum: "$amount_paid" } } },
    ]);
    const totalAmount = totalPayments.length
      ? totalPayments.reduce((p, c) => p + c.amount, 0)
      : 0;
    const cash = totalPayments.length
      ? totalPayments.filter((e) => e._id == "cash")
      : 0;
    const card = totalPayments.length
      ? totalPayments.filter((e) => e._id == "card")
      : 0;
    const bank = totalPayments.length
      ? totalPayments.filter((e) => e._id == "bank transfer")
      : 0;
    const counts = {
      totalJobs: total,
      totalAmount,
      cash: cash.length ? cash[0].amount : 0,
      card: card.length ? card[0].amount : 0,
      bank: bank.length ? bank[0].amount : 0,
    };

    console.log("✅ [SERVICE] Returning data with counts:", counts);
    return { total, data, counts };
  } catch (error) {
    console.error("❌ [SERVICE] Error in payments list:", error);
    throw error;
  }
};

service.info = async (userInfo, id) => {
  return PaymentsModel.findOne({ _id: id, isDeleted: false }).lean();
};

service.create = async (userInfo, payload) => {
  const id = await CounterService.id("payments");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  await new PaymentsModel(data).save();
};

service.update = async (userInfo, id, payload) => {
  await PaymentsModel.updateOne({ _id: id }, { $set: payload });
};

service.delete = async (userInfo, id, payload) => {
  return await PaymentsModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id },
  );
};

service.undoDelete = async (userInfo, id) => {
  return await PaymentsModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id },
  );
};

service.updatePayment = async (userInfo, id, payload) => {
  const updatePayload = {
    $set: {
      total_amount: payload.total_amount,
      notes: payload.notes,
    },
  };
  await PaymentsModel.updateOne({ _id: id }, updatePayload);
};

service.collectPayment = async (userInfo, id, payload) => {
  const paymentData = await PaymentsModel.findOne({ _id: id }).lean();

  let status =
    Number(payload.amount) <
    paymentData.amount_charged - paymentData.amount_paid
      ? "pending"
      : "completed";
  let balance =
    paymentData.amount_charged +
    paymentData.old_balance -
    (paymentData.amount_paid + payload.amount);

  await PaymentsModel.updateOne(
    { _id: id },
    {
      $set: {
        amount_paid: Number(paymentData.amount_paid + payload.amount),
        payment_mode: payload.payment_mode,
        balance,
        status,
        collectedDate: payload.payment_date,
      },
    },
  );

  await new TransactionsModel({
    payment: id,
    amount: Number(payload.amount),
    payment_date: payload.payment_date,
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
  }).save();
};

service.settlements = async (userInfo, query) => {
  try {
    console.log("=== SETTLEMENTS SERVICE START ===");
    console.log("UserInfo:", JSON.stringify(userInfo, null, 2));
    console.log("Query:", JSON.stringify(query, null, 2));

    const paginationData = CommonHelper.paginationData(query);
    console.log("Pagination data:", paginationData);

    const findQuery = {
      isDeleted: false,
      ...(userInfo.role == "supervisor" ? { supervisor: userInfo._id } : {}),
    };
    console.log("Find query:", JSON.stringify(findQuery, null, 2));

    const total = await PaymentSettlementsModel.countDocuments(findQuery);
    console.log("Total settlements found:", total);

    // First, get raw data without any population
    const rawData = await PaymentSettlementsModel.find(findQuery)
      .sort({ _id: -1 })
      .skip(paginationData.skip)
      .limit(paginationData.limit)
      .lean();

    console.log("Raw data fetched:", rawData.length, "records");
    if (rawData.length > 0) {
      console.log("Sample raw record:", JSON.stringify(rawData[0], null, 2));
    }

    const data = [];

    // Manually process each settlement
    for (let i = 0; i < rawData.length; i++) {
      const iterator = rawData[i];
      console.log(
        `Processing settlement ${i + 1}/${rawData.length}`,
        iterator._id,
      );

      // Handle supervisor - check if it's an ObjectId or a string name
      if (iterator.supervisor) {
        if (
          mongoose.Types.ObjectId.isValid(iterator.supervisor) &&
          iterator.supervisor.length === 24
        ) {
          // It's a valid ObjectId, try to populate
          try {
            const supervisor = await mongoose
              .model("users")
              .findById(iterator.supervisor)
              .lean();
            iterator.supervisor = supervisor || { name: "Unknown" };
            console.log(
              "Supervisor populated from ObjectId:",
              iterator.supervisor.name,
            );
          } catch (err) {
            console.error("Error populating supervisor:", err.message);
            iterator.supervisor = { name: "Unknown" };
          }
        } else {
          // It's a string name, use it directly
          console.log("Supervisor is a name string:", iterator.supervisor);
          iterator.supervisor = { name: iterator.supervisor };
        }
      } else {
        iterator.supervisor = { name: "Unknown" };
      }

      // Handle payments array
      if (!Array.isArray(iterator.payments)) {
        console.log("Payments is not an array, converting...");
        iterator.payments = [];
      }

      console.log("Payments array length:", iterator.payments.length);

      // Populate payments if they are ObjectIds
      const populatedPayments = [];
      for (let j = 0; j < iterator.payments.length; j++) {
        const paymentId = iterator.payments[j];
        try {
          if (
            mongoose.Types.ObjectId.isValid(paymentId) &&
            typeof paymentId === "string" &&
            paymentId.length === 24
          ) {
            const payment = await mongoose
              .model("payments")
              .findById(paymentId)
              .lean();
            if (payment) {
              populatedPayments.push(payment);
            }
          } else {
            console.log("Invalid or non-ObjectId payment:", paymentId);
          }
        } catch (err) {
          console.error("Error populating payment:", err.message);
        }
      }
      iterator.payments = populatedPayments;
      console.log("Populated payments count:", iterator.payments.length);

      // Calculate amounts
      iterator.amount = iterator.payments.reduce(
        (p, c) => p + (c?.amount_paid || 0),
        0,
      );
      iterator.cash = iterator.payments
        .filter((e) => e?.payment_mode == "cash")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);
      iterator.card = iterator.payments
        .filter((e) => e?.payment_mode == "card")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);
      iterator.bank = iterator.payments
        .filter((e) => e?.payment_mode == "bank transfer")
        .reduce((p, c) => p + (c?.amount_paid || 0), 0);

      console.log(
        "Calculated amounts - Total:",
        iterator.amount,
        "Cash:",
        iterator.cash,
        "Card:",
        iterator.card,
        "Bank:",
        iterator.bank,
      );

      data.push(iterator);
    }

    console.log(
      "Processed data successfully, returning",
      data.length,
      "records",
    );
    console.log("=== SETTLEMENTS SERVICE END ===");
    return { total, data };
  } catch (error) {
    console.error("!!! SERVICE SETTLEMENTS ERROR !!!");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    throw error;
  }
};

service.updateSettlements = async (id, userInfo, payload) => {
  return PaymentSettlementsModel.updateOne(
    { _id: id },
    { $set: { status: "completed", updatedBy: userInfo._id } },
  );
};

service.settlePayment = async (userInfo, id, payload) => {
  await PaymentsModel.updateMany(
    { _id: { $in: payload.paymentIds } },
    {
      $set: {
        settled: "completed",
        settledDate: new Date(),
        payment_settled_date: new Date(),
      },
    },
  );
};

// ✅ UPDATED EXPORT DATA (Excel Fix)
service.exportData = async (userInfo, query) => {
  const findQuery = {
    isDeleted: false,
    // Fix: check strictly for 'true' string
    onewash: query.onewash === "true",

    // EXCLUDE empty strings at DB level if possible, but safer to do in JS for existing bad data
    building: { $ne: "" },
    worker: { $ne: "" },

    ...(query.status ? { status: query.status } : null),
  };

  // Date Filter
  if (query.startDate && query.startDate !== "null") {
    const start = new Date(query.startDate);
    if (!isNaN(start.getTime())) {
      let end = query.endDate
        ? new Date(query.endDate)
        : new Date(query.startDate);
      if (!query.endDate || query.endDate.length <= 10) {
        end.setHours(23, 59, 59, 999);
      }
      if (!isNaN(end.getTime())) {
        findQuery.createdAt = { $gte: start, $lte: end };
      }
    }
  }

  // Worker/Building Filters
  if (isValidId(query.worker)) findQuery.worker = query.worker;
  if (isValidId(query.building)) findQuery.building = query.building;

  // Search Logic
  if (query.search) {
    findQuery.$or = [
      { "vehicle.registration_no": { $regex: query.search, $options: "i" } },
      { "vehicle.parking_no": { $regex: query.search, $options: "i" } },
    ];
  }

  // 1. Fetch RAW data (No Populate yet to avoid crash)
  let data = await PaymentsModel.find(findQuery).sort({ _id: -1 }).lean();

  // 2. Filter out bad data (Double safety)
  data = data.filter((item) => {
    // Allow items where building/worker is null/undefined (unassigned),
    // BUT exclude items where they are empty strings ""
    const validBuilding =
      item.building === null ||
      item.building === undefined ||
      isValidId(item.building);
    const validWorker =
      item.worker === null ||
      item.worker === undefined ||
      isValidId(item.worker);
    return validBuilding && validWorker;
  });

  // 3. Safe Populate
  try {
    data = await PaymentsModel.populate(data, [
      {
        path: "customer",
        model: "customers",
        select: "mobile firstName lastName",
      },
      { path: "job", model: "jobs" },
      { path: "worker", model: "workers", select: "name" },
      { path: "mall", model: "malls", select: "name" },
      { path: "building", model: "buildings", select: "name" },
    ]);
  } catch (e) {
    console.error("Export Populate Warning:", e.message);
  }

  // 4. Generate Excel
  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet("Payments Report");

  worksheet.columns = [
    { header: "Date", key: "createdAt", width: 15 },
    { header: "Time", key: "time", width: 15 },
    { header: "Vehicle No", key: "vehicle", width: 20 },
    { header: "Parking No", key: "parking_no", width: 15 },
    { header: "Worker", key: "worker", width: 25 },
    { header: "Location", key: "location", width: 30 },
    { header: "Amount Paid", key: "amount_paid", width: 15 },
    { header: "Payment Mode", key: "payment_mode", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Settle Status", key: "settled", width: 15 },
  ];

  worksheet.getRow(1).font = { bold: true };

  data.forEach((item) => {
    const dateObj = new Date(item.createdAt);
    let locationName = item.mall?.name || item.building?.name || "-";

    worksheet.addRow({
      createdAt: moment(dateObj).format("YYYY-MM-DD"),
      time: moment(dateObj).format("hh:mm A"),
      vehicle: item.vehicle?.registration_no || "-",
      parking_no: item.vehicle?.parking_no || "-",
      worker: item.worker?.name || "Unassigned",
      location: locationName,
      amount_paid: item.amount_paid || 0,
      payment_mode: item.payment_mode || "-",
      status: item.status || "pending",
      settled: item.settled || "pending",
    });
  });

  return workbook;
};

// ✅ UPDATED MONTHLY STATEMENT (PDF Fix)
// ✅ UPDATED MONTHLY COLLECTION SHEET (Matches 17-Field Requirement)
service.monthlyStatement = async (userInfo, query) => {
  // 1. Setup Date Range (Postpaid Cycle)
  // If user selects "January", we look for bills generated in January
  const startOfMonth = moment(new Date(query.year, query.month, 1))
    .startOf("month")
    .utc()
    .format();
  const endOfMonth = moment(new Date(query.year, query.month, 1))
    .endOf("month")
    .utc()
    .format();

  const findQuery = {
    isDeleted: false,
    onewash: query.service_type === "onewash",
    building: { $ne: "" },
    worker: { $ne: "" },
    createdAt: { $gte: startOfMonth, $lte: endOfMonth },
  };

  // 2. Apply Filters
  if (isValidId(query.worker)) {
    findQuery.worker = query.worker;
  } else if (isValidId(query.building)) {
    const workers = await WorkersModel.find(
      { isDeleted: false, buildings: query.building },
      { _id: 1 },
    ).lean();
    findQuery.worker = { $in: workers.map((e) => e._id) };
  }

  // 3. Fetch Data
  let data = await PaymentsModel.find(findQuery)
    // .sort({ "vehicle.parking_no": 1 }) // Use this if parking_no is at root, otherwise sort in JS
    .lean();

  // 4. Populate
  try {
    data = await PaymentsModel.populate(data, [
      { path: "job", model: "jobs" },
      { path: "worker", model: "workers", select: "name" },
      { path: "building", model: "buildings", select: "name" },
      {
        path: "customer",
        model: "customers",
        populate: { path: "building", model: "buildings", select: "name" },
      },
    ]);
  } catch (err) {
    console.error("Populate Warning:", err.message);
  }

  // 5. Helper to Format Data into 17 Fields
  const formatRecord = (item, index) => {
    let vehicle = null;
    // Try to find vehicle details in customer array matches
    if (item.customer && item.customer.vehicles) {
      // Assuming item.vehicle stores registration_no or object with it
      const regNo = item.vehicle?.registration_no || item.vehicle;
      vehicle = item.customer.vehicles.find((v) => v.registration_no === regNo);
    }

    // Calculation Logic
    const subscriptionAmount = item.amount_charged || 0; // Current Month Charge
    const prevDue = item.old_balance || 0; // Previous Pending Due
    const totalDue = item.total_amount || 0; // Total Amount Due
    const paid = item.amount_paid || 0; // Paid Amount
    const balance = totalDue - paid; // Balance Amount

    // 17 Fields Mapping
    return {
      slNo: index + 1, // 1. Serial Number
      parkingNo: item.vehicle?.parking_no || "-", // 2. Parking Number
      carNo: item.vehicle?.registration_no || "-", // 3. Car Number
      mobile: item.customer?.mobile || "No Mobile", // 4. Mobile Number
      flatNo: item.customer?.flat_no || "-", // 5. Flat Number
      startDate: vehicle
        ? moment(vehicle.start_date).format("DD-MM-YYYY")
        : "-", // 6. Start Date
      schedule: vehicle
        ? vehicle.schedule_type === "daily"
          ? "Daily"
          : `Weekly (${vehicle.schedule_days?.length || 0})`
        : "-", // 7. Weekly Schedule
      advance: vehicle?.advance_amount ? "Yes" : "No", // 8. Advance Payment Option
      subAmount: subscriptionAmount, // 9. Subscription Amount
      prevDue: prevDue, // 10. Previous Payment Due
      totalDue: totalDue, // 11. Total Amount Due
      paid: paid, // 12. Paid Amount
      balance: balance, // 13. Balance Amount
      payDate: item.collectedDate
        ? moment(item.collectedDate).format("DD-MM-YYYY")
        : "-", // 14. Payment Date
      receipt: item.receipt_no || item._id.toString().slice(-6).toUpperCase(), // 15. Receipt Number (System Gen)
      dueDate: moment(item.createdAt).endOf("month").format("DD-MM-YYYY"), // 16. Payment Due Date (End of billing month)
      remarks: item.notes || "-", // 17. Remarks

      // Extra metadata for Grouping
      buildingName:
        item.building?.name ||
        item.customer?.building?.name ||
        "Unknown Building",
      workerName: item.worker?.name || "Unassigned",
    };
  };

  // --- A. JSON RESPONSE (For Frontend PDF Generation) ---
  if (query.format === "json") {
    // Group by Building -> Worker
    const result = [];
    const grouped = {};

    data.forEach((item, index) => {
      const formatted = formatRecord(item, index);
      const bKey = formatted.buildingName;
      const wKey = formatted.workerName;

      if (!grouped[bKey]) grouped[bKey] = {};
      if (!grouped[bKey][wKey]) grouped[bKey][wKey] = [];

      grouped[bKey][wKey].push(formatted);
    });

    Object.keys(grouped).forEach((bName) => {
      const workers = [];
      Object.keys(grouped[bName]).forEach((wName) => {
        workers.push({
          workerName: wName,
          payments: grouped[bName][wName],
        });
      });
      result.push({ buildingName: bName, workers: workers });
    });

    return result;
  }

  // --- B. EXCEL RESPONSE (Standard Download) ---
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet("Collection Sheet");

  // 1. Define Columns (17 Required Fields)
  sheet.columns = [
    { header: "Serial Number", key: "slNo", width: 12 },
    { header: "Parking Number", key: "parkingNo", width: 15 },
    { header: "Car Number", key: "carNo", width: 15 },
    { header: "Mobile Number", key: "mobile", width: 15 },
    { header: "Flat Number", key: "flatNo", width: 12 },
    { header: "Cust. Start Date", key: "startDate", width: 15 },
    { header: "Weekly Schedule", key: "schedule", width: 15 },
    { header: "Adv. Pay Option", key: "advance", width: 12 },
    { header: "Subscript. Amount", key: "subAmount", width: 15 },
    { header: "Prev. Payment Due", key: "prevDue", width: 15 },
    { header: "Total Amount Due", key: "totalDue", width: 15 },
    { header: "Paid Amount", key: "paid", width: 15 },
    { header: "Balance Amount", key: "balance", width: 15 },
    { header: "Payment Date", key: "payDate", width: 15 },
    { header: "Receipt Number", key: "receipt", width: 15 },
    { header: "Payment Due Date", key: "dueDate", width: 15 },
    { header: "Remarks", key: "remarks", width: 20 },
  ];

  // Style Header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  sheet.getRow(1).height = 30;

  // Add Data
  data.forEach((item, index) => {
    sheet.addRow(formatRecord(item, index));
  });

  return workbook;
};

service.bulkUpdateStatus = async (userInfo, payload) => {
  try {
    const { ids, status } = payload;
    console.log("🔵 [SERVICE] Bulk Update Status Started");
    console.log(`👉 IDs count: ${ids?.length}, Target Status: ${status}`);

    if (!ids || ids.length === 0) {
      console.warn("⚠️ [SERVICE] No IDs provided");
      return;
    }

    // 1. Fetch current documents to calculate values correctly
    const payments = await PaymentsModel.find({ _id: { $in: ids } });
    console.log(`📦 [SERVICE] Found ${payments.length} documents to update`);

    const bulkOps = [];

    for (const payment of payments) {
      const update = {
        status: status, // 'completed' or 'pending'
        updatedBy: userInfo._id,
      };

      // 2. ONLY Modify amounts if setting to COMPLETED
      if (status === "completed") {
        const total = Number(payment.total_amount) || 0;
        const paid = Number(payment.amount_paid) || 0;

        // Only auto-fill payment if they haven't paid fully yet
        if (paid < total) {
          console.log(
            `💰 [SERVICE] Auto-settling payment ${payment._id}: Total ${total}, Paid ${paid} -> New Paid: ${total}`,
          );

          update.amount_paid = total;
          update.balance = 0; // Balance becomes 0
          update.collectedDate = new Date(); // Mark collected now

          // Only set payment mode if it's missing (don't overwrite if they set it before)
          if (!payment.payment_mode) {
            update.payment_mode = "cash";
          }
        }
      }
      // 3. If setting back to PENDING, we DO NOT reset money (safety)
      // If you want to reset money on pending, tell me. For now, we leave money as is to prevent data loss.

      // 4. Push to Bulk Operations
      bulkOps.push({
        updateOne: {
          filter: { _id: payment._id },
          update: { $set: update }, // $set ONLY modifies specific fields, keeps Worker/Vehicle intact
        },
      });
    }

    if (bulkOps.length > 0) {
      console.log(`🚀 [SERVICE] Executing ${bulkOps.length} updates...`);
      const result = await PaymentsModel.bulkWrite(bulkOps);
      console.log("✅ [SERVICE] Bulk write result:", JSON.stringify(result));
    } else {
      console.log("⚠️ [SERVICE] No operations to execute.");
    }

    return { message: "Updated successfully", count: ids.length };
  } catch (error) {
    console.error("❌ [SERVICE] Bulk Update Error:", error);
    throw error;
  }
};

const isValidId = (id) => {
  if (!id) return false;
  return typeof id === "string"
    ? /^[0-9a-fA-F]{24}$/.test(id)
    : mongoose.Types.ObjectId.isValid(id);
};
// ✅ UPDATED MONTHLY STATEMENT (View + Excel + PDF Support)
service.monthlyStatement = async (userInfo, query) => {
  console.log("🔵 [BACKEND] monthlyStatement started");
  console.log("👉 Filters Received:", JSON.stringify(query, null, 2));

  // 1. Setup Date Range
  const startOfMonth = moment(new Date(query.year, query.month, 1))
    .startOf("month")
    .utc()
    .format();
  const endOfMonth = moment(new Date(query.year, query.month, 1))
    .endOf("month")
    .utc()
    .format();

  const findQuery = {
    isDeleted: false,
    onewash: query.service_type === "onewash",
    createdAt: { $gte: startOfMonth, $lte: endOfMonth },
  };

  // 2. Apply Filters (Strict)
  if (isValidId(query.worker)) {
    findQuery.worker = query.worker;
  }

  if (isValidId(query.building)) {
    // Direct filtering if Payment has building field (Preferred)
    findQuery.building = query.building;
  }

  console.log("🔍 [BACKEND] Mongo Query:", JSON.stringify(findQuery, null, 2));

  // 3. Fetch Data
  let data = await PaymentsModel.find(findQuery)
    .sort({ "vehicle.parking_no": 1 })
    .lean();

  console.log(`📦 [BACKEND] Records Found: ${data.length}`);

  // 4. Populate References
  try {
    data = await PaymentsModel.populate(data, [
      { path: "job", model: "jobs" },
      { path: "worker", model: "workers", select: "name" },
      { path: "building", model: "buildings", select: "name" },
      { path: "customer", model: "customers" },
    ]);
  } catch (err) {
    console.error("⚠️ [BACKEND] Populate Warning:", err.message);
  }

  // 5. Helper to Format Data (17 Fields)
  const formatRecord = (item, index) => {
    let vehicle = null;
    if (item.customer && item.customer.vehicles) {
      const regNo = item.vehicle?.registration_no || item.vehicle;
      vehicle = item.customer.vehicles.find((v) => v.registration_no === regNo);
    }

    const subscriptionAmount = item.amount_charged || 0;
    const prevDue = item.old_balance || 0;
    const totalDue = item.total_amount || 0;
    const paid = item.amount_paid || 0;
    const balance = totalDue - paid;

    return {
      slNo: index + 1,
      parkingNo: item.vehicle?.parking_no || "-",
      carNo: item.vehicle?.registration_no || "-",
      mobile: item.customer?.mobile || "No Mobile",
      flatNo: item.customer?.flat_no || "-",
      startDate: vehicle
        ? moment(vehicle.start_date).format("DD-MM-YYYY")
        : "-",
      schedule: vehicle
        ? vehicle.schedule_type === "daily"
          ? "Daily"
          : `Weekly (${vehicle.schedule_days?.length || 0})`
        : "-",
      advance: vehicle?.advance_amount ? "Yes" : "No",
      subAmount: subscriptionAmount,
      prevDue: prevDue,
      totalDue: totalDue,
      paid: paid,
      balance: balance,
      payDate: item.collectedDate
        ? moment(item.collectedDate).format("DD-MM-YYYY")
        : "-",
      receipt: item.receipt_no || item._id.toString().slice(-6).toUpperCase(),
      dueDate: moment(item.createdAt).endOf("month").format("DD-MM-YYYY"),
      remarks: item.notes || "-",

      // Metadata
      buildingName: item.building?.name || "Unknown Building",
      workerName: item.worker?.name || "Unassigned",
    };
  };

  // --- A. JSON RESPONSE (View & PDF) ---
  if (query.format === "json") {
    const result = [];
    const grouped = {};

    data.forEach((item, index) => {
      const formatted = formatRecord(item, index);
      const bKey = formatted.buildingName;
      const wKey = formatted.workerName;

      if (!grouped[bKey]) grouped[bKey] = {};
      if (!grouped[bKey][wKey]) grouped[bKey][wKey] = [];

      grouped[bKey][wKey].push(formatted);
    });

    Object.keys(grouped).forEach((bName) => {
      const workers = [];
      Object.keys(grouped[bName]).forEach((wName) => {
        workers.push({
          workerName: wName,
          payments: grouped[bName][wName],
        });
      });
      result.push({ buildingName: bName, workers: workers });
    });

    console.log("✅ [BACKEND] Sending JSON Response");
    return result;
  }

  // --- B. EXCEL RESPONSE (Download) ---
  console.log("✅ [BACKEND] Generating Excel Workbook");
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet("Collection Sheet");

  sheet.columns = [
    { header: "Serial Number", key: "slNo", width: 8 },
    { header: "Parking Number", key: "parkingNo", width: 15 },
    { header: "Car Number", key: "carNo", width: 15 },
    { header: "Mobile Number", key: "mobile", width: 15 },
    { header: "Flat Number", key: "flatNo", width: 12 },
    { header: "Cust. Start Date", key: "startDate", width: 15 },
    { header: "Weekly Schedule", key: "schedule", width: 15 },
    { header: "Adv. Pay Option", key: "advance", width: 12 },
    { header: "Subscript. Amount", key: "subAmount", width: 15 },
    { header: "Prev. Payment Due", key: "prevDue", width: 15 },
    { header: "Total Amount Due", key: "totalDue", width: 15 },
    { header: "Paid Amount", key: "paid", width: 15 },
    { header: "Balance Amount", key: "balance", width: 15 },
    { header: "Payment Date", key: "payDate", width: 15 },
    { header: "Receipt Number", key: "receipt", width: 15 },
    { header: "Payment Due Date", key: "dueDate", width: 15 },
    { header: "Remarks", key: "remarks", width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  sheet.getRow(1).height = 30;

  data.forEach((item, index) => {
    sheet.addRow(formatRecord(item, index));
  });

  return workbook;
};
