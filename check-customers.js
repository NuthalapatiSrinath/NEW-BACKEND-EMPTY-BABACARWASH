const mongoose = require("mongoose");
require("dotenv").config();

const CustomersModel = require("./src/server/api/models/customers.model");

async function checkCustomers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Count all customers
    const totalCustomers = await CustomersModel.countDocuments({});
    console.log(`\n📊 Total customers in DB: ${totalCustomers}`);

    // Count by status
    const activeCustomers = await CustomersModel.countDocuments({
      isDeleted: false,
      status: 1,
    });
    const inactiveCustomers = await CustomersModel.countDocuments({
      isDeleted: false,
      status: 2,
    });
    const noStatusCustomers = await CustomersModel.countDocuments({
      isDeleted: false,
      status: { $exists: false },
    });

    console.log(`✅ Active (status=1): ${activeCustomers}`);
    console.log(`❌ Inactive (status=2): ${inactiveCustomers}`);
    console.log(`⚠️ No status field: ${noStatusCustomers}`);

    // Get sample customers
    console.log("\n📋 Sample customers:");
    const samples = await CustomersModel.find({ isDeleted: false })
      .limit(5)
      .lean();
    samples.forEach((c, idx) => {
      console.log(
        `${idx + 1}. ${c.firstName} - Mobile: ${c.mobile}, Status: ${c.status}, Vehicles: ${c.vehicles?.length || 0}`,
      );
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkCustomers();
