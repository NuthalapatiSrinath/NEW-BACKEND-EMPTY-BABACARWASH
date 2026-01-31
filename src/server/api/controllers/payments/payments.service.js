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

        console.log("📅 [SERVICE] Date filter applied:");
        console.log(
          "  Start:",
          startDate.toISOString(),
          "→",
          startDate.toString(),
        );
        console.log(
          "  End:",
          dateFilter.createdAt.$lte
            ? new Date(query.endDate).toISOString()
            : "N/A",
        );

        // Log for debugging
        console.log("🔍 [DEBUG] Comparing with sample October date:");
        console.log(
          "  Oct 1 2025 00:00 IST would be stored as:",
          new Date("2025-10-01T00:00:00+05:30").toISOString(),
        );
        console.log(
          "  Oct 1 2025 00:00 UTC would be stored as:",
          new Date("2025-10-01T00:00:00Z").toISOString(),
        );
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

    // Add computed fields to each payment record
    data = data.map((payment) => {
      const isMonthEndClosed = (payment.notes || "")
        .toLowerCase()
        .includes("closed by month-end");

      return {
        ...payment,
        isMonthEndClosed, // Flag for month-end closed bills
        paidAmount: payment.amount_paid || 0, // Already exists, but ensure it's present
        balanceAmount: payment.balance || 0, // Already exists, but ensure it's present
      };
    });

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

