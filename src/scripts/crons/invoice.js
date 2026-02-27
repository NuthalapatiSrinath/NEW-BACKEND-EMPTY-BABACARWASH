const moment = require("moment-timezone");
const CustomersModel = require("../../server/api/models/customers.model");
const PaymentsModel = require("../../server/api/models/payments.model");
const JobsModel = require("../../server/api/models/jobs.model");
const CounterService = require("../../server/utils/counters");

const cron = module.exports;

/**
 * MODES:
 *  "full_subscription" - charge full monthly amount for all active vehicles
 *  "per_wash"          - charge only for completed washes (per-wash rate)
 *
 * DUPLICATE PREVENTION:
 *  Once invoices exist for a month (any mode), no second run is allowed.
 */

/**
 * Calculate expected number of washes in a month based on vehicle schedule.
 * - daily: Mon-Sat (excludes Sunday) within the month
 * - weekly: Only on scheduled days within the month
 * Also respects vehicle start_date (no washes before onboarding).
 */
function calculateExpectedWashes(vehicle, monthStart, monthEnd) {
  const scheduleType = (vehicle.schedule_type || "daily").toLowerCase();
  const vehicleStart = vehicle.start_date ? moment(vehicle.start_date) : null;

  let count = 0;
  const current = monthStart.clone();

  while (current.isSameOrBefore(monthEnd, "day")) {
    // Skip days before vehicle start_date
    if (vehicleStart && current.isBefore(vehicleStart, "day")) {
      current.add(1, "day");
      continue;
    }

    const dayOfWeek = current.day(); // 0=Sun, 1=Mon, ..., 6=Sat

    if (scheduleType === "daily") {
      // Daily = Mon-Sat (exclude Sunday)
      if (dayOfWeek !== 0) count++;
    } else if (scheduleType === "weekly") {
      // Weekly = only on specific scheduled days
      const dayNames = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const shortDayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const currentDayName = dayNames[dayOfWeek];
      const currentShortDay = shortDayNames[dayOfWeek];

      if (vehicle.schedule_days && vehicle.schedule_days.length > 0) {
        let isScheduled = false;

        for (const sd of vehicle.schedule_days) {
          if (typeof sd === "object" && sd.day) {
            // Format: {day: "Mon", value: 1}
            if (
              sd.value == dayOfWeek ||
              sd.day.toLowerCase().startsWith(currentShortDay)
            ) {
              isScheduled = true;
              break;
            }
          } else if (typeof sd === "string") {
            // Format: "Mon,Tue,Wed" or single "Monday"
            const parts = sd.split(",").map((d) => d.trim().toLowerCase());
            if (
              parts.some(
                (p) =>
                  currentDayName.startsWith(p) || p.startsWith(currentShortDay),
              )
            ) {
              isScheduled = true;
              break;
            }
          }
        }

        if (isScheduled) count++;
      }
    }

    current.add(1, "day");
  }

  return count;
}

