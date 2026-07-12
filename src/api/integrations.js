// File upload + LLM calls against the Express server (server/routes/integrations.js).
import { post, authHeaders, API_BASE } from "./http";

/** Upload a file; returns { file_url }. */
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/integrations/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || "Upload failed");
  }
  return res.json();
}

/** Ask the LLM; returns the response text string. */
export async function invokeLLM(prompt) {
  const { text } = await post("/integrations/llm", { prompt });
  return text;
}