// ✅ Month-End Closing Service (with month/year selection)
service.closeMonth = async (userInfo, month, year) => {
  console.log(
    "\n🔵 ========== [BACKEND] MONTH-END CLOSE SERVICE STARTED ==========",
  );
  console.log(`👤 User: ${userInfo.name} (${userInfo.role})`);
  console.log(`📅 Target Month: ${month + 1}/${year} (Month index: ${month})`);

  try {
    // Use provided month/year or default to current
    const targetMonth = month !== undefined ? month : new Date().getMonth();
    const targetYear = year !== undefined ? year : new Date().getFullYear();

    // Start and end of target month
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    console.log("\n📅 Date Range Calculation:");
    console.log(
      `   Start: ${monthStart.toISOString()} → ${monthStart.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST`,
    );
    console.log(
      `   End:   ${monthEnd.toISOString()} → ${monthEnd.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST`,
    );

    console.log("\n🔍 [SERVICE] Searching for pending bills...");
    console.log("   Query Criteria:");
    console.log("   - isDeleted: false");
    console.log("   - onewash: false (residence only)");
    console.log("   - status: pending");
    console.log(`   - createdAt: $gte ${monthStart.toISOString()}`);
    console.log(`   - createdAt: $lte ${monthEnd.toISOString()}`);

    // Find ALL pending bills from the target month (including balance = 0)
    const pendingBills = await PaymentsModel.find({
      isDeleted: false,
      onewash: false, // Only residence payments
      status: "pending",
      createdAt: {
        $gte: monthStart,
        $lte: monthEnd,
      },
    })
      .populate("customer")
      .lean();

    console.log(
      `\n📦 [SERVICE] Found ${pendingBills.length} pending bills to close`,
    );
    if (pendingBills.length > 0) {
      console.log("\n📋 Bills Details:");
      pendingBills.forEach((bill, idx) => {
        const customerName = bill.customer
          ? `${bill.customer.firstName || ""} ${bill.customer.lastName || ""}`.trim() ||
            "N/A"
          : "N/A";
        console.log(`   ${idx + 1}. Bill ID: ${bill._id}`);
        console.log(`      Customer: ${customerName}`);
        console.log(`      Balance: ₹${bill.balance}`);
        console.log(
          `      Created: ${new Date(bill.createdAt).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}`,
        );
      });
    }

    let closedCount = 0;
    let newBillsCount = 0;

    console.log("\n🔄 [SERVICE] Processing bills...");

    for (const bill of pendingBills) {
      try {
        const customerName = bill.customer
          ? `${bill.customer.firstName || ""} ${bill.customer.lastName || ""}`.trim() ||
            "N/A"
          : "N/A";
        console.log(
          `\n   📌 Processing Bill ${closedCount + 1}/${pendingBills.length}`,
        );
        console.log(`      Bill ID: ${bill._id}`);
        console.log(`      Customer: ${customerName}`);
        console.log(`      Current Balance: ₹${bill.balance}`);

        // 1. Close the old bill as "completed" with special timestamp
        console.log(`      🔒 Closing bill as 'completed'...`);
        const closeTimestamp = new Date();
        const closedBalance = bill.balance; // Store balance before closing

        await PaymentsModel.updateOne(
          { _id: bill._id },
          {
            $set: {
              status: "completed", // Close it
              balance: 0, // Set balance to 0 (carried forward to next month)
              collectedDate: closeTimestamp, // Mark as "paid" by month-end close
              notes:
                (bill.notes || "") +
                (bill.notes ? " | " : "") +
                `Closed by Month-End on ${closeTimestamp.toLocaleDateString()} - Carried Forward: ${closedBalance} AED`,
              updatedBy: userInfo._id,
              updatedAt: closeTimestamp,
            },
          },
        );
        closedCount++;
        console.log(
          `      ✅ Bill closed successfully - Balance ${closedBalance} carried forward`,
        );

        // 2. Check if next month bill already exists, update it or create new one
        const billDate = new Date(bill.createdAt);
        const nextMonth = billDate.getMonth() + 1;
        const nextYear = billDate.getFullYear() + Math.floor(nextMonth / 12);
        const nextMonthIndex = nextMonth % 12;
        const nextMonthDate = new Date(nextYear, nextMonthIndex, 1);
        const nextMonthEnd = new Date(
          nextYear,
          nextMonthIndex + 1,
          0,
          23,
          59,
          59,
          999,
        );

        console.log(`      📅 Next month: ${nextMonthIndex + 1}/${nextYear}`);
        console.log(`      📅 Checking for existing bill in next month...`);

        // Get vehicle ID for matching
        const vehicleId = bill.vehicle?._id || bill.vehicle;

        // Check if bill already exists for this customer/vehicle in next month
        const existingNextMonthBill = await PaymentsModel.findOne({
          customer: bill.customer._id || bill.customer,
          "vehicle._id": vehicleId,
          isDeleted: false,
          onewash: false,
          createdAt: {
            $gte: nextMonthDate,
            $lte: nextMonthEnd,
          },
        }).lean();

        if (existingNextMonthBill) {
          console.log(
            `      ⚠️  Bill already exists for next month: ${existingNextMonthBill._id}`,
          );
          console.log(
            `      🔄 Updating existing bill with carried forward balance...`,
          );

          // Update existing bill with carried forward balance
          const updatedOldBalance =
            existingNextMonthBill.old_balance + bill.balance;
          const updatedTotalAmount =
            existingNextMonthBill.amount_charged + updatedOldBalance;
          const updatedBalance =
            updatedTotalAmount - existingNextMonthBill.amount_paid;

          await PaymentsModel.updateOne(
            { _id: existingNextMonthBill._id },
            {
              $set: {
                old_balance: updatedOldBalance,
                total_amount: updatedTotalAmount,
                balance: updatedBalance,
                updatedBy: userInfo._id,
                updatedAt: new Date(),
              },
            },
          );

          console.log(`      ✅ Updated existing bill:`);
          console.log(
            `         Old Balance: ₹${existingNextMonthBill.old_balance} → ₹${updatedOldBalance}`,
          );
          console.log(
            `         Total Amount: ₹${existingNextMonthBill.total_amount} → ₹${updatedTotalAmount}`,
          );
          console.log(
            `         Balance: ₹${existingNextMonthBill.balance} → ₹${updatedBalance}`,
          );
        } else {
          console.log(`      ✅ No existing bill found, creating new one...`);

          // Get current subscription amount
          const currentCharge = bill.amount_charged || 0;

          const newBill = {
            customer: bill.customer._id || bill.customer,
            worker: bill.worker,
            building: bill.building,
            vehicle: bill.vehicle,
            amount_charged: currentCharge,
            old_balance: bill.balance,
            total_amount: currentCharge + bill.balance,
            amount_paid: 0,
            balance: currentCharge + bill.balance,
            status: "pending",
            settled: "pending",
            onewash: false,
            createdAt: nextMonthDate,
            createdBy: userInfo._id,
            updatedBy: userInfo._id,
          };

          console.log(`      💰 New bill details:`);
          console.log(`         Amount Charged: ₹${newBill.amount_charged}`);
          console.log(
            `         Old Balance (Carried): ₹${newBill.old_balance}`,
          );
          console.log(`         Total Amount: ₹${newBill.total_amount}`);
          console.log(`         Balance: ₹${newBill.balance}`);

          const savedBill = await new PaymentsModel(newBill).save();
          newBillsCount++;
          console.log(`      ✅ New bill created: ${savedBill._id}`);
        }
      } catch (err) {
        console.error(
          `❌ [SERVICE] Error processing bill ${bill._id}:`,
          err.message,
        );
      }
    }

    console.log("\n✅ ========== MONTH-END CLOSE SUMMARY ==========");
    console.log(`   📊 Bills Closed: ${closedCount}`);
    console.log(`   📊 New Bills Created: ${newBillsCount}`);
    console.log(
      `   ⏱️  Completed at: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST`,
    );
    console.log(
      "🔵 ========== [BACKEND] MONTH-END CLOSE SERVICE COMPLETE ==========\n",
    );

    return {
      closedBills: closedCount,
      newBills: newBillsCount,
    };
  } catch (error) {
    console.error("❌ [SERVICE] Month-End Close Failed:", error);
    throw error;
  }
};

