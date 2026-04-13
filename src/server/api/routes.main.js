module.exports = (app) => {
  const aiServiceModulePromise = import("../../../services/aiService.js");
  const chatServiceModulePromise = import("../../../services/chatService.js");

  const parseAiJsonPayload = (rawReply) => {
    if (typeof rawReply !== "string") return null;

    const cleanPlaceholderValues = (input) => {
      if (Array.isArray(input)) {
        const cleanedArray = input
          .map((item) => cleanPlaceholderValues(item))
          .filter((item) => item !== undefined);

        return cleanedArray.length ? cleanedArray : undefined;
      }

      if (!input || typeof input !== "object") {
        if (typeof input === "string" && /^__.*__$/.test(input.trim())) {
          return undefined;
        }
        return input;
      }

      const cleanedObject = {};
      for (const [key, innerValue] of Object.entries(input)) {
        const cleanedValue = cleanPlaceholderValues(innerValue);
        if (cleanedValue === undefined) continue;
        cleanedObject[key] = cleanedValue;
      }

      return Object.keys(cleanedObject).length ? cleanedObject : undefined;
    };

    const normalizeDbPayload = (payload) => {
      if (!payload || typeof payload !== "object") return payload;
      if (String(payload.mode || "").toLowerCase() !== "db") return payload;

      const cleanedFilters = cleanPlaceholderValues(payload.filters);
      return {
        ...payload,
        filters:
          cleanedFilters && typeof cleanedFilters === "object"
            ? cleanedFilters
            : {},
      };
    };

    const normalizeJsonCandidate = (input) => {
      let normalized = String(input || "").trim();

      // Remove common markdown wrappers if present.
      normalized = normalized
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      // Replace common non-JSON function tokens from LLM output.
      normalized = normalized
        .replace(/ObjectId\(\s*"([^"]+)"\s*\)/g, '"$1"')
        .replace(/ObjectId\(\s*'([^']+)'\s*\)/g, '"$1"')
        .replace(/new\s+Date\(\s*"([^"]+)"\s*\)/gi, '"$1"')
        .replace(/new\s+Date\(\s*'([^']+)'\s*\)/gi, '"$1"')
        .replace(/new\s+Date\(\s*\)/gi, '"__NOW__"')
        .replace(/ISODate\(\s*"([^"]*)"\s*\)/gi, '"$1"')
        .replace(/ISODate\(\s*'([^']*)'\s*\)/gi, '"$1"')
        .replace(/ISODate\(\s*\)/gi, '"__NOW__"');

      // Drop chained JS date-method calls to keep JSON valid.
      // Important: remove getter methods first to avoid nested setter parse issues.
      normalized = normalized
        .replace(
          /\.(getFullYear|getMonth|getDate|getHours|getMinutes|getSeconds|toISOString)\(\)/g,
          "",
        )
        .replace(
          /\.(setMonth|setYear|setDate|setHours|setMinutes|setSeconds)\([^)]*\)/g,
          "",
        )
        .replace(
          /"__NOW__"(?:\.[A-Za-z_][A-Za-z0-9_]*\([^)]*\))+/g,
          '"__NOW__"',
        );

      // Remove dangling commas before closing braces/brackets.
      normalized = normalized.replace(/,\s*([}\]])/g, "$1");

      return normalized;
    };

    const parseLooseRelations = (value) => {
      const sectionMatch = value.match(/"relations"\s*:\s*\[([^\]]*)\]/i);
      if (!sectionMatch) return [];

      return Array.from(
        sectionMatch[1].matchAll(/"([^"]+)"/g),
        (match) => match[1],
      ).filter(Boolean);
    };

    const parseLooseFilters = (value) => {
      const filtersIndex = value.search(/"filters"\s*:/i);
      if (filtersIndex < 0) return {};

      const afterColon = value.slice(filtersIndex).replace(/^.*?:/, "").trim();
      if (!afterColon.startsWith("{")) return {};

      let depth = 0;
      let endIndex = -1;
      for (let index = 0; index < afterColon.length; index += 1) {
        const char = afterColon[index];
        if (char === "{") depth += 1;
        if (char === "}") {
          depth -= 1;
          if (depth === 0) {
            endIndex = index;
            break;
          }
        }
      }

      if (endIndex < 0) return {};

      const candidate = afterColon.slice(0, endIndex + 1);
      try {
        const parsed = JSON.parse(normalizeJsonCandidate(candidate));
        const cleaned = cleanPlaceholderValues(parsed);
        return cleaned && typeof cleaned === "object" ? cleaned : {};
      } catch (_) {
        return {};
      }
    };

    const parseLooseDbPayload = (value) => {
      const normalized = normalizeJsonCandidate(value);
      const modeMatch = normalized.match(/"mode"\s*:\s*"(db|general)"/i);
      if (!modeMatch || modeMatch[1].toLowerCase() !== "db") return null;

      const collectionMatch = normalized.match(
        /"collection"\s*:\s*"([a-zA-Z0-9_-]+)"/i,
      );
      if (!collectionMatch || !collectionMatch[1]) return null;

      const actionMatch = normalized.match(
        /"action"\s*:\s*"(find|filter|aggregate)"/i,
      );
      const limitMatch = normalized.match(/"limit"\s*:\s*(\d+)/i);

      return {
        mode: "db",
        collection: collectionMatch[1],
        action: actionMatch ? actionMatch[1].toLowerCase() : "find",
        filters: parseLooseFilters(normalized),
        relations: parseLooseRelations(normalized),
        limit: limitMatch ? Number(limitMatch[1]) : 25,
        sort: { createdAt: -1 },
      };
    };

    const trimmed = rawReply.trim();
    const candidates = [trimmed];

    const fencedJsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedJsonMatch && fencedJsonMatch[1]) {
      candidates.push(fencedJsonMatch[1].trim());
    }

    const firstBraceIndex = trimmed.indexOf("{");
    const lastBraceIndex = trimmed.lastIndexOf("}");
    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      candidates.push(trimmed.slice(firstBraceIndex, lastBraceIndex + 1));
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(normalizeJsonCandidate(candidate));
        if (parsed && typeof parsed === "object") {
          return normalizeDbPayload(parsed);
        }
      } catch (_) {
        // Try next candidate.
      }
    }

    return normalizeDbPayload(parseLooseDbPayload(trimmed));
  };

  const isDbIntent = (payload) =>
    Boolean(payload) &&
    String(payload.mode || "").toLowerCase() === "db" &&
    Boolean(payload.collection);

  const buildDbResponse = (queryPayload, dbResult) => ({
    mode: "db",
    query: queryPayload,
    data: dbResult,
    reply: JSON.stringify(dbResult, null, 2),
  });

  const handleAiChat = async (req, res) => {
    try {
      const { prompt } = req.body || {};

      if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({
          statusCode: 400,
          message: "prompt is required and must be a non-empty string",
        });
      }

      const { askAI } = await aiServiceModulePromise;
      const aiReply = await askAI(prompt.trim());
      const aiPayload = parseAiJsonPayload(aiReply);

      if (isDbIntent(aiPayload)) {
        const { runDynamicQuery } = await chatServiceModulePromise;
        const dbResult = await runDynamicQuery(aiPayload);

        return res.status(200).json(buildDbResponse(aiPayload, dbResult));
      }

      return res.status(200).json({
        mode: "general",
        reply: aiReply,
      });
    } catch (error) {
      console.error("AI chat route error:", error);

      const errorMessage = error && error.message ? error.message : "";

      if (
        errorMessage.includes("Unsupported collection") ||
        errorMessage.includes("Invalid AI db payload") ||
        errorMessage.includes("Unknown action") ||
        errorMessage.includes("Invalid or unsafe")
      ) {
        return res.status(400).json({
          statusCode: 400,
          message: errorMessage,
        });
      }

      if (errorMessage.includes("timed out")) {
        return res.status(504).json({
          statusCode: 504,
          message: "AI provider request timed out",
        });
      }

      if (errorMessage.includes("not installed")) {
        return res.status(502).json({
          statusCode: 502,
          message: errorMessage,
        });
      }

      if (
        errorMessage.includes("request failed") ||
        errorMessage.includes("Unable to reach") ||
        errorMessage.includes("GEMINI_API_KEY")
      ) {
        return res.status(502).json({
          statusCode: 502,
          message: errorMessage,
        });
      }

      return res.status(500).json({
        statusCode: 500,
        message: "Failed to get response from AI provider",
      });
    }
  };

  const handleDbQuery = async (req, res) => {
    try {
      const { query } = req.body || {};

      if (!query || typeof query !== "object") {
        return res.status(400).json({
          statusCode: 400,
          message: "query is required and must be an object",
        });
      }

      const dbQuery = {
        ...query,
        mode: "db",
      };

      if (!isDbIntent(dbQuery)) {
        return res.status(400).json({
          statusCode: 400,
          message: "query must include a valid db collection",
        });
      }

      const { runDynamicQuery } = await chatServiceModulePromise;
      const dbResult = await runDynamicQuery(dbQuery);

      return res.status(200).json(buildDbResponse(dbQuery, dbResult));
    } catch (error) {
      console.error("AI db query route error:", error);

      const errorMessage = error && error.message ? error.message : "";

      if (
        errorMessage.includes("Unsupported collection") ||
        errorMessage.includes("Invalid AI db payload") ||
        errorMessage.includes("Unknown action") ||
        errorMessage.includes("Invalid or unsafe")
      ) {
        return res.status(400).json({
          statusCode: 400,
          message: errorMessage,
        });
      }

      return res.status(500).json({
        statusCode: 500,
        message: "Failed to execute dynamic query",
      });
    }
  };

  app.use("/api", require("./controllers"));
  app.use("/api/customer", require("./customer"));
  app.use("/api/staff", require("./staff"));

  app.post("/chat", handleAiChat);
  app.post("/api/chat", handleAiChat);
  app.post("/chat/query", handleDbQuery);
  app.post("/api/chat/query", handleDbQuery);

  app.route("/heartbeat").get(function (req, res) {
    res.status(200).json({
      statusCode: 200,
      message: "Server is running successfully!",
    });
  });
};
