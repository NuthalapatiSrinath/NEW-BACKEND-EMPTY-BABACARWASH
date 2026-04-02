import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_DIR = path.resolve(__dirname, "../src/server/api/models");

const aliasToModel = new Map();
let loaded = false;

export const normalizeCollectionName = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const registerAlias = (alias, model) => {
  const normalized = normalizeCollectionName(alias);
  if (!normalized || !model) return;

  if (!aliasToModel.has(normalized)) {
    aliasToModel.set(normalized, model);
  }
};

const loadModels = () => {
  if (loaded) return;

  const files = fs
    .readdirSync(MODELS_DIR)
    .filter((name) => name.endsWith(".model.js"));

  for (const fileName of files) {
    const modelPath = path.join(MODELS_DIR, fileName);

    try {
      const model = require(modelPath);
      if (!model || !model.schema) continue;

      const baseName = fileName.replace(/\.model\.js$/i, "");
      const collectionName =
        model.collection?.collectionName || model.modelName;

      registerAlias(baseName, model);
      registerAlias(model.modelName, model);
      registerAlias(collectionName, model);
    } catch (error) {
      console.warn(`Skipping model file ${fileName}:`, error.message);
    }
  }

  loaded = true;
};

const getUniqueModels = () => {
  loadModels();

  const unique = [];
  const seen = new Set();

  for (const model of aliasToModel.values()) {
    const identity = model.modelName || model.collection?.collectionName;
    if (!identity || seen.has(identity)) continue;

    seen.add(identity);
    unique.push(model);
  }

  return unique;
};

const getSchemaRef = (schemaType) => {
  if (!schemaType) return null;

  if (schemaType.options?.ref) return schemaType.options.ref;
  if (schemaType.caster?.options?.ref) return schemaType.caster.options.ref;
  if (schemaType.$embeddedSchemaType?.options?.ref) {
    return schemaType.$embeddedSchemaType.options.ref;
  }

  return null;
};

const toCollectionName = (refName) => {
  const related = resolveModelByCollection(refName);
  return related?.collection?.collectionName || String(refName || "");
};

export const getModelRelations = (model) => {
  const relationMap = new Map();

  for (const [pathName, schemaType] of Object.entries(
    model.schema.paths || {},
  )) {
    if (pathName === "__v") continue;

    const refName = getSchemaRef(schemaType);
    if (!refName) continue;

    const relatedCollection = toCollectionName(refName);
    const relationKey = `${pathName}::${relatedCollection}`;
    if (relationMap.has(relationKey)) continue;

    relationMap.set(relationKey, {
      path: pathName,
      ref: String(refName),
      collection: relatedCollection,
      collectionKey: normalizeCollectionName(relatedCollection),
      aliases: [
        normalizeCollectionName(relatedCollection),
        normalizeCollectionName(refName),
      ].filter(Boolean),
    });
  }

  return Array.from(relationMap.values());
};

const getBasicFields = (model) => {
  const schemaObj = model.schema?.obj || {};
  const fromSchemaObj = Object.keys(schemaObj).filter((key) => key !== "__v");

  if (fromSchemaObj.length > 0) {
    return fromSchemaObj.slice(0, 25);
  }

  const fallback = Object.keys(model.schema?.paths || {})
    .map((key) => key.split(".")[0])
    .filter((key) => key && key !== "__v");

  return Array.from(new Set(fallback)).slice(0, 25);
};

export const getCollectionMetadata = () => {
  const models = getUniqueModels();

  return models
    .map((model) => ({
      collection: model.collection?.collectionName || model.modelName,
      modelName: model.modelName,
      fields: getBasicFields(model),
      relations: getModelRelations(model).map((relation) => ({
        field: relation.path,
        collection: relation.collection,
      })),
    }))
    .sort((a, b) => a.collection.localeCompare(b.collection));
};

export const resolveModelByCollection = (collection) => {
  loadModels();
  return aliasToModel.get(normalizeCollectionName(collection)) || null;
};

export const getAllCollections = () =>
  getCollectionMetadata().map((item) => item.collection);