// ✅ Revert Month-End Closing Service
service.revertMonthClose = async (userInfo, month, year) => {
  console.log(
    "\n🟠 ========== [BACKEND] REVERT MONTH-END CLOSE SERVICE STARTED ==========",
  );
  console.log(`👤 User: ${userInfo.name} (${userInfo.role})`);
  console.log(
    `📅 Target Month to Revert: ${month + 1}/${year} (Month index: ${month})`,
  );

  try {
    // Start and end of target month
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // Start and end of NEXT month (where new bills were created)
    const nextMonthStart = new Date(year, month + 1, 1);
    const nextMonthEnd = new Date(year, month + 2, 0, 23, 59, 59, 999);

    console.log("\n📅 Date Ranges:");
    console.log(
      `   Target Month: ${monthStart.toISOString()} to ${monthEnd.toISOString()}`,
    );
    console.log(
      `   Target Month (IST): ${monthStart.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} to ${monthEnd.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}`,
    );
    console.log(
      `   Next Month: ${nextMonthStart.toISOString()} to ${nextMonthEnd.toISOString()}`,
    );
    console.log(
      `   Next Month (IST): ${nextMonthStart.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} to ${nextMonthEnd.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}`,
    );

    // Step 1: Find and delete new bills created in next month with old_balance > 0
    console.log(
      "\n🔍 Step 1: Finding new bills to delete (from next month)...",
    );
    console.log("   Query Criteria:");
    console.log("   - isDeleted: false");
    console.log("   - onewash: false");
    console.log("   - old_balance: > 0 (carried forward)");
    console.log(`   - createdAt: $gte ${nextMonthStart.toISOString()}`);
    console.log(`   - createdAt: $lte ${nextMonthEnd.toISOString()}`);

    const newBillsToDelete = await PaymentsModel.find({
      isDeleted: false,
      onewash: false,
      old_balance: { $gt: 0 },
      createdAt: {
        $gte: nextMonthStart,
        $lte: nextMonthEnd,
      },
    }).lean();

    console.log(`\n🗑️ Found ${newBillsToDelete.length} new bills to delete`);
    if (newBillsToDelete.length > 0) {
      console.log("\n📋 Bills to Delete:");
      newBillsToDelete.forEach((bill, idx) => {
        console.log(`   ${idx + 1}. Bill ID: ${bill._id}`);
        console.log(`      Old Balance: ₹${bill.old_balance}`);
        console.log(`      Total: ₹${bill.total_amount}`);
        console.log(
          `      Created: ${new Date(bill.createdAt).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}`,
        );
      });
    }

    let deletedCount = 0;
    let reopenedCount = 0;

    // Delete new bills
    console.log("\n🗑️ Deleting new bills...");
    for (const newBill of newBillsToDelete) {
      try {
        console.log(
          `   Deleting bill ${deletedCount + 1}/${newBillsToDelete.length}: ${newBill._id}`,
        );
        await PaymentsModel.updateOne(
          { _id: newBill._id },
          {
            $set: {
              isDeleted: true,
              deletedBy: userInfo._id,
              deletedAt: new Date(),
            },
          },
        );
        deletedCount++;
        console.log(`   ✅ Deleted successfully`);
      } catch (err) {
        console.error(`   ❌ Error deleting bill ${newBill._id}:`, err.message);
      }
    }

    // Step 2: Find and reopen closed bills from target month
    console.log(
      "\n🔍 Step 2: Finding closed bills to reopen (from target month)...",
    );
    console.log("   Query Criteria:");
    console.log("   - isDeleted: false");
    console.log("   - onewash: false");
    console.log("   - status: completed");
    console.log("   - balance: > 0 (had unpaid balance)");
    console.log(`   - createdAt: $gte ${monthStart.toISOString()}`);
    console.log(`   - createdAt: $lte ${monthEnd.toISOString()}`);
    console.log(
      `   - updatedAt: $gte ${monthStart.toISOString()} (closed recently)`,
    );

    const closedBills = await PaymentsModel.find({
      isDeleted: false,
      onewash: false,
      status: "completed",
      balance: { $gt: 0 }, // Had unpaid balance when closed
      createdAt: {
        $gte: monthStart,
        $lte: monthEnd,
      },
      updatedAt: {
        // Find bills that were updated (closed) recently
        $gte: monthStart, // Closed during or after target month
      },
    }).lean();

    console.log(`\n🔓 Found ${closedBills.length} closed bills to reopen`);
    if (closedBills.length > 0) {
      console.log("\n📋 Bills to Reopen:");
      closedBills.forEach((bill, idx) => {
        console.log(`   ${idx + 1}. Bill ID: ${bill._id}`);
        console.log(`      Balance: ₹${bill.balance}`);
        console.log(`      Status: ${bill.status}`);
        console.log(
          `      Created: ${new Date(bill.createdAt).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}`,
        );
      });
    }

    // Reopen bills back to pending status
    console.log("\n🔓 Reopening bills...");
    for (const bill of closedBills) {
      try {
        console.log(
          `   Reopening bill ${reopenedCount + 1}/${closedBills.length}: ${bill._id}`,
        );
        await PaymentsModel.updateOne(
          { _id: bill._id },
          {
            $set: {
              status: "pending", // Reopen to pending
              updatedBy: userInfo._id,
              updatedAt: new Date(),
            },
          },
        );
        reopenedCount++;
        console.log(`   ✅ Reopened successfully (status: pending)`);
      } catch (err) {
        console.error(`   ❌ Error reopening bill ${bill._id}:`, err.message);
      }
    }

    console.log("\n✅ ========== REVERT MONTH-END CLOSE SUMMARY ==========");
    console.log(`   📊 New Bills Deleted: ${deletedCount}`);
    console.log(`   📊 Old Bills Reopened: ${reopenedCount}`);
    console.log(
      `   ⏱️  Completed at: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST`,
    );
    console.log("🟠 ========== [BACKEND] REVERT SERVICE COMPLETE ==========\n");

    return {
      deletedBills: deletedCount,
      reopenedBills: reopenedCount,
    };
  } catch (error) {
    console.error("❌ [SERVICE] Revert Month Close Failed:", error);
    throw error;
  }
};