// Usage:
//   invoice.run()                                     - PREVIOUS month, full_subscription (cron default)
//   invoice.run(1, 2026, "full_subscription")         - February 2026, full subscription
//   invoice.run(11, 2025, "per_wash")                 - December 2025, per-wash pricing
//
// BILLING LOGIC:
//   - "February 2026" means billing for work done in February
//   - Invoice date (createdAt) = March 1st (1st of next month)
//   - Cron runs on 1st of each month → automatically bills PREVIOUS month
//   - Duplicate check uses billing_month field, NOT createdAt
cron.run = async (
  targetMonthIndex = null,
  targetYear = null,
  mode = "full_subscription",
) => {
  try {
    console.log("\n🟢 ========== INVOICE CRON STARTED ==========");

    // Validate mode
    const validModes = ["full_subscription", "per_wash"];
    if (!validModes.includes(mode)) {
      throw new Error(
        `Invalid mode "${mode}". Must be one of: ${validModes.join(", ")}`,
      );
    }

    // Determine target BILLING month
    let billingDate;
    if (targetMonthIndex !== null && targetYear !== null) {
      // Manual mode: bill for the specified month
      billingDate = moment.tz([targetYear, targetMonthIndex, 1], "Asia/Dubai");
      console.log(`📋 MANUAL MODE: Billing for specified month`);
    } else {
      // Production/Cron mode: bill for PREVIOUS month
      // (Cron runs on 1st of month, so bill for the month that just ended)
      billingDate = moment().tz("Asia/Dubai").subtract(1, "month");
      console.log(`🏭 CRON MODE: Billing for previous month`);
    }

    const currentDate = moment().tz("Asia/Dubai");
    const billingMonth = billingDate.format("MMMM YYYY");
    const monthStart = billingDate.clone().startOf("month");
    const monthEnd = billingDate.clone().endOf("month");

    // Invoice date = 1st of the NEXT month after billing month
    const invoiceDate = monthEnd.clone().add(1, "day").startOf("day");

    // billing_month string for duplicate detection (e.g., "2026-02")
    const billingMonthKey = billingDate.format("YYYY-MM");

    console.log(`📅 Billing Month: ${billingMonth}`);
    console.log(
      `📅 Billing Range: ${monthStart.format("YYYY-MM-DD")} to ${monthEnd.format("YYYY-MM-DD")}`,
    );
    console.log(
      `📅 Invoice Date: ${invoiceDate.format("YYYY-MM-DD")} (1st of next month)`,
    );
    console.log(`🔑 Billing Key: ${billingMonthKey}`);
    console.log(
      `🕒 Run Time: ${currentDate.format("YYYY-MM-DD HH:mm:ss")} Dubai`,
    );
    console.log(
      `💡 MODE: ${mode === "full_subscription" ? "Full Subscription (all active vehicles)" : "Per-wash pricing (only completed washes)"}`,
    );

    // ===============================
    // 🚫 STRICT DUPLICATE PREVENTION
    // Checks BOTH new format (billing_month field) and old format (createdAt in billing month range)
    // ===============================
    const existingInvoiceCount = await PaymentsModel.countDocuments({
      onewash: false,
      isDeleted: { $ne: true },
      $or: [
        // New format: has billing_month field
        { billing_month: billingMonthKey },
        // Old format: no billing_month, createdAt falls within the billing month
        {
          billing_month: { $exists: false },
          createdAt: { $gte: monthStart.toDate(), $lte: monthEnd.toDate() },
        },
      ],
    });

    if (existingInvoiceCount > 0) {
      console.log(`\n🚫 ========== DUPLICATE PREVENTION ==========`);
      console.log(
        `   ❌ ${existingInvoiceCount} invoices already exist for ${billingMonth}`,
      );
      console.log(
        `   ❌ Cannot run invoice generation twice for the same month.`,
      );
      console.log(
        `   ❌ Delete existing invoices first if you want to regenerate.`,
      );
      console.log(`🚫 ==========================================\n`);
      return {
        success: false,
        blocked: true,
        message: `Invoices already exist for ${billingMonth} (${existingInvoiceCount} found). Cannot generate duplicates.`,
        existingCount: existingInvoiceCount,
        invoicesCreated: 0,
      };
    }

    const customers = await CustomersModel.find({ isDeleted: false }).lean();
    console.log(`👥 Found ${customers.length} active customers`);

    let allCompletedJobs = [];
    let completedWashMap = {};

    // For per_wash mode, fetch completed jobs
    if (mode === "per_wash") {
      allCompletedJobs = await JobsModel.find({
        isDeleted: false,
        status: "completed",
        completedDate: {
          $gte: monthStart.toDate(),
          $lte: monthEnd.toDate(),
        },
      })
        .select("customer vehicle completedDate")
        .lean();

      console.log(
        `📊 Found ${allCompletedJobs.length} completed jobs in ${billingMonth}`,
      );

      // Build a map: "customerId_vehicleId" → count of completed washes
      for (const job of allCompletedJobs) {
        const key = `${job.customer}_${job.vehicle}`;
        completedWashMap[key] = (completedWashMap[key] || 0) + 1;
      }
    }

    const paymentsData = [];
    let skippedVehicles = 0;
    let skippedNoWashes = 0;
    let createdInvoices = 0;

    for (const iterator of JSON.parse(JSON.stringify(customers))) {
      for (const vehicle of iterator.vehicles) {
        // Skip inactive vehicles (status 2 = inactive)
        if (vehicle.status == 2) {
          skippedVehicles++;
          continue;
        }

        let chargedAmount = 0;
        let completedWashes = 0;
        let expectedWashes = 0;
        let perWashRate = 0;
        const monthlyAmount = vehicle.amount || 0;

        if (mode === "full_subscription") {
          // ========================
          // MODE: FULL SUBSCRIPTION
          // ========================
          // Charge full monthly amount for all active vehicles
          chargedAmount = monthlyAmount;
        } else if (mode === "per_wash") {
          // ========================
          // MODE: PER-WASH PRICING
          // ========================
          const washKey = `${iterator._id}_${vehicle._id}`;
          completedWashes = completedWashMap[washKey] || 0;

          if (completedWashes === 0) {
            // No completed washes → NO invoice
            skippedNoWashes++;
            continue;
          }

          expectedWashes = calculateExpectedWashes(
            vehicle,
            monthStart,
            monthEnd,
          );
          perWashRate =
            expectedWashes > 0 ? monthlyAmount / expectedWashes : monthlyAmount;
          chargedAmount = Math.round(completedWashes * perWashRate * 100) / 100;
        }

        // Skip zero-amount invoices
        if (chargedAmount === 0 && mode === "full_subscription") {
          skippedNoWashes++;
          continue;
        }

        // Get last invoice to determine balance
        let lastInvoice = await PaymentsModel.findOne({
          customer: iterator._id,
          "vehicle._id": vehicle._id,
        })
          .sort({ _id: -1 })
          .lean();

        let balance = 0;
        if (lastInvoice) {
          balance = lastInvoice.balance || 0;
        }

        const paymentId = await CounterService.id("payments");
        const totalAmount = chargedAmount + balance;

        // Build invoice object
        const invoiceData = {
          id: paymentId,
          status: "pending",
          settled: "pending",
          onewash: false,
          customer: iterator._id,
          vehicle: {
            _id: vehicle._id,
            registration_no: vehicle.registration_no,
            parking_no: vehicle.parking_no,
          },
          amount_charged: chargedAmount,
          amount_paid: 0,
          total_amount: totalAmount,
          old_balance: balance,
          balance: totalAmount,
          location: iterator.location,
          building: iterator.building,
          createdBy: "Cron Scheduler",
          createdAt: invoiceDate.toDate(), // 1st of next month (e.g., March 1st for Feb billing)
          billing_month: billingMonthKey, // "2026-02" for duplicate detection
          // Store mode and wash details for transparency
          invoice_mode: mode,
          monthly_subscription: monthlyAmount,
        };

        // Add per-wash details only for per_wash mode
        if (mode === "per_wash") {
          invoiceData.completed_washes = completedWashes;
          invoiceData.expected_washes = expectedWashes;
          invoiceData.per_wash_rate = Math.round(perWashRate * 100) / 100;
        }

        // Only include worker field if it's truthy (prevents empty string)
        if (vehicle.worker) {
          invoiceData.worker = vehicle.worker;
        }

        paymentsData.push(invoiceData);
        createdInvoices++;

        // Log details for first few invoices
        if (createdInvoices <= 5) {
          console.log(
            `\n  📝 Invoice #${createdInvoices}: Vehicle ${vehicle.registration_no || vehicle._id}`,
          );
          if (mode === "per_wash") {
            console.log(
              `     Schedule: ${vehicle.schedule_type || "daily"} | Expected: ${expectedWashes} | Completed: ${completedWashes}`,
            );
            console.log(
              `     Monthly Sub: ${monthlyAmount} AED | Per Wash: ${perWashRate.toFixed(2)} AED`,
            );
          } else {
            console.log(`     Full Subscription: ${monthlyAmount} AED`);
          }
          console.log(
            `     Charged: ${chargedAmount} AED | Prev Balance: ${balance} AED | Total: ${totalAmount} AED`,
          );
        }
      }
    }

    if (paymentsData.length > 0) {
      await PaymentsModel.insertMany(paymentsData);
      console.log(`\n✅ Successfully created ${paymentsData.length} invoices`);
    } else {
      console.log(
        `\n⚠️  No invoices to create${mode === "per_wash" ? " (no vehicles had completed washes)" : ""}`,
      );
    }

    console.log("\n📊 ========== INVOICE CRON SUMMARY ==========");
    console.log(`   💡 Mode: ${mode}`);
    console.log(`   📅 Billing Month: ${billingMonth}`);
    console.log(`   📅 Invoice Date: ${invoiceDate.format("YYYY-MM-DD")}`);
    console.log(`   ✅ Invoices Created: ${createdInvoices}`);
    if (mode === "per_wash") {
      console.log(
        `   🚿 Vehicles Skipped (No Completed Washes): ${skippedNoWashes}`,
      );
      console.log(
        `   📊 Total Completed Jobs This Month: ${allCompletedJobs.length}`,
      );
    } else {
      console.log(`   🚿 Vehicles Skipped (Zero Amount): ${skippedNoWashes}`);
    }
    console.log(`   ⚠️  Vehicles Skipped (Inactive): ${skippedVehicles}`);
    console.log(
      `   🕒 Completed at: ${moment().tz("Asia/Dubai").format("YYYY-MM-DD HH:mm:ss")} Dubai`,
    );
    console.log("🟢 ========== INVOICE CRON COMPLETE ==========\n");

    return {
      success: true,
      blocked: false,
      message: `Successfully created ${createdInvoices} invoices for ${billingMonth} (${mode}). Invoice date: ${invoiceDate.format("YYYY-MM-DD")}`,
      invoicesCreated: createdInvoices,
      mode: mode,
      month: billingMonth,
      invoiceDate: invoiceDate.format("YYYY-MM-DD"),
      skippedInactive: skippedVehicles,
      skippedNoWashes: skippedNoWashes,
    };
  } catch (error) {
    console.error("❌ ========== INVOICE CRON ERROR ==========");
    console.error("❌ Error:", error.message);
    console.error("❌ Stack:", error.stack);
    console.error("❌ ========================================\n");
    throw error;
  }
};

/**
 * Check if invoices already exist for a given billing month.
 * Uses billing_month field for accurate detection.
 */
cron.checkExisting = async (targetMonthIndex, targetYear) => {
  const billingDate = moment.tz(
    [targetYear, targetMonthIndex, 1],
    "Asia/Dubai",
  );
  const billingMonthKey = billingDate.format("YYYY-MM");
  const monthStart = billingDate.clone().startOf("month");
  const monthEnd = billingDate.clone().endOf("month");

  const count = await PaymentsModel.countDocuments({
    onewash: false,
    isDeleted: { $ne: true },
    $or: [
      // New format: has billing_month field
      { billing_month: billingMonthKey },
      // Old format: no billing_month, createdAt falls within the billing month
      {
        billing_month: { $exists: false },
        createdAt: { $gte: monthStart.toDate(), $lte: monthEnd.toDate() },
      },
    ],
  });

  return {
    exists: count > 0,
    count,
    month: billingDate.format("MMMM YYYY"),
  };
};
