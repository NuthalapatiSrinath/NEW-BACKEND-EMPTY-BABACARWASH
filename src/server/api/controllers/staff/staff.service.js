const StaffModel = require("../../models/staff.model");
const SiteModel = require("../../models/sites.model");
const CounterService = require("../../../utils/counters");
const CommonHelper = require("../../../helpers/common.helper");
const oracleService = require("../../../cloud/oracle");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const service = module.exports;

// ✅ HELPER: Safely parse dates from Excel
// Prevents "ERR_ASSERTION" crashes if Excel sends invalid date formats
const parseExcelDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  // Check if date is valid (getTime is not NaN)
  return isNaN(date.getTime()) ? undefined : date;
};

// --- LIST ---
service.list = async (userInfo, query) => {
  const paginationData = CommonHelper.paginationData(query);

  const findQuery = {
    isDeleted: false,
    ...(query.search
      ? {
          $or: [
            { name: { $regex: query.search, $options: "i" } },
            { employeeCode: { $regex: query.search, $options: "i" } },
            { companyName: { $regex: query.search, $options: "i" } },
            { passportNumber: { $regex: query.search, $options: "i" } },
            { visaNumber: { $regex: query.search, $options: "i" } }, // ✅ Added
            { emiratesId: { $regex: query.search, $options: "i" } },
            { mobile: { $regex: query.search, $options: "i" } }, // ✅ Added
            { email: { $regex: query.search, $options: "i" } }, // ✅ Added
            // Search by site string if it was imported as text
            { site: { $regex: query.search, $options: "i" } },
          ],
        }
      : null),
  };

  const total = await StaffModel.countDocuments(findQuery);
  const data = await StaffModel.find(findQuery)
    .sort({ visaExpiry: 1, _id: -1 })
    .skip(paginationData.skip)
    .limit(paginationData.limit)
    // .populate("site") // ❌ REMOVED: Prevents crash if site is a String
    .lean();

  return { total, data };
};

// --- INFO ---
service.info = async (userInfo, id) => {
  return StaffModel.findOne({ _id: id, isDeleted: false }).lean();
};

// --- CREATE ---
service.create = async (userInfo, payload) => {
  const query = { isDeleted: false, $or: [] };
  if (payload.employeeCode)
    query.$or.push({ employeeCode: payload.employeeCode });
  if (payload.passportNumber)
    query.$or.push({ passportNumber: payload.passportNumber });

  if (query.$or.length > 0) {
    const exists = await StaffModel.findOne(query);
    if (exists) throw "USER-EXISTS";
  }

  const id = await CounterService.id("staff");
  const data = {
    createdBy: userInfo._id,
    updatedBy: userInfo._id,
    id,
    ...payload,
  };
  await new StaffModel(data).save();
};

// --- UPDATE ---
service.update = async (userInfo, id, payload) => {
  if (payload.employeeCode) {
    const isExists = await StaffModel.countDocuments({
      _id: { $ne: id },
      isDeleted: false,
      employeeCode: payload.employeeCode,
    });
    if (isExists) throw "Oops! Employee already exists";
  }
  const data = { updatedBy: userInfo._id, ...payload };
  await StaffModel.updateOne({ _id: id }, { $set: data });
};

// --- DELETE ---
service.delete = async (userInfo, id, reason) => {
  return await StaffModel.updateOne(
    { _id: id },
    { isDeleted: true, deletedBy: userInfo._id, deleteReason: reason }
  );
};

// --- UNDO DELETE ---
service.undoDelete = async (userInfo, id) => {
  return await StaffModel.updateOne(
    { _id: id },
    { isDeleted: false, updatedBy: userInfo._id }
  );
};

