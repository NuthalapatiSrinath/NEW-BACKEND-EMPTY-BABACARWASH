const utils = require("../server/utils");
const database = require("../server/database");
const jobs = require("./crons/jobs");
const invoice = require("./crons/invoice");
const attendance = require("./crons/attendance");

const run = async () => {
  // Get the task name from the command line (e.g., 'jobs')
  const type = process.argv[2];
  // Get optional month/year for invoice cron (e.g., 'invoice 0 2026' for Jan 2026)
  const month =
    process.argv[3] !== undefined ? parseInt(process.argv[3]) : null;
  const year = process.argv[4] !== undefined ? parseInt(process.argv[4]) : null;
  // Get optional date for jobs cron (e.g., 'jobs 2026-02-04')
  const targetDate = process.argv[3] || null;

  try {
    // 1. Initialize Database (Crucial step from your original index.js)
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log(`MongoDB Connected. Running task: ${type}`);

    // 2. Run the requested task
    if (type === "jobs") {
      const result = await jobs.run(targetDate);
      console.log(
        `✅ Generated ${result.jobsGenerated} jobs for ${result.targetDate}`,
      );
    } else if (type === "attendance") {
      await attendance.run();
    } else if (type === "invoice") {
      // Pass month/year/mode to invoice cron if provided
      // Usage: invoice [month] [year] [mode]
      // mode: "full_subscription" or "per_wash" (default: "full_subscription")
      const invoiceMode = process.argv[5] || "full_subscription";
      if (month !== null && year !== null) {
        console.log(
          `📅 Custom date provided: Billing month ${month} (0-11), Year ${year}`,
        );
        console.log(`💡 Mode: ${invoiceMode}`);
        await invoice.run(month, year, invoiceMode);
      } else {
        console.log(`📅 Cron mode: billing for PREVIOUS month`);
        console.log(`💡 Mode: ${invoiceMode}`);
        await invoice.run(null, null, invoiceMode);
      }
    } else {
      console.log("⚠️ Unknown task! Use 'jobs', 'attendance', or 'invoice'");
      console.log("📌 Invoice examples:");
      console.log(
        "   node src/scripts/run-cron.js invoice              (previous month, full_subscription)",
      );
      console.log(
        "   node src/scripts/run-cron.js invoice 1 2026       (February 2026 billing)",
      );
      console.log(
        "   node src/scripts/run-cron.js invoice 1 2026 per_wash  (February 2026, per-wash)",
      );
    }

    console.log("✅ Task Completed Successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Task Failed:", error);
    process.exit(1);
  }
};

run();
