const common = require("oci-common");
const objectstorage = require("oci-objectstorage");
const fs = require("fs");

// Load private key
const privateKey = fs.readFileSync("oci_private_key.pem", "utf8");

// Create auth provider
const provider = new common.SimpleAuthenticationDetailsProvider(
  process.env.OCI_TENANCY_OCID,
  process.env.OCI_USER_OCID,
  process.env.OCI_FINGERPRINT,
  privateKey,
  null
);

// Create client
const client = new objectstorage.ObjectStorageClient({
  authenticationDetailsProvider: provider,
});

// ✅ Set region properly
client.region = common.Region.fromRegionId("ap-hyderabad-1");

module.exports = client;
