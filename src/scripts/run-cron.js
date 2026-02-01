const utils = require("../server/utils");
const database = require("../server/database");
const jobs = require("./crons/jobs");
const invoice = require("./crons/invoice");
const attendance = require("./crons/attendance");

const run = async () => {
  // Get the task name from the command line (e.g., 'jobs')
  const type = process.argv[2];
  // Get optional month/year for invoice cron (e.g., 'invoice 0 2026' for Jan 2026)
  const month = process.argv[3] !== undefined ? parseInt(process.argv[3]) : null;
  const year = process.argv[4] !== undefined ? parseInt(process.argv[4]) : null;

  try {
    // 1. Initialize Database (Crucial step from your original index.js)
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log(`MongoDB Connected. Running task: ${type}`);

    // 2. Run the requested task
    if (type === "jobs") {
      await jobs.run();
    } else if (type === "attendance") {
      await attendance.run();
    } else if (type === "invoice") {
      // Pass month/year to invoice cron if provided
      if (month !== null && year !== null) {
        console.log(`📅 Custom date provided: Month ${month} (0-11), Year ${year}`);
        await invoice.run(month, year);
      } else {
        console.log(`📅 Using current month`);
        await invoice.run();
      }
    } else {
      console.log("⚠️ Unknown task! Use 'jobs', 'attendance', or 'invoice'");
      console.log("📌 Invoice examples:");
      console.log("   node src/scripts/run-cron.js invoice           (current month)");
      console.log("   node src/scripts/run-cron.js invoice 0 2026    (January 2026)");
      console.log("   node src/scripts/run-cron.js invoice 11 2025   (December 2025)");
    }

    console.log("✅ Task Completed Successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Task Failed:", error);
    process.exit(1);
  }
};

run();
