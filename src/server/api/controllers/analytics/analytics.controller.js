const service = require("./analytics.service");
const controller = module.exports;

// ⚡ ULTRA-FAST Unified Dashboard - Returns ALL data in one optimized call
controller.dashboardAll = async (req, res) => {
  try {
    const startTime = Date.now();
    const { user, query } = req;
    
    const data = await service.dashboardAll(user, query);
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Dashboard API response sent in ${elapsedTime}s`);
    
    return res.status(200).json({ 
      statusCode: 200, 
      message: "success", 
      data,
      loadTime: `${elapsedTime}s`
    });
  } catch (error) {
    console.error("❌ Dashboard All Error:", error);
    return res.status(500).json({ 
      statusCode: 500,
      message: "Internal server error", 
      error: error.message 
    });
  }
};

controller.admin = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.admin(user, query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.charts = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.charts(user, query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.supervisors = async (req, res) => {
  try {
    const { user, body } = req;
    const data = await service.supervisors(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.revenueTrends = async (req, res) => {
  try {
    const { query } = req;
    const data = await service.revenueTrends(query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.topWorkers = async (req, res) => {
  try {
    const { query } = req;
    const data = await service.topWorkers(query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.recentActivities = async (req, res) => {
  try {
    const { query } = req;
    const data = await service.recentActivities(query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.serviceDistribution = async (req, res) => {
  try {
    const { query } = req;
    const data = await service.serviceDistribution(query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.buildingAnalytics = async (req, res) => {
  try {
    const { query } = req;
    const data = await service.buildingAnalytics(query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.comparativeAnalytics = async (req, res) => {
  try {
    const data = await service.comparativeAnalytics();
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