// ✅ Get Months with Pending Bills
service.getMonthsWithPending = async () => {
  console.log("🔵 [SERVICE] Getting months with bills (pending AND completed)");

  try {
    // Count ALL bills (pending + completed with balance)
    const totalCount = await PaymentsModel.countDocuments({
      isDeleted: false,
      onewash: false,
      status: { $in: ["pending", "completed"] },
    });
    console.log(`📊 [SERVICE] Total bills: ${totalCount}`);

    if (totalCount === 0) {
      console.log("ℹ️ [SERVICE] No bills found");
      return [];
    }

    // Aggregate ALL bills (pending + completed) by month/year/status
    console.log("🔄 [SERVICE] Running aggregate query...");
    const result = await PaymentsModel.aggregate([
      {
        $match: {
          isDeleted: false,
          onewash: false,
          status: { $in: ["pending", "completed"] },
        },
      },
      {
        $addFields: {
          // Add 5.5 hours to UTC to get IST, then extract year/month
          istDate: { $add: ["$createdAt", 5.5 * 60 * 60 * 1000] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$istDate" },
            month: { $month: "$istDate" },
            status: "$status",
          },
          count: { $sum: 1 },
          totalBalance: { $sum: "$balance" },
        },
      },
      {
        $group: {
          _id: {
            year: "$_id.year",
            month: "$_id.month",
          },
          statuses: {
            $push: {
              status: "$_id.status",
              count: "$count",
              balance: "$totalBalance",
            },
          },
          totalCount: { $sum: "$count" },
          totalBalance: { $sum: "$totalBalance" },
        },
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 },
      },
    ]);

    console.log(`📦 [SERVICE] Aggregate returned ${result.length} groups`);

    // Convert to more readable format
    const months = result.map((item) => {
      const pendingGroup = item.statuses.find((s) => s.status === "pending");
      const completedGroup = item.statuses.find(
        (s) => s.status === "completed",
      );

      const pendingCount = pendingGroup?.count || 0;
      const completedCount = completedGroup?.count || 0;

      return {
        month: item._id.month - 1, // Convert to 0-indexed (0 = Jan, 11 = Dec)
        year: item._id.year,
        pending: pendingCount,
        completed: completedCount,
        count: item.totalCount,
        totalBalance: Math.round(item.totalBalance),
        isClosed: pendingCount === 0 && completedCount > 0,
      };
    });

    console.log(`📅 [SERVICE] Found ${months.length} months`);
    months.forEach((m) => {
      const monthName = new Date(m.year, m.month, 1).toLocaleDateString(
        "en-US",
        { month: "long", year: "numeric" },
      );
      const status = m.isClosed ? "✅ CLOSED" : "⏳ OPEN";
      console.log(
        `   ${status} ${monthName}: ${m.pending} pending, ${m.completed} completed, ₹${m.totalBalance} balance`,
      );
    });

    return months;
  } catch (error) {
    console.error("❌ [SERVICE] Get Months Failed:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    throw new Error(
      `Failed to get months with bills: ${error.message || error}`,
    );
  }
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

