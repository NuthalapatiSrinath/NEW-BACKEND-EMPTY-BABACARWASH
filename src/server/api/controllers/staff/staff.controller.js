const service = require("./staff.service");
const fs = require("fs"); // ✅ Ensure fs is imported at top level
const controller = module.exports;

// --- LIST ---
controller.list = async (req, res) => {
  try {
    const { user, query } = req;
    const data = await service.list(user, query);
    return res
      .status(200)
      .json({ statusCode: 200, message: "success", ...data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- INFO ---
controller.info = async (req, res) => {
  try {
    const { user, params } = req;
    const data = await service.info(user, params.id);
    if (!data) return res.status(404).json({ message: "Staff not found" });
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- CREATE ---
controller.create = async (req, res) => {
  try {
    const { user, body } = req;
    // body contains name, mobile, email, etc. directly from frontend
    const data = await service.create(user, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (error === "USER-EXISTS") {
      return res
        .status(409)
        .json({ statusCode: 409, message: "Employee already created", error });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- UPDATE ---
controller.update = async (req, res) => {
  try {
    const { user, params, body } = req;
    // body contains updated fields like mobile, email, etc.
    const data = await service.update(user, params.id, body);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error === "string")
      return res.status(400).json({ message: error });
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- DELETE ---
controller.delete = async (req, res) => {
  try {
    const { user, params, body } = req;
    // Pass reason for deletion if provided
    const data = await service.delete(user, params.id, body.reason);
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    if (typeof error === "string")
      return res.status(400).json({ message: error });
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- UNDO DELETE ---
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

// --- UPLOAD DOCUMENT ---
controller.uploadDocument = async (req, res) => {
  try {
    const { user, params, body } = req;
    const { documentType } = body;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const uploadedFile = req.file;
    const fileData = {
      filename:
        uploadedFile.originalFilename ||
        uploadedFile.name ||
        uploadedFile.filename,
      path: uploadedFile.filepath || uploadedFile.path,
      mimetype: uploadedFile.mimetype,
      size: uploadedFile.size,
    };

    await service.uploadDocument(user, params.id, documentType, fileData);

    return res.status(200).json({
      statusCode: 200,
      message: "Document uploaded successfully",
      fileName: fileData.filename,
      // Helper URL for frontend
      filePath: `/api/admin/staff/${params.id}/document/${documentType}`,
    });
  } catch (error) {
    console.error("Upload document error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- UPLOAD PROFILE IMAGE (✅ NEW) ---
controller.uploadProfileImage = async (req, res) => {
  console.log("🚀 [Controller] Upload Profile Image Hit");
  try {
    const { user, params } = req;

    if (!req.file) {
      console.error("❌ No file received in request");
      return res.status(400).json({ message: "No image uploaded" });
    }

    const uploadedFile = req.file;
    const fileData = {
      filename:
        uploadedFile.originalFilename ||
        uploadedFile.name ||
        uploadedFile.filename,
      path: uploadedFile.filepath || uploadedFile.path,
    };

    console.log("📂 File Data:", fileData);

    const data = await service.uploadProfileImage(user, params.id, fileData);

    return res
      .status(200)
      .json({ statusCode: 200, message: "Profile image updated", data });
  } catch (error) {
    console.error("❌ Upload Error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- DELETE DOCUMENT ---
controller.deleteDocument = async (req, res) => {
  try {
    const { user, params, body } = req;
    const { id } = params;
    const { documentType } = body;
    await service.deleteDocument(user, id, documentType);
    return res
      .status(200)
      .json({ statusCode: 200, message: "Document deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- GET EXPIRING ---
controller.getExpiringDocuments = async (req, res) => {
  try {
    const data = await service.getExpiringDocuments();
    return res.status(200).json({ statusCode: 200, message: "success", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- GET DOCUMENT (VIEW) ---
controller.getDocument = async (req, res) => {
  try {
    const { params, query } = req;
    const { id, documentType } = params;

    let user = req.user;

    // Optional: Allow token in query param for secure iframe/redirect access
    if (!user && query.token) {
      try {
        const jwt = require("jsonwebtoken");
        const secretKey = process.env.SECRET_KEY || process.env.JWT_SECRET;
        const decoded = jwt.verify(query.token, secretKey);
        user = decoded;
      } catch (e) {
        return res
          .status(401)
          .json({ message: "Invalid token", error: e.message });
      }
    }

    if (!user) return res.status(401).json({ message: "Not authorized" });

    // Use empty object for userInfo if strictly just fetching by ID
    const staff = await service.info({}, id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    const fieldMap = {
      Passport: "passportDocument",
      Visa: "visaDocument",
      "Emirates ID": "emiratesIdDocument",
    };

    const docField = fieldMap[documentType];
    if (!docField)
      return res.status(400).json({ message: "Invalid document type" });

    const document = staff[docField];

    if (!document || !document.url)
      return res.status(404).json({ message: "Document not found" });

    // ✅ Redirect to the Oracle Object Storage URL
    return res.redirect(document.url);
  } catch (error) {
    console.error("❌ Document access error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- EXPORT ---
controller.exportData = async (req, res) => {
  try {
    const { user, query } = req;
    const buffer = await service.exportData(user, query);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="staff-export-${Date.now()}.xlsx"`
    );
    res.send(buffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- GENERATE TEMPLATE ---
controller.generateTemplate = async (req, res) => {
  try {
    const buffer = await service.generateTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="staff-import-template.xlsx"`
    );
    res.send(buffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// --- IMPORT ---
controller.importData = async (req, res) => {
  try {
    const { user } = req;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const uploadedFile = req.file;

    // Read file from disk
    const fileBuffer = fs.readFileSync(
      uploadedFile.filepath || uploadedFile.path
    );

    // Process Excel Import
    const results = await service.importDataFromExcel(user, fileBuffer);

    // Clean up temp file
    try {
      fs.unlinkSync(uploadedFile.filepath || uploadedFile.path);
    } catch (e) {
      console.log("Could not delete temp file:", e.message);
    }

    return res
      .status(200)
      .json({ statusCode: 200, message: "Import completed", results });
  } catch (error) {
    console.error("Import error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message || error,
    });
  }
};

module.exports = controller;