// --- UPLOAD DOCUMENT ---
service.uploadDocument = async (userInfo, id, documentType, fileData) => {
  const fieldMap = {
    Passport: "passportDocument",
    Visa: "visaDocument",
    "Emirates ID": "emiratesIdDocument",
  };
  const fieldName = fieldMap[documentType];
  if (!fieldName) throw new Error("Invalid document type");

  const staff = await StaffModel.findById(id);
  if (!staff) throw new Error("Staff not found");

  // Delete old file if exists
  if (staff[fieldName]?.filename) {
    try {
      await oracleService.deleteFile(staff[fieldName].filename);
    } catch (e) {}
  }

  const filePath = fileData.path;
  const ext = path.extname(fileData.filename) || ".pdf";
  const oracleFileName = `staff-${id}-${documentType.replace(
    /\s+/g,
    ""
  )}-${Date.now()}${ext}`;
  const publicUrl = await oracleService.uploadFile(filePath, oracleFileName);

  try {
    fs.unlinkSync(filePath);
  } catch (e) {}

  const documentData = {
    url: publicUrl,
    publicId: oracleFileName,
    filename: oracleFileName,
    uploadedAt: new Date(),
  };

  await StaffModel.updateOne(
    { _id: id },
    { $set: { [fieldName]: documentData, updatedBy: userInfo._id } }
  );
  return documentData;
};

// --- UPLOAD PROFILE IMAGE ---
service.uploadProfileImage = async (userInfo, id, fileData) => {
  const staff = await StaffModel.findById(id);
  if (!staff) throw new Error("Staff not found");

  if (staff.profileImage?.filename) {
    try {
      await oracleService.deleteFile(staff.profileImage.filename);
    } catch (e) {}
  }

  const filePath = fileData.path;
  const ext = path.extname(fileData.filename) || ".jpg";
  const oracleFileName = `staff-profile-${id}-${Date.now()}${ext}`;

  const publicUrl = await oracleService.uploadFile(filePath, oracleFileName);

  try {
    fs.unlinkSync(filePath);
  } catch (e) {}

  const imageData = {
    url: publicUrl,
    publicId: oracleFileName,
    filename: oracleFileName,
  };

  await StaffModel.updateOne(
    { _id: id },
    { $set: { profileImage: imageData, updatedBy: userInfo._id } }
  );

  return imageData;
};

// --- DELETE DOCUMENT ---
service.deleteDocument = async (userInfo, id, documentType) => {
  const staff = await StaffModel.findById(id);
  const fieldMap = {
    Passport: "passportDocument",
    Visa: "visaDocument",
    "Emirates ID": "emiratesIdDocument",
  };
  const fieldName = fieldMap[documentType];

  if (staff[fieldName]?.filename) {
    await oracleService.deleteFile(staff[fieldName].filename);
  }
  return await StaffModel.updateOne(
    { _id: id },
    { $unset: { [fieldName]: 1 }, $set: { updatedBy: userInfo._id } }
  );
};

// --- GET EXPIRING DOCUMENTS ---
service.getExpiringDocuments = async () => {
  const twoMonthsFromNow = new Date();
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
  const today = new Date();

  const staff = await StaffModel.find({
    isDeleted: false,
    $or: [
      { passportExpiry: { $gte: today, $lte: twoMonthsFromNow } },
      { visaExpiry: { $gte: today, $lte: twoMonthsFromNow } },
      { emiratesIdExpiry: { $gte: today, $lte: twoMonthsFromNow } },
    ],
  }).lean();

  return staff.map((s) => ({
    _id: s._id,
    name: s.name,
    employeeCode: s.employeeCode,
    expiringDocs: [
      s.passportExpiry &&
      s.passportExpiry >= today &&
      s.passportExpiry <= twoMonthsFromNow
        ? "Passport"
        : null,
      s.visaExpiry && s.visaExpiry >= today && s.visaExpiry <= twoMonthsFromNow
        ? "Visa"
        : null,
      s.emiratesIdExpiry &&
      s.emiratesIdExpiry >= today &&
      s.emiratesIdExpiry <= twoMonthsFromNow
        ? "Emirates ID"
        : null,
    ].filter(Boolean),
  }));
};

