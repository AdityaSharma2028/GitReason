const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const HF_API = "https://router.huggingface.co/hf-inference/v1/chat/completions";

export async function llmComplete(prompt, { system, format, signal, apiKey } = {}) {
  const provider = process.env.LLM_PROVIDER || (process.env.HF_TOKEN ? "huggingface" : "gemini");

  if (provider === "huggingface") {
    const key = apiKey || process.env.HF_TOKEN;
    if (!key) {
      throw new Error("HF_TOKEN is not set. Get a free token at huggingface.co/settings/tokens and add it to server/.env.");
    }
    const model = process.env.HF_MODEL || "Qwen/Qwen2.5-Coder-32B-Instruct";

    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const body = {
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2048,
    };
    if (format === "json") {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(HF_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("rate_limited");
      const errText = await res.text();
      throw new Error(`Hugging Face API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Hugging Face model returned no text.");
    return text;
  }

  // Default Gemini provider
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Add it to server/.env.");
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (format === "json") body.generationConfig = { responseMimeType: "application/json" };

  const res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("rate_limited");
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (!text) throw new Error("Gemini returned no text (check finishReason / safety block).");
  return text;
}

// Validation helper for key settings
export async function validateGeminiKey(apiKey) {
  try {
    const res = await fetch(`${GEMINI_API}/models?pageSize=1`, {
      headers: { "x-goog-api-key": apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}
