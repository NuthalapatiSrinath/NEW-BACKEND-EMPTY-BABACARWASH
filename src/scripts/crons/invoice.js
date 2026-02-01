const moment = require("moment");
const CustomersModel = require("../../server/api/models/customers.model");
const PaymentsModel = require("../../server/api/models/payments.model");
const CounterService = require("../../server/utils/counters");

const cron = module.exports;

// ✅ UPDATED: Accept optional month and year for testing
// Usage: invoice.run() - current month
//        invoice.run(0, 2026) - January 2026
//        invoice.run(11, 2025) - December 2025
cron.run = async (targetMonthIndex = null, targetYear = null) => {
  try {
    console.log("\n🟢 ========== INVOICE CRON STARTED ==========");
    
    // Determine target date (for testing or production)
    let targetDate;
    if (targetMonthIndex !== null && targetYear !== null) {
      // Test mode: Use provided month/year
      targetDate = moment.tz([targetYear, targetMonthIndex, 1], "Asia/Dubai");
      console.log(`🧪 TEST MODE: Creating invoices for custom date`);
    } else {
      // Production mode: Use current month
      targetDate = moment().tz("Asia/Dubai");
      console.log(`🏭 PRODUCTION MODE: Creating invoices for current month`);
    }
    
    const currentDate = moment().tz("Asia/Dubai");
    const targetMonth = targetDate.format("MMMM YYYY");
    console.log(`📅 Target Month: ${targetMonth}`);
    console.log(
      `🕒 Run Time: ${currentDate.format("YYYY-MM-DD HH:mm:ss")} Dubai`,
    );

    const customers = await CustomersModel.find({ isDeleted: false }).lean();
    console.log(`👥 Found ${customers.length} active customers`);

    const paymentsData = [];
    let skippedVehicles = 0;
    let createdInvoices = 0;
    let skippedDuplicates = 0;

    for (const iterator of JSON.parse(JSON.stringify(customers))) {
      for (const vehicle of iterator.vehicles) {
        // Skip inactive vehicles (status 2 = inactive)
        if (vehicle.status == 2) {
          skippedVehicles++;
          continue;
        }

        // 🔍 Check for duplicate invoice (prevent double-creation)
        const existingInvoice = await PaymentsModel.findOne({
          customer: iterator._id,
          "vehicle._id": vehicle._id,
          createdAt: {
            $gte: targetDate.clone().startOf("month").toDate(),
            $lte: targetDate.clone().endOf("month").toDate(),
          },
        }).lean();

        if (existingInvoice) {
          console.log(
            `⚠️  [SKIP] Invoice already exists for customer ${iterator._id}, vehicle ${vehicle._id}`,
          );
          skippedDuplicates++;
          continue;
        }

        // Get last invoice to determine balance
        let lastInvoice = await PaymentsModel.findOne({
          customer: iterator._id,
          "vehicle._id": vehicle._id,
        })
          .sort({ _id: -1 })
          .lean();

        // ✅ SIMPLIFIED: Just use the already-calculated balance field
        let balance = 0;
        if (lastInvoice) {
          balance = lastInvoice.balance || 0;
        }

        const paymentId = await CounterService.id("payments");
        const totalAmount = (vehicle.amount || 0) + balance;

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
          amount_charged: vehicle.amount || 0,
          amount_paid: 0,
          total_amount: totalAmount,
          old_balance: balance,
          balance: totalAmount,
          location: iterator.location,
          building: iterator.building,
          createdBy: "Cron Scheduler",
          createdAt: targetDate.clone().startOf("month").toDate(),
        };

        // ✅ FIX: Only include worker field if it's truthy (prevents empty string)
        if (vehicle.worker) {
          invoiceData.worker = vehicle.worker;
        }

        paymentsData.push(invoiceData);
        createdInvoices++;
      }
    }

    if (paymentsData.length > 0) {
      await PaymentsModel.insertMany(paymentsData);
      console.log(`✅ Successfully created ${paymentsData.length} invoices`);
    } else {
      console.log("⚠️  No invoices to create");
    }

    console.log("\n📊 ========== INVOICE CRON SUMMARY ==========");
    console.log(`   ✅ Invoices Created: ${createdInvoices}`);
    console.log(`   ⚠️  Vehicles Skipped (Inactive): ${skippedVehicles}`);
    console.log(`   ⚠️  Duplicates Skipped: ${skippedDuplicates}`);
    console.log(
      `   🕒 Completed at: ${moment().tz("Asia/Dubai").format("YYYY-MM-DD HH:mm:ss")} Dubai`,
    );
    console.log("🟢 ========== INVOICE CRON COMPLETE ==========\n");
  } catch (error) {
    console.error("❌ ========== INVOICE CRON ERROR ==========");
    console.error("❌ Error:", error.message);
    console.error("❌ Stack:", error.stack);
    console.error("❌ ========================================\n");
  }
};