service.generatePDF = async (userInfo, filters) => {
  console.log("📄 Generating PDF with filters:", filters);

  const PDFDocument = require("pdfkit-table");
  const moment = require("moment-timezone");
  const path = require("path");
  const fs = require("fs");

  // Fetch ALL records (no pagination limit)
  const allFilters = {
    ...filters,
    page: 1,
    limit: 100000, // Get all records
  };

  const result = await service.list(userInfo, allFilters);
  const payments = result.data || [];

  console.log(`📊 Fetched ${payments.length} total records for PDF`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        layout: "landscape",
        size: "A4",
        margin: 40,
        bufferPages: true,
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Add logo
      const logoPath = path.join(
        __dirname,
        "../../../../../admin-panel/public/logo-icon.png",
      );
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 40, 30, { width: 50, height: 50 });
      }

      // Title with gradient effect (blue)
      doc
        .fontSize(22)
        .font("Helvetica-Bold")
        .fillColor("#1e40af")
        .text("Residence Payments Report", 110, 40, { align: "left" });

      doc.moveDown(1.5);

      // Decorative line
      doc
        .strokeColor("#3b82f6")
        .lineWidth(2)
        .moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .stroke();

      doc.moveDown(0.5);

      // Date range and stats (NO BOX, just text)
      doc.fontSize(10).font("Helvetica").fillColor("#374151");
      const startDate = filters.startDate
        ? moment(filters.startDate).format("DD/MM/YYYY")
        : "N/A";
      const endDate = filters.endDate
        ? moment(filters.endDate).format("DD/MM/YYYY")
        : "N/A";

      doc.text(`Date Range: ${startDate} to ${endDate}`, 40, doc.y);
      doc.text(`Total Records: ${payments.length}`, 40, doc.y + 15);
      doc.text(
        `Total Revenue: ${result.stats?.totalAmount || 0} AED`,
        40,
        doc.y + 30,
      );

      doc.moveDown(4);

      // Prepare table rows (removed customer name, keeping only mobile)
      const tableRows = payments.map((payment) => {
        const mobile = payment.customer?.mobile || "-";
        const vehicleReg = payment.vehicle?.registration_no || "-";
        const parkingNo = payment.vehicle?.parking_no || "-";
        const billDate = moment(payment.createdAt).format("DD/MM/YYYY");

        // Extract carried forward amount from notes
        let carriedAmount = "-";
        const isMonthEndClosed =
          payment.notes &&
          payment.notes.toLowerCase().includes("closed by month-end");
        if (isMonthEndClosed && payment.notes) {
          const match = payment.notes.match(
            /Carried Forward:\s*([\d.]+)\s*AED/i,
          );
          if (match) {
            carriedAmount = match[1];
          }
        }

        // Paid date
        let paidDate = "Not Paid";
        if (payment.collectedDate) {
          paidDate = moment(payment.collectedDate).format("DD/MM/YYYY");
        }

        return [
          String(payment.id || "-"),
          mobile,
          vehicleReg,
          parkingNo,
          billDate,
          String(payment.amount_charged || 0),
          String(payment.old_balance || 0),
          String(payment.total_amount || 0),
          String(payment.amount_paid || 0),
          carriedAmount,
          String(payment.balance || 0),
          paidDate,
          (payment.status || "pending").toUpperCase(),
        ];
      });

      // Create table data (removed Customer column)
      const tableData = {
        headers: [
          "ID",
          "Mobile",
          "Vehicle",
          "Parking",
          "Bill Date",
          "Subscription",
          "Previous Due",
          "Total Due",
          "Paid",
          "Carried Fwd",
          "Balance",
          "Paid Date",
          "Status",
        ],
        rows: tableRows,
      };

      // Render table with clean styling
      doc.table(tableData, {
        prepareHeader: () => {
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#1e40af");
        },
        prepareRow: (row, indexColumn, indexRow) => {
          doc.font("Helvetica").fontSize(7).fillColor("#1f2937");
        },
        columnSpacing: 5,
        padding: 5,
        width: doc.page.width - 80,
        x: 40,
      });

      // Add colorful footer to all pages
      const range = doc.bufferedPageRange();
      const generatedText = `Generated on ${moment().format("DD/MM/YYYY HH:mm:ss")}`;

      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Simple footer line
        doc
          .strokeColor("#3b82f6")
          .lineWidth(1)
          .moveTo(40, doc.page.height - 35)
          .lineTo(doc.page.width - 40, doc.page.height - 35)
          .stroke();

        doc.fontSize(8).fillColor("#1e40af").font("Helvetica");
        doc.text(
          `${generatedText} | Page ${i - range.start + 1} of ${range.count} | BCW Car Wash Services`,
          40,
          doc.page.height - 28,
          { align: "center", width: doc.page.width - 80 },
        );
      }

      doc.end();
    } catch (error) {
      console.error("❌ PDF Generation Error:", error);
      reject(error);
    }
  });
};
