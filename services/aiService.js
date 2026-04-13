import { AI_SYSTEM_PROMPT } from "./aiContext.js";

const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_URL =
  String(process.env.GEMINI_URL || "").trim() ||
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);

const buildGeminiHeaders = () => ({
  "Content-Type": "application/json",
  "x-goog-api-key": GEMINI_API_KEY,
});

const requestWithTimeout = async ({
  url,
  method = "GET",
  body,
  headers,
  timeoutMs,
}) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const requestGemini = async ({
  body,
  timeoutMs = GEMINI_TIMEOUT_MS,
  url = GEMINI_URL,
}) => {
  return requestWithTimeout({
    url,
    method: "POST",
    body,
    timeoutMs,
    headers: buildGeminiHeaders(),
  });
};

const buildGeminiRequestBody = (prompt) => ({
  systemInstruction: {
    parts: [{ text: AI_SYSTEM_PROMPT.trim() }],
  },
  contents: [
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ],
  generationConfig: {
    temperature: 0.1,
  },
});

const extractGeminiReplyText = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const formatProviderErrorBody = (text) => {
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || text;
  } catch (_) {
    return text;
  }
};

const assertGeminiConfiguration = () => {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Set GEMINI_API_KEY in backend env.",
    );
  }
};

export async function askAI(prompt) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new TypeError("Prompt must be a non-empty string.");
  }

  const normalizedPrompt = prompt.trim();

  assertGeminiConfiguration();

  try {
    const response = await requestGemini({
      body: JSON.stringify(buildGeminiRequestBody(normalizedPrompt)),
    });

    if (!response.ok) {
      const rawErrorBody = await safeReadText(response);
      const errorBody = formatProviderErrorBody(rawErrorBody);

      throw new Error(
        `Gemini request failed with status ${response.status}${errorBody ? `: ${errorBody}` : ""}`,
      );
    }

    const data = await response.json();
    const reply = extractGeminiReplyText(data);

    if (!reply) {
      throw new Error("Gemini returned an empty response.");
    }

    return reply;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Gemini request timed out after ${GEMINI_TIMEOUT_MS}ms.`);
    }

    const causeCode = error?.cause?.code;
    if (
      error instanceof TypeError ||
      ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"].includes(
        causeCode,
      )
    ) {
      throw new Error(
        "Unable to reach Gemini API. Verify internet access and GEMINI_API_KEY.",
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
