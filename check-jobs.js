const utils = require("./src/server/utils");
const database = require("./src/server/database");
const JobsModel = require("./src/server/api/models/jobs.model");

const checkJobs = async () => {
  try {
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log("✅ MongoDB Connected\n");

    const jobs = await JobsModel.find({}).lean();

    console.log(`📊 Total jobs in database: ${jobs.length}\n`);

    for (const job of jobs) {
      console.log(`\n🔹 Job ID: ${job._id}`);
      console.log(`   Schedule ID: ${job.scheduleId}`);
      console.log(`   Vehicle: ${job.vehicle}`);
      console.log(`   Customer: ${job.customer}`);
      console.log(`   Worker: ${job.worker}`);
      console.log(`   Building: ${job.building}`);
      console.log(`   Location: ${job.location}`);
      console.log(`   Assigned Date: ${job.assignedDate}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Created By: ${job.createdBy}`);
      console.log(`   Created At: ${job.createdAt}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

checkJobs();
