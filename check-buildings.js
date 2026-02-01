const utils = require("./src/server/utils");
const database = require("./src/server/database");
const CustomersModel = require("./src/server/api/models/customers.model");
const BuildingsModel = require("./src/server/api/models/buildings.model");

const checkBuildings = async () => {
  try {
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log("✅ MongoDB Connected\n");

    // Get all customers
    const customers = await CustomersModel.find({ isDeleted: false }).lean();
    console.log(`📊 Total customers: ${customers.length}\n`);

    // Get all buildings
    const buildings = await BuildingsModel.find({ isDeleted: false }).lean();
    console.log(`🏢 Total buildings: ${buildings.length}`);
    buildings.forEach((b) => {
      console.log(`   - ${b.name} (ID: ${b._id})`);
    });
    console.log();

    // Check each customer's building
    let validCount = 0;
    let invalidCount = 0;
    let emptyCount = 0;

    for (const customer of customers) {
      const name =
        `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
      const mobile = customer.mobile;

      if (!customer.building || customer.building === "") {
        emptyCount++;
        console.log(`❌ ${name} (${mobile}) - No building assigned`);
      } else {
        // Try to find the building
        const building = buildings.find(
          (b) => String(b._id) === String(customer.building),
        );

        if (building) {
          validCount++;
          console.log(
            `✅ ${name} (${mobile}) - Building: ${building.name} (${customer.building})`,
          );
        } else {
          invalidCount++;
          console.log(
            `⚠️ ${name} (${mobile}) - Invalid building ID: ${customer.building}`,
          );
        }
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Valid: ${validCount}`);
    console.log(`   ⚠️  Invalid: ${invalidCount}`);
    console.log(`   ❌ Empty: ${emptyCount}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

checkBuildings();
