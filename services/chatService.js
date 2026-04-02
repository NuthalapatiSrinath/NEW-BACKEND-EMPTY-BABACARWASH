import {
  getModelRelations,
  normalizeCollectionName,
  resolveModelByCollection,
} from "./modelRegistry.js";

const DEFAULT_LIMIT = Number(process.env.AI_QUERY_DEFAULT_LIMIT || 25);
const MAX_LIMIT = Number(process.env.AI_QUERY_MAX_LIMIT || 200);
const MAX_RELATED_DOCS = Number(process.env.AI_QUERY_RELATION_LIMIT || 500);

const BLOCKED_OPERATORS = new Set([
  "$where",
  "$function",
  "$accumulator",
  "$out",
  "$merge",
]);

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clampLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(parsed), MAX_LIMIT);
};

const clampPage = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.trunc(parsed);
};

const sanitizeObject = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const safe = {};
  for (const [key, innerValue] of Object.entries(value)) {
    if (BLOCKED_OPERATORS.has(key)) {
      throw new Error(`Invalid or unsafe operator used in filters: ${key}`);
    }

    safe[key] = sanitizeObject(innerValue);
  }

  return safe;
};

const buildProjection = (fields) => {
  if (Array.isArray(fields)) {
    return fields
      .map((field) => String(field || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  if (typeof fields === "string" && fields.trim()) {
    return fields.trim();
  }

  return null;
};

const getRequestedRelationKeys = (relations) => {
  if (!Array.isArray(relations)) return new Set();

  return new Set(
    relations
      .map((relation) => normalizeCollectionName(relation))
      .filter(Boolean),
  );
};

const getPopulateDescriptors = (model, requestedRelationKeys) => {
  if (!requestedRelationKeys.size) return [];

  return getModelRelations(model).filter((relation) =>
    relation.aliases.some((alias) => requestedRelationKeys.has(alias)),
  );
};

const buildIdCandidates = (records) => {
  const values = [];

  for (const record of records) {
    if (!record || !record._id) continue;

    values.push(record._id);
    values.push(String(record._id));
  }

  return Array.from(new Set(values));
};

const getReverseRelationDescriptor = (baseModel, relatedModel) => {
  const baseCollectionKey = normalizeCollectionName(
    baseModel.collection?.collectionName || baseModel.modelName,
  );

  return (
    getModelRelations(relatedModel).find(
      (relation) =>
        relation.collectionKey === baseCollectionKey ||
        relation.aliases.includes(baseCollectionKey),
    ) || null
  );
};

const attachReverseRelations = async ({
  baseModel,
  records,
  requestedRelationKeys,
  alreadyResolvedRelationKeys,
}) => {
  if (!requestedRelationKeys.size || !records.length) {
    return [];
  }

  const unresolvedRelationKeys = Array.from(requestedRelationKeys).filter(
    (key) => !alreadyResolvedRelationKeys.has(key),
  );

  if (!unresolvedRelationKeys.length) {
    return [];
  }

  const idCandidates = buildIdCandidates(records);
  if (!idCandidates.length) {
    return [];
  }

  const resolvedReverseRelations = [];

  for (const relationKey of unresolvedRelationKeys) {
    const relatedModel = resolveModelByCollection(relationKey);
    if (!relatedModel) continue;

    const reverseRelation = getReverseRelationDescriptor(
      baseModel,
      relatedModel,
    );
    if (!reverseRelation) continue;

    const relatedCollectionName =
      relatedModel.collection?.collectionName || relatedModel.modelName;

    const relatedDocs = await relatedModel
      .find({ [reverseRelation.path]: { $in: idCandidates } })
      .limit(MAX_RELATED_DOCS)
      .lean();

    const grouped = new Map();
    for (const doc of relatedDocs) {
      const foreignValue = doc?.[reverseRelation.path];
      const bucket = Array.isArray(foreignValue)
        ? foreignValue
        : [foreignValue];

      for (const value of bucket) {
        if (!value) continue;

        const groupKey = String(value);
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, []);
        }
        grouped.get(groupKey).push(doc);
      }
    }

    for (const record of records) {
      const recordKey = record && record._id ? String(record._id) : "";
      if (!recordKey) continue;

      if (!record.related || typeof record.related !== "object") {
        record.related = {};
      }

      record.related[relatedCollectionName] = grouped.get(recordKey) || [];
    }

    resolvedReverseRelations.push(relatedCollectionName);
  }

  return resolvedReverseRelations;
};

const executeFindQuery = async ({
  model,
  filters,
  projection,
  sort,
  limit,
  page,
  populateDescriptors,
  requestedRelationKeys,
}) => {
  const skip = (page - 1) * limit;
  let query = model.find(filters);

  if (projection) {
    query = query.select(projection);
  }

  if (isPlainObject(sort) && Object.keys(sort).length > 0) {
    query = query.sort(sort);
  } else {
    query = query.sort({ createdAt: -1 });
  }

  for (const relation of populateDescriptors) {
    query = query.populate(relation.path);
  }

  const [records, totalMatched] = await Promise.all([
    query.skip(skip).limit(limit).lean(),
    model.countDocuments(filters),
  ]);

  const totalPages = totalMatched > 0 ? Math.ceil(totalMatched / limit) : 1;
  const directRelationKeys = new Set(
    populateDescriptors.map((item) => item.collectionKey),
  );

  const reverseRelations = await attachReverseRelations({
    baseModel: model,
    records,
    requestedRelationKeys,
    alreadyResolvedRelationKeys: directRelationKeys,
  });

  const populatedRelations = Array.from(
    new Set([
      ...populateDescriptors.map((item) => item.collection),
      ...reverseRelations,
    ]),
  );

  return {
    count: records.length,
    totalMatched,
    results: records,
    populatedRelations,
    pagination: {
      page,
      limit,
      totalMatched,
      totalPages,
      hasMore: page < totalPages,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    },
  };
};

const executeAggregateQuery = async ({
  model,
  filters,
  limit,
  page,
  populateDescriptors,
}) => {
  const skip = (page - 1) * limit;
  const rawPipeline = Array.isArray(filters?.pipeline)
    ? filters.pipeline
    : [{ $match: filters }];

  const pipeline = sanitizeObject(rawPipeline);

  for (const relation of populateDescriptors) {
    if (relation.path.includes(".")) continue;

    pipeline.push({
      $lookup: {
        from: relation.collection,
        localField: relation.path,
        foreignField: "_id",
        as: relation.path,
      },
    });
  }

  const pagedPipeline = [...pipeline, { $skip: skip }, { $limit: limit }];

  const [records, totalResult] = await Promise.all([
    model.aggregate(pagedPipeline).allowDiskUse(true),
    model.aggregate([...pipeline, { $count: "total" }]).allowDiskUse(true),
  ]);

  const totalMatched = Number(totalResult?.[0]?.total || 0);
  const totalPages = totalMatched > 0 ? Math.ceil(totalMatched / limit) : 1;

  return {
    count: records.length,
    totalMatched,
    results: records,
    populatedRelations: populateDescriptors.map((item) => item.collection),
    pagination: {
      page,
      limit,
      totalMatched,
      totalPages,
      hasMore: page < totalPages,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    },
  };
};

export const runDynamicQuery = async (instruction = {}) => {
  if (!isPlainObject(instruction)) {
    throw new Error("Invalid AI db payload: expected JSON object");
  }

  const mode = String(instruction.mode || "").toLowerCase();
  if (mode !== "db") {
    throw new Error("Invalid AI db payload: mode must be 'db'");
  }

  const action = String(instruction.action || "find").toLowerCase();
  const supportedActions = new Set(["find", "filter", "aggregate"]);
  if (!supportedActions.has(action)) {
    throw new Error(`Unknown action: ${action}`);
  }

  const model = resolveModelByCollection(instruction.collection);
  if (!model) {
    throw new Error(`Unsupported collection: ${instruction.collection}`);
  }

  const safeFilters = sanitizeObject(
    isPlainObject(instruction.filters) || Array.isArray(instruction.filters)
      ? instruction.filters
      : {},
  );

  const projection = buildProjection(
    instruction.fields || instruction.projection,
  );
  const limit = clampLimit(instruction.limit);
  const page = clampPage(instruction.page);
  const requestedRelationKeys = getRequestedRelationKeys(instruction.relations);
  const populateDescriptors = getPopulateDescriptors(
    model,
    requestedRelationKeys,
  );

  let execution;
  if (action === "aggregate") {
    execution = await executeAggregateQuery({
      model,
      filters: safeFilters,
      limit,
      page,
      populateDescriptors,
    });
  } else {
    execution = await executeFindQuery({
      model,
      filters: isPlainObject(safeFilters) ? safeFilters : {},
      projection,
      sort: instruction.sort,
      limit,
      page,
      populateDescriptors,
      requestedRelationKeys,
    });
  }

  return {
    mode: "db",
    collection:
      model.collection?.collectionName || String(instruction.collection),
    action,
    page,
    limit,
    filters: isPlainObject(safeFilters) ? safeFilters : {},
    relations: instruction.relations || [],
    ...execution,
  };
};
