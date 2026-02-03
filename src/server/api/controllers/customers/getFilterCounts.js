const CustomersModel = require("../../models/customers.model");
const mongoose = require("mongoose");

/**
 * Get filter counts for workers and buildings (FAST - no pending dues calculation)
 * Returns aggregated counts without loading full customer documents
 */
const getFilterCounts = async (req, res) => {
  try {
    console.log(
      "🚀 [FILTER COUNTS] Starting fast filter counts calculation...",
    );

    const { worker, building } = req.query;

    // Base filter - only non-deleted customers
    const baseFilter = { isDeleted: false };

    // Apply worker filter if provided (use $elemMatch to match exact worker, excluding null)
    if (worker) {
      const workerObjectId = mongoose.Types.ObjectId.isValid(worker)
        ? new mongoose.Types.ObjectId(worker)
        : worker;

      baseFilter.vehicles = {
        $elemMatch: {
          worker: workerObjectId,
        },
      };
      console.log(
        "👷 [FILTER COUNTS] Filtering by worker:",
        worker,
        "ObjectId:",
        workerObjectId,
      );
    }

    // Apply building filter if provided
    if (building) {
      baseFilter.building = building;
    }

    console.log("📊 [FILTER COUNTS] Base filter:", baseFilter);

    // Parallel aggregation queries for maximum speed
    const [workerCounts, buildingCounts, totals] = await Promise.all([
      // Worker counts (group by worker at vehicle level)
      CustomersModel.aggregate([
        { $match: building ? { ...baseFilter } : { isDeleted: false } },
        { $unwind: "$vehicles" },
        {
          $group: {
            _id: "$vehicles.worker",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            workerId: "$_id",
            count: 1,
            _id: 0,
          },
        },
      ]),

      // Building counts (group by building)
      CustomersModel.aggregate([
        { $match: worker ? { ...baseFilter } : { isDeleted: false } },
        {
          $group: {
            _id: "$building",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            buildingId: "$_id",
            count: 1,
            _id: 0,
          },
        },
      ]),

      // Total counts
      Promise.all([
        // Total active customers with workers (filtered by building if provided)
        CustomersModel.aggregate([
          {
            $match: {
              isDeleted: false,
              status: 1,
              ...(building ? { building } : {}),
              vehicles: {
                $elemMatch: {
                  worker: { $exists: true, $ne: null },
                },
              },
            },
          },
          { $count: "total" },
        ]),

        // Total active customers with buildings (filtered by worker if provided)
        CustomersModel.aggregate([
          {
            $match: {
              isDeleted: false,
              status: 1,
              ...(worker
                ? {
                    vehicles: {
                      $elemMatch: {
                        worker: mongoose.Types.ObjectId.isValid(worker)
                          ? new mongoose.Types.ObjectId(worker)
                          : worker,
                      },
                    },
                  }
                : {}),
              building: { $exists: true, $ne: null },
            },
          },
          { $count: "total" },
        ]),
      ]),
    ]);

    // Format worker counts as object
    const workerCountsMap = {};
    workerCounts.forEach((item) => {
      if (item.workerId) {
        workerCountsMap[item.workerId.toString()] = item.count;
      }
    });

    // Format building counts as object
    const buildingCountsMap = {};
    buildingCounts.forEach((item) => {
      if (item.buildingId) {
        buildingCountsMap[item.buildingId.toString()] = item.count;
      }
    });

    const response = {
      workerCounts: workerCountsMap,
      buildingCounts: buildingCountsMap,
      totalCustomersWithWorkers: totals[0][0]?.total || 0,
      totalCustomersWithBuildings: totals[1][0]?.total || 0,
    };

    console.log("✅ [FILTER COUNTS] Counts calculated:");
    console.log(
      "   - Workers:",
      Object.keys(workerCountsMap).length,
      "unique workers",
    );
    console.log(
      "   - Buildings:",
      Object.keys(buildingCountsMap).length,
      "unique buildings",
    );
    console.log("   - Total with workers:", response.totalCustomersWithWorkers);
    console.log(
      "   - Total with buildings:",
      response.totalCustomersWithBuildings,
    );

    res.status(200).json({
      statusCode: 200,
      message: "Filter counts retrieved successfully",
      data: response,
    });
  } catch (error) {
    console.error("❌ [FILTER COUNTS] Error:", error);
    res.status(500).json({
      statusCode: 500,
      message: "Failed to get filter counts",
      error: error.message,
    });
  }
};

module.exports = { getFilterCounts };