// --- GENERATE TEMPLATE (Complete Fields) ---
service.generateTemplate = async () => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff Template");

  worksheet.columns = [
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Mobile", key: "mobile", width: 15 }, // ✅ Added
    { header: "Email", key: "email", width: 25 }, // ✅ Added
    { header: "Company", key: "companyName", width: 20 },
    { header: "Site", key: "site", width: 20 },
    { header: "Joining Date (YYYY-MM-DD)", key: "joiningDate", width: 20 },
    { header: "Passport Number", key: "passportNumber", width: 15 },
    {
      header: "Passport Expiry (YYYY-MM-DD)",
      key: "passportExpiry",
      width: 20,
    },
    { header: "Passport Document URL", key: "passportDocumentUrl", width: 50 },
    { header: "Visa Number", key: "visaNumber", width: 15 }, // ✅ Added
    { header: "Visa Expiry (YYYY-MM-DD)", key: "visaExpiry", width: 20 },
    { header: "Visa Document URL", key: "visaDocumentUrl", width: 50 },
    { header: "Emirates ID", key: "emiratesId", width: 20 },
    {
      header: "Emirates ID Expiry (YYYY-MM-DD)",
      key: "emiratesIdExpiry",
      width: 20,
    },
    {
      header: "Emirates ID Document URL",
      key: "emiratesIdDocumentUrl",
      width: 50,
    },
  ];
  return await workbook.xlsx.writeBuffer();
};

// --- EXPORT DATA (Complete Fields) ---
service.exportData = async (userInfo, query) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff");
  const staffData = await StaffModel.find({ isDeleted: false })
    .sort({ visaExpiry: 1 })
    .lean();

  worksheet.columns = [
    { header: "Employee Code", key: "employeeCode", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Mobile", key: "mobile", width: 15 }, // ✅ Added
    { header: "Email", key: "email", width: 25 }, // ✅ Added
    { header: "Company", key: "companyName", width: 20 },
    { header: "Site", key: "site", width: 20 },
    { header: "Joining Date", key: "joiningDate", width: 20 },
    { header: "Passport Number", key: "passportNumber", width: 15 },
    { header: "Passport Expiry", key: "passportExpiry", width: 20 },
    { header: "Visa Number", key: "visaNumber", width: 15 }, // ✅ Added
    { header: "Visa Expiry", key: "visaExpiry", width: 20 },
    { header: "Emirates ID", key: "emiratesId", width: 20 },
    { header: "Emirates ID Expiry", key: "emiratesIdExpiry", width: 20 },
  ];

  staffData.forEach((staff) => {
    worksheet.addRow({
      employeeCode: staff.employeeCode,
      name: staff.name,
      mobile: staff.mobile,
      email: staff.email,
      companyName: staff.companyName,
      site: typeof staff.site === "object" ? staff.site?.name : staff.site,
      joiningDate: staff.joiningDate,
      passportNumber: staff.passportNumber,
      passportExpiry: staff.passportExpiry,
      visaNumber: staff.visaNumber, // ✅ Added
      visaExpiry: staff.visaExpiry,
      emiratesId: staff.emiratesId,
      emiratesIdExpiry: staff.emiratesIdExpiry,
    });
  });
  return await workbook.xlsx.writeBuffer();
};

