const fs = require("fs");
const client = require("./client");

const NAMESPACE = "axkmn73bvebv";
const BUCKET = "bcw-file-storage";

async function uploadFile(filePath, fileName) {
  const stream = fs.createReadStream(filePath);

  await client.putObject({
    namespaceName: NAMESPACE,
    bucketName: BUCKET,
    objectName: fileName,
    putObjectBody: stream,
  });

  return `https://objectstorage.ap-hyderabad-1.oraclecloud.com/n/${NAMESPACE}/b/${BUCKET}/o/${fileName}`;
}

module.exports = { uploadFile };
