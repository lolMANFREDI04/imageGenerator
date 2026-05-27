const BASE = "";

async function jsonFetch(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) {
    let detail;
    try { detail = (await r.json()).detail; } catch { detail = r.statusText; }
    throw new Error(detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export const api = {
  getSettings: () => jsonFetch("/api/settings"),
  updateSettings: (data) =>
    jsonFetch("/api/settings", { method: "POST", body: JSON.stringify({ data }) }),

  ollamaModels: () => jsonFetch("/api/ollama/models"),
  rewritePrompt: (prompt, uncensored) =>
    jsonFetch("/api/ollama/rewrite", {
      method: "POST",
      body: JSON.stringify({ prompt, uncensored }),
    }),

  gallery: () => jsonFetch("/api/gallery"),
  galleryDelete: (filename) =>
    jsonFetch(`/api/gallery/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  galleryEdit: (filename, op, params = {}) =>
    jsonFetch(`/api/gallery/${encodeURIComponent(filename)}/edit`, {
      method: "POST",
      body: JSON.stringify({ op, params }),
    }),

  modelDownload: (repo_id) =>
    jsonFetch("/api/model/download", {
      method: "POST",
      body: JSON.stringify({ repo_id }),
    }),
  modelStatus: () => jsonFetch("/api/model/status"),

  generate: (params) =>
    jsonFetch("/api/generate", { method: "POST", body: JSON.stringify(params) }),

  streamGenerate: (jid, onEvent) => {
    const es = new EventSource(`/api/generate/stream/${jid}`);
    es.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  },
};
