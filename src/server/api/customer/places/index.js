const router = require("express").Router();
const axios = require("axios");
const AuthHelper = require("../auth/auth.helper");

const GOOGLE_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY || "AIzaSyCP0H5fPh0oO_keXrE9fwAoyeXRvhUH5rA";

// GET /api/customer/places/autocomplete?input=...
router.get("/autocomplete", AuthHelper.authenticate, async (req, res) => {
  try {
    const { input } = req.query;
    if (!input || input.trim().length < 2) {
      return res.json({ status: "OK", predictions: [] });
    }
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json`;
    const response = await axios.get(url, {
      params: { input: input.trim(), key: GOOGLE_API_KEY, language: "en" },
      timeout: 10000,
    });
    return res.json(response.data);
  } catch (err) {
    console.error("Places autocomplete error:", err.message);
    return res.status(500).json({ status: "ERROR", error: err.message });
  }
});

// GET /api/customer/places/details?place_id=...
router.get("/details", AuthHelper.authenticate, async (req, res) => {
  try {
    const { place_id } = req.query;
    if (!place_id) {
      return res
        .status(400)
        .json({ status: "ERROR", error: "place_id is required" });
    }
    const url = `https://maps.googleapis.com/maps/api/place/details/json`;
    const response = await axios.get(url, {
      params: {
        place_id,
        key: GOOGLE_API_KEY,
        fields: "geometry,formatted_address,name",
      },
      timeout: 10000,
    });
    return res.json(response.data);
  } catch (err) {
    console.error("Place details error:", err.message);
    return res.status(500).json({ status: "ERROR", error: err.message });
  }
});

// GET /api/customer/places/geocode?latlng=lat,lng
router.get("/geocode", AuthHelper.authenticate, async (req, res) => {
  try {
    const { latlng } = req.query;
    if (!latlng) {
      return res
        .status(400)
        .json({ status: "ERROR", error: "latlng is required" });
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json`;
    const response = await axios.get(url, {
      params: { latlng, key: GOOGLE_API_KEY },
      timeout: 10000,
    });
    return res.json(response.data);
  } catch (err) {
    console.error("Geocode error:", err.message);
    return res.status(500).json({ status: "ERROR", error: err.message });
  }
});

module.exports = router;
