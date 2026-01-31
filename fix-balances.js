const mongoose = require("mongoose");
require("dotenv").config();

const PaymentsModel = require("./src/server/api/models/payments.model");

async function fixBalances() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/bcw",
    );

    console.log(
      "✅ Connected! Finding all payments with incorrect balance...\n",
    );

    const allPayments = await PaymentsModel.find({ isDeleted: false }).lean();
    let fixedCount = 0;

    for (const payment of allPayments) {
      const correctBalance =
        (payment.total_amount || 0) - (payment.amount_paid || 0);

      if (payment.balance !== correctBalance) {
        console.log(`🔧 Fixing payment ${payment._id}:`);
        console.log(`   Old Balance: ${payment.balance}`);
        console.log(
          `   Correct Balance: ${correctBalance} (${payment.total_amount} - ${payment.amount_paid})`,
        );

        await PaymentsModel.updateOne(
          { _id: payment._id },
          { $set: { balance: correctBalance } },
        );

        fixedCount++;
      }
    }

    console.log(
      `\n✅ Fixed ${fixedCount} payments out of ${allPayments.length} total`,
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

fixBalances();
