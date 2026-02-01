const utils = require("./src/server/utils");
const database = require("./src/server/database");
const JobsModel = require("./src/server/api/models/jobs.model");
const CustomersModel = require("./src/server/api/models/customers.model");
const BuildingsModel = require("./src/server/api/models/buildings.model");

const checkJobPopulation = async () => {
  try {
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log("✅ MongoDB Connected\n");

    // Get the latest 5 jobs
    const jobs = await JobsModel.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    console.log(`📊 Checking latest 5 jobs:\n`);

    for (const job of jobs) {
      console.log(`\n🔹 Job ID: ${job._id}`);
      console.log(`   Customer ID: ${job.customer}`);
      console.log(`   Building ID: ${job.building}`);
      console.log(`   Vehicle ID: ${job.vehicle}`);

      // Check if customer exists
      if (job.customer) {
        const customer = await CustomersModel.findById(job.customer);
        if (customer) {
          console.log(
            `   ✅ Customer found: ${customer.firstName} ${customer.lastName} (${customer.mobile})`,
          );

          // Check if vehicle exists in customer
          if (job.vehicle) {
            const vehicle = customer.vehicles.find(
              (v) => String(v._id) === String(job.vehicle),
            );
            if (vehicle) {
              console.log(`   ✅ Vehicle found: ${vehicle.registration_no}`);
            } else {
              console.log(`   ❌ Vehicle NOT found in customer's vehicles`);
            }
          }
        } else {
          console.log(`   ❌ Customer NOT found in database`);
        }
      }

      // Check if building exists
      if (job.building) {
        const building = await BuildingsModel.findById(job.building);
        if (building) {
          console.log(`   ✅ Building found: ${building.name}`);
        } else {
          console.log(`   ❌ Building NOT found in database`);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

checkJobPopulation();
