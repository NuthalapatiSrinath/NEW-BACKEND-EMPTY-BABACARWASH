const utils = require("./src/server/utils");
const database = require("./src/server/database");
const CustomersModel = require("./src/server/api/models/customers.model");

const fixBuildings = async () => {
  try {
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log("✅ MongoDB Connected\n");

    const customers = await CustomersModel.find({
      isDeleted: false,
      building: { $exists: true },
    }).lean();

    console.log(
      `📊 Checking ${customers.length} customers with building field\n`,
    );

    const validBuildingId = "6973ca88d9d1f1001560545a"; // Gardenia Residence

    let fixed = 0;
    for (const customer of customers) {
      if (!customer.building || customer.building === "") {
        console.log(`Skipping ${customer.mobile} - empty building`);
        continue;
      }

      if (String(customer.building) !== validBuildingId) {
        console.log(
          `🔧 Fixing ${customer.mobile} - Invalid building: ${customer.building} → ${validBuildingId}`,
        );

        await CustomersModel.updateOne(
          { _id: customer._id },
          { $unset: { building: "" } }, // Remove the invalid building
        );
        fixed++;
      }
    }

    console.log(`\n✅ Fixed ${fixed} customers (removed invalid building IDs)`);
    console.log(
      `\n💡 Now you need to manually assign correct buildings from the frontend`,
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

fixBuildings();
