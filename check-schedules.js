const utils = require("./src/server/utils");
const database = require("./src/server/database");
const CustomersModel = require("./src/server/api/models/customers.model");
const moment = require("moment-timezone");

const checkSchedules = async () => {
  try {
    const utilsData = utils.initialize();
    await database.initialize(utilsData);
    console.log("✅ MongoDB Connected\n");

    const tomorrow = moment()
      .tz("Asia/Dubai")
      .startOf("day")
      .add(1, "day")
      .tz("Asia/Dubai");
    const tomorrowDay = tomorrow.get("day"); // 0=Sunday, 6=Saturday

    console.log(`📅 Tomorrow: ${tomorrow.format("YYYY-MM-DD dddd")} (day number: ${tomorrowDay})\n`);

    // Get customers with buildings
    const customers = await CustomersModel.find({
      isDeleted: false,
      building: { $exists: true, $ne: "" },
    }).lean();

    console.log(`� Found ${customers.length} customers with buildings\n`);

    for (const customer of customers) {
      const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
      const mobile = customer.mobile;

      console.log(`\n👤 ${name} (${mobile})`);
      console.log(`   Building: ${customer.building}`);
      console.log(`   Vehicles: ${customer.vehicles.length}`);

      for (const vehicle of customer.vehicles) {
        console.log(
          `\n   🚗 Vehicle: ${vehicle.registration_no} (Status: ${vehicle.status})`
        );
        console.log(`      Schedule Type: ${vehicle.schedule_type}`);

        if (vehicle.schedule_type === "daily") {
          console.log(`      ✅ DAILY - Job will be created for tomorrow`);
        } else if (vehicle.schedule_type === "weekly") {
          console.log(`      Schedule Days: ${JSON.stringify(vehicle.schedule_days)}`);

          const hasTomorrow = vehicle.schedule_days.some(
            (day) => day.value === tomorrowDay
          );

          if (hasTomorrow) {
            console.log(`      ✅ Tomorrow (${tomorrow.format("dddd")}) IS in schedule - Job will be created`);
          } else {
            console.log(`      ❌ Tomorrow (${tomorrow.format("dddd")}) NOT in schedule - No job`);
          }
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

checkSchedules();
