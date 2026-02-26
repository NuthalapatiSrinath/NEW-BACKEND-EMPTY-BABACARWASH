const service = require("./vehicle-catalog.service");
const controller = module.exports;

// ============== BRANDS ==============

controller.listBrands = async (req, res) => {
  try {
    const data = await service.listBrands(req.query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.createBrand = async (req, res) => {
  try {
    const data = await service.createBrand(req.body, req.file);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Brand created successfully", data });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.updateBrand = async (req, res) => {
  try {
    const data = await service.updateBrand(req.params.id, req.body, req.file);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Brand updated successfully", data });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.deleteBrand = async (req, res) => {
  try {
    await service.deleteBrand(req.params.id);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Brand deleted successfully" });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// ============== MODELS ==============

controller.listModels = async (req, res) => {
  try {
    const data = await service.listModels(req.query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.createModel = async (req, res) => {
  try {
    const data = await service.createModel(req.body, req.file);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Model created successfully", data });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.updateModel = async (req, res) => {
  try {
    const data = await service.updateModel(req.params.id, req.body, req.file);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Model updated successfully", data });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.deleteModel = async (req, res) => {
  try {
    await service.deleteModel(req.params.id);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Model deleted successfully" });
  } catch (error) {
    if (typeof error === "string") {
      return res.status(400).json({ message: error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// ============== STATS ==============

controller.getStats = async (req, res) => {
  try {
    const data = await service.getStats();
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
