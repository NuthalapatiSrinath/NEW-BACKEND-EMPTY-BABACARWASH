const service = require("./vehicle-catalog.service");
const controller = module.exports;

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

controller.search = async (req, res) => {
  try {
    const data = await service.search(req.query);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

controller.popularBrands = async (req, res) => {
  try {
    const data = await service.popularBrands(req.query.vehicleType);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
