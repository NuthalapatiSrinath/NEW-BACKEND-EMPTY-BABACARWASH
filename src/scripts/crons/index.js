const cron = require("node-cron");

const utils = require("../../server/utils");
const database = require("../../server/database");
const jobs = require("./jobs");
const invoice = require("./invoice");
const attendance = require("./attendance");

const initialize = async () => {
  try {
    const utilsData = utils.initialize();

    await database.initialize(utilsData);

    console.log("MongoDB Connected");

    // Jobs Cron: Runs at 4:05 PM Dubai time daily
    cron.schedule("5 16 * * *", jobs.run, {
      scheduled: true,
      timezone: "Asia/Dubai",
    });

    cron.schedule("5 0 1 * *", invoice.run, {
      scheduled: true,
      timezone: "Asia/Dubai",
    });

    // Attendance Cron: Runs at 12:05 AM Dubai time daily
    cron.schedule("5 0 * * *", attendance.run, {
      scheduled: true,
      timezone: "Asia/Dubai",
    });
  } catch (error) {
    console.error(error);
  }
};
initialize();
