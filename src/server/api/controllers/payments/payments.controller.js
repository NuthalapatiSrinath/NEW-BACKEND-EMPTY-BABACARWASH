const service = require("./payments.service");
const controller = module.exports;

controller.list = async (req, res) => {
  try {
    const { user, query } = req;
    console.log("🔵 [BACKEND] Payments list called with query:", query);
    const data = await service.list(user, query);
    console.log(
      "✅ [BACKEND] Payments list success, returning",
      data.total,
      "records",
    );
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error("❌ [BACKEND] Payments list error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

controller.info = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.info(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.create = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.create(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error.code == 11000) {
      return res.status(409).json({
        statusCode: 409,
        message: "Oops! Location already exists",
        error,
      });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.update = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.update(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.delete = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.delete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.undoDelete = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.undoDelete(user, params.id);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.updatePayment = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.updatePayment(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.collectPayment = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.collectPayment(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error == "string") {
      return res.status(400).json({ statusCode: 400, message: error });
    }
    console.error(error);
    return res
      .status(400)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.settlements = async (req, res) => {
  try {
    const { user, query } = req;
    console.log("Settlements request from user:", user.role, user._id);
    console.log("Query params:", query);
    const data = await service.settlements(user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error("Settlements Controller Error:", error);
    console.error("Error stack:", error.stack);
    return res.status(400).json({
      status: false,
      message: error.message || "Internal server error",
      error: error.toString(),
    });
  }
};

controller.updateSettlements = async (req, res) => {
  try {
    const { params, user, query } = req;
    const data = await service.updateSettlements(params.id, user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res
      .status(400)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.settlePayment = async (req, res) => {
  try {
    const { user, params, body } = req;
    const data = await service.settlePayment(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res
      .status(400)
      .json({ status: false, message: "Internal server error", error });
  }
};

controller.exportData = async (req, res) => {
  try {
    const { user, query } = req;
    const workbook = await service.exportData(user, query);
    workbook.xlsx
      .write(res)
      .then(() => {
        res.end();
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Internal Server Error");
      });
  } catch (error) {
    console.error(error);
    return res
      .status(200)
      .json({ status: false, message: "Internal server error", error });
  }
};

// ✅ UPDATED: Fixes the issue where PDF request got an Excel file
controller.monthlyStatement = async (req, res) => {
  try {
    const { user, query } = req;

    // Get result from service (could be Workbook OR JSON Array)
    const result = await service.monthlyStatement(user, query);

    // 1. If Frontend requested JSON (for PDF), return JSON response
    if (query.format === "json") {
      return res.status(200).json(result);
    }

    // 2. Otherwise, treat as Excel Workbook (Standard Download)
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=" + "Report.xlsx",
    );

    return result.xlsx
      .write(res)
      .then(() => {
        res.end();
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Internal Server Error");
      });
  } catch (error) {
    console.error("Monthly Statement Error:", error);
    return res
      .status(200) // Keeping 200 as per your previous error handling preference, though 500 is standard
      .json({ status: false, message: "Internal server error", error });
  }
};
controller.bulkUpdateStatus = async (req, res) => {
  try {
    const { user, body } = req;
    console.log("🔵 [CONTROLLER] Bulk Status Request Received");
    console.log("👤 User:", user.name, user.role);
    console.log("📦 Body:", JSON.stringify(body)); // See what frontend sends

    const data = await service.bulkUpdateStatus(user, body);

    console.log("✅ [CONTROLLER] Bulk Status Success");
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error("❌ [CONTROLLER] Bulk Status Error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

controller.closeMonth = async (req, res) => {
  try {
    const { user } = req;
    const { month, year } = req.body;
    console.log("🔵 [CONTROLLER] Month-End Close Request");
    console.log("👤 User:", user.name, user.role);
    console.log("📅 Month:", month, "Year:", year);

    const result = await service.closeMonth(user, month, year);

    console.log("✅ [CONTROLLER] Month-End Close Success");
    return res.status(200).json({
      statusCode: 200,
      message: "Month closed successfully",
      closedBills: result.closedBills,
      newBills: result.newBills,
    });
  } catch (error) {
    console.error("❌ [CONTROLLER] Month-End Close Error:", error);
    return res
      .status(500)
      .json({ message: "Failed to close month", error: error.message });
  }
};

controller.revertMonthClose = async (req, res) => {
  try {
    const { user } = req;
    const { month, year } = req.body;
    console.log("🔵 [CONTROLLER] Revert Month-End Close Request");
    console.log("👤 User:", user.name, user.role);
    console.log("📅 Month:", month, "Year:", year);

    const result = await service.revertMonthClose(user, month, year);

    console.log("✅ [CONTROLLER] Revert Success");
    return res.status(200).json({
      statusCode: 200,
      message: "Month closure reverted successfully",
      deletedBills: result.deletedBills,
      reopenedBills: result.reopenedBills,
    });
  } catch (error) {
    console.error("❌ [CONTROLLER] Revert Month Close Error:", error);
    return res
      .status(500)
      .json({ message: "Failed to revert month close", error: error.message });
  }
};

controller.getMonthsWithPending = async (req, res) => {
  try {
    const { user } = req;
    console.log("🔵 [CONTROLLER] Get Months with Pending Bills");
    console.log("👤 User:", user.name, user.role);

    const result = await service.getMonthsWithPending();
    console.log("📦 [CONTROLLER] Service returned:", result);

    console.log(
      "✅ [CONTROLLER] Found",
      result.length,
      "months with pending bills",
    );
    return res.status(200).json({
      statusCode: 200,
      months: result,
    });
  } catch (error) {
    console.error("❌ [CONTROLLER] Get Months Error:", error);
    console.error("❌ Stack:", error.stack);
    return res
      .status(500)
      .json({ message: "Failed to fetch months", error: error.message });
  }
};

controller.exportPDF = async (req, res) => {
  try {
    const { user, query } = req;
    console.log("📄 [CONTROLLER] PDF Export requested");
    console.log("Query filters:", query);

    const pdfBuffer = await service.generatePDF(user, query);

    // Set headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=residence_payments_${new Date().toISOString().split("T")[0]}.pdf`,
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    console.log(
      "✅ [CONTROLLER] PDF generated successfully, size:",
      pdfBuffer.length,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ [CONTROLLER] PDF Export Error:", error);
    return res
      .status(500)
      .json({ message: "Failed to generate PDF", error: error.message });
  }
};
