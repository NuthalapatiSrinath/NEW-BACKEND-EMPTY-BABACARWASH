const utils = require("./src/server/utils");
const database = require("./src/server/database");
const JobsModel = require("./src/server/api/models/jobs.model");

const fixJobs = async () => {
  try {
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log("✅ MongoDB Connected\n");

    // Find all jobs with empty string worker
    const result = await JobsModel.updateMany(
      { worker: "" },
      { $unset: { worker: "" } },
    );

    console.log(
      `✅ Fixed ${result.modifiedCount} jobs (removed empty worker field)`,
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

fixJobs();
