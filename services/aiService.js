import { AI_SYSTEM_PROMPT } from "./aiContext.js";

const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const resolveOllamaUrl = () => {
  const explicit = String(process.env.OLLAMA_URL || "").trim();
  if (explicit) return explicit;

  const base = normalizeBaseUrl(
    process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  );
  return `${base}/api/chat`;
};

const OLLAMA_URL = resolveOllamaUrl();
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);
const OLLAMA_AUTO_PULL = !["0", "false", "no", "off"].includes(
  String(process.env.OLLAMA_AUTO_PULL || "true")
    .trim()
    .toLowerCase(),
);
const OLLAMA_PULL_TIMEOUT_MS = Number(
  process.env.OLLAMA_PULL_TIMEOUT_MS || 1800000,
);
const OLLAMA_API_KEY = String(process.env.OLLAMA_API_KEY || "").trim();
const OLLAMA_AUTH_HEADER =
  String(process.env.OLLAMA_AUTH_HEADER || "Authorization").trim() ||
  "Authorization";
const OLLAMA_AUTH_SCHEME = String(
  process.env.OLLAMA_AUTH_SCHEME || "Bearer",
).trim();

const resolveApiUrl = (pathName) => {
  try {
    const url = new URL(OLLAMA_URL);
    url.pathname = pathName;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (_) {
    const fallbackBase = normalizeBaseUrl(
      OLLAMA_URL.replace(/\/api\/(chat|generate).*$/i, ""),
    );
    return `${fallbackBase}${pathName}`;
  }
};

const OLLAMA_TAGS_URL = resolveApiUrl("/api/tags");
const OLLAMA_PULL_URL = resolveApiUrl("/api/pull");
let ongoingModelPullPromise = null;

const buildHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (!OLLAMA_API_KEY) {
    return headers;
  }

  if (OLLAMA_AUTH_HEADER.toLowerCase() === "authorization") {
    headers.Authorization = OLLAMA_AUTH_SCHEME
      ? `${OLLAMA_AUTH_SCHEME} ${OLLAMA_API_KEY}`
      : OLLAMA_API_KEY;

    return headers;
  }

  headers[OLLAMA_AUTH_HEADER] = OLLAMA_API_KEY;
  return headers;
};

const requestOllama = async ({
  url,
  method = "GET",
  body,
  timeoutMs = OLLAMA_TIMEOUT_MS,
}) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method,
      headers: buildHeaders(),
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const modelBaseName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .split(":")[0];

const hasRequestedModel = (payload) => {
  const models = Array.isArray(payload?.models) ? payload.models : [];
  const targetModel = modelBaseName(OLLAMA_MODEL);

  return models.some((entry) => {
    const name =
      typeof entry === "string"
        ? entry
        : entry?.name || entry?.model || entry?.tag || "";

    return modelBaseName(name) === targetModel;
  });
};

const isModelMissingError = (statusCode, responseText = "") => {
  const text = String(responseText || "").toLowerCase();

  if (statusCode === 404 && text.includes("model")) {
    return true;
  }

  return (
    text.includes("model") &&
    (text.includes("not found") ||
      text.includes("not installed") ||
      text.includes("pull"))
  );
};

const ensureModelAvailable = async () => {
  if (!OLLAMA_AUTO_PULL) return;

  if (ongoingModelPullPromise) {
    await ongoingModelPullPromise;
    return;
  }

  ongoingModelPullPromise = (async () => {
    try {
      const tagsResponse = await requestOllama({
        url: OLLAMA_TAGS_URL,
        method: "GET",
        timeoutMs: Math.min(OLLAMA_TIMEOUT_MS, 30000),
      });

      if (tagsResponse.ok) {
        const tagsPayload = await tagsResponse.json();
        if (hasRequestedModel(tagsPayload)) {
          return;
        }
      }
    } catch (_) {
      // Ignore pre-check errors and attempt pull directly.
    }

    try {
      const pullResponse = await requestOllama({
        url: OLLAMA_PULL_URL,
        method: "POST",
        body: JSON.stringify({
          name: OLLAMA_MODEL,
          stream: false,
        }),
        timeoutMs: OLLAMA_PULL_TIMEOUT_MS,
      });

      if (!pullResponse.ok) {
        const pullErrorBody = await safeReadText(pullResponse);
        throw new Error(
          `Failed to auto-pull Ollama model "${OLLAMA_MODEL}" (status ${pullResponse.status}${pullErrorBody ? `: ${pullErrorBody}` : ""}).`,
        );
      }

      await safeReadText(pullResponse);
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error(
          `Auto-pull timed out after ${OLLAMA_PULL_TIMEOUT_MS}ms while downloading model "${OLLAMA_MODEL}".`,
        );
      }

      throw error;
    }
  })().finally(() => {
    ongoingModelPullPromise = null;
  });

  await ongoingModelPullPromise;
};

const buildRequestBody = (prompt) => {
  const isChatApi = OLLAMA_URL.includes("/api/chat");

  if (isChatApi) {
    return {
      model: OLLAMA_MODEL,
      stream: false,
      options: {
        temperature: 0.1,
      },
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT.trim() },
        { role: "user", content: prompt },
      ],
    };
  }

  return {
    model: OLLAMA_MODEL,
    prompt: `${AI_SYSTEM_PROMPT.trim()}\n\nUser Query: ${prompt}`,
    stream: false,
  };
};

const extractReplyText = (payload) => {
  if (typeof payload?.message?.content === "string") {
    return payload.message.content.trim();
  }

  if (typeof payload?.response === "string") {
    return payload.response.trim();
  }

  return "";
};

export async function askAI(prompt) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new TypeError("Prompt must be a non-empty string.");
  }

  const normalizedPrompt = prompt.trim();

  try {
    let response = await requestOllama({
      url: OLLAMA_URL,
      method: "POST",
      body: JSON.stringify(buildRequestBody(normalizedPrompt)),
    });

    let errorBody = response.ok ? "" : await safeReadText(response);

    if (
      !response.ok &&
      isModelMissingError(response.status, errorBody) &&
      OLLAMA_AUTO_PULL
    ) {
      await ensureModelAvailable();

      response = await requestOllama({
        url: OLLAMA_URL,
        method: "POST",
        body: JSON.stringify(buildRequestBody(normalizedPrompt)),
      });

      errorBody = response.ok ? "" : await safeReadText(response);
    }

    if (!response.ok) {
      if (isModelMissingError(response.status, errorBody)) {
        throw new Error(
          `Ollama model "${OLLAMA_MODEL}" is not installed. Set OLLAMA_AUTO_PULL=true or pull model manually.`,
        );
      }

      throw new Error(
        `Ollama request failed with status ${response.status}${errorBody ? `: ${errorBody}` : ""}`,
      );
    }

    const data = await response.json();
    const reply = extractReplyText(data);

    if (!reply) {
      throw new Error("Ollama returned an empty response.");
    }

    return reply;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Ollama request timed out after ${OLLAMA_TIMEOUT_MS}ms.`);
    }

    const causeCode = error?.cause?.code;
    if (
      error instanceof TypeError ||
      ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"].includes(
        causeCode,
      )
    ) {
      throw new Error(
        `Unable to reach Ollama at ${OLLAMA_URL}. Verify backend env (OLLAMA_URL/OLLAMA_BASE_URL) and that the Coolify Ollama app is running.`,
      );
    }

    throw error;
  }
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch (_) {
    return "";
  }
}