// --- IMPORT EXCEL ---
service.importDataFromExcel = async (userInfo, fileBuffer) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.getWorksheet(1);
  const excelData = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowData = {
      employeeCode: row.getCell(1).value?.toString() || "",
      name: row.getCell(2).value?.toString() || "",
      mobile: row.getCell(3).value?.toString() || "", // ✅ Added
      email: row.getCell(4).value?.toString() || "", // ✅ Added
      companyName: row.getCell(5).value?.toString() || "",
      site: row.getCell(6).value?.toString() || "",
      joiningDate: row.getCell(7).value,
      passportNumber: row.getCell(8).value?.toString() || "",
      passportExpiry: row.getCell(9).value,
      passportDocumentUrl: row.getCell(10).value?.toString() || "",
      visaNumber: row.getCell(11).value?.toString() || "", // ✅ Added
      visaExpiry: row.getCell(12).value,
      visaDocumentUrl: row.getCell(13).value?.toString() || "",
      emiratesId: row.getCell(14).value?.toString() || "",
      emiratesIdExpiry: row.getCell(15).value,
      emiratesIdDocumentUrl: row.getCell(16).value?.toString() || "",
    };
    excelData.push(rowData);
  });

  return await service.importDataWithOracle(userInfo, excelData);
};

// --- IMPORT LOGIC (Safe Date & Full Fields) ---
service.importDataWithOracle = async (userInfo, csvData) => {
  const results = { success: 0, errors: [] };

  for (const row of csvData) {
    try {
      let staff = null;

      // Smart Deduplication
      if (row.employeeCode?.trim()) {
        staff = await StaffModel.findOne({
          employeeCode: new RegExp(`^${row.employeeCode.trim()}$`, "i"),
          isDeleted: false,
        });
      }
      if (!staff && row.passportNumber?.trim()) {
        staff = await StaffModel.findOne({
          passportNumber: new RegExp(`^${row.passportNumber.trim()}$`, "i"),
          isDeleted: false,
        });
      }

      // Site Lookup (String or ID)
      let siteId = row.site;
      if (row.site) {
        const siteDoc = await SiteModel.findOne({
          name: { $regex: new RegExp(`^${row.site.trim()}$`, "i") },
        });
        if (siteDoc) {
          siteId = siteDoc._id;
        }
      }

      const staffData = {
        name: row.name,
        mobile: row.mobile, // ✅ Added
        email: row.email, // ✅ Added
        companyName: row.companyName,
        site: siteId,
        joiningDate: parseExcelDate(row.joiningDate), // ✅ Safe Date

        passportNumber: row.passportNumber,
        passportExpiry: parseExcelDate(row.passportExpiry),

        visaNumber: row.visaNumber, // ✅ Added
        visaExpiry: parseExcelDate(row.visaExpiry),

        emiratesId: row.emiratesId,
        emiratesIdExpiry: parseExcelDate(row.emiratesIdExpiry),

        updatedBy: userInfo._id,
      };

      if (row.passportDocumentUrl?.startsWith("http")) {
        staffData.passportDocument = await service._uploadFromUrl(
          row.passportDocumentUrl,
          staff?._id || "temp",
          "passport"
        );
      }
      // You can replicate logic for Visa URL / EID URL if needed

      if (staff) {
        await StaffModel.updateOne({ _id: staff._id }, { $set: staffData });
      } else {
        const id = await CounterService.id("staff");
        staffData.id = id;
        staffData.createdBy = userInfo._id;
        if (row.employeeCode) staffData.employeeCode = row.employeeCode;
        await new StaffModel(staffData).save();
      }
      results.success++;
    } catch (error) {
      console.error("Import row failed:", error);
      results.errors.push({ row, error: error.message });
    }
  }
  return results;
};

service._uploadFromUrl = async (url, staffId, docType) => {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data, "binary");
    const tempDir = path.join(__dirname, "../../../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ext = path.extname(url).split("?")[0] || ".pdf";
    const tempPath = path.join(tempDir, `${Date.now()}-${docType}${ext}`);
    fs.writeFileSync(tempPath, buffer);
    const oracleFileName = `staff-${staffId}-${docType}-${Date.now()}${ext}`;
    const publicUrl = await oracleService.uploadFile(tempPath, oracleFileName);
    fs.unlinkSync(tempPath);
    return {
      url: publicUrl,
      publicId: oracleFileName,
      filename: oracleFileName,
      uploadedAt: new Date(),
    };
  } catch (error) {
    return null;
  }
};
