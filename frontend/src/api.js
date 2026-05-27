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

// Global SSE registry: jid -> { es, callbacks[] }
// Keeps EventSource alive even if the component is hidden, so page switches
// never interrupt a running generation.
const _streams = {};

function _openStream(path, onEvent) {
  const key = path;
  if (!_streams[key]) {
    const es = new EventSource(BASE + path);
    _streams[key] = { es, cbs: [] };
    es.onmessage = (e) => {
      let ev;
      try { ev = JSON.parse(e.data); } catch { return; }
      // broadcast to all registered callbacks
      _streams[key]?.cbs.forEach((cb) => cb(ev));
      // auto-cleanup on terminal events
      if (ev.type === "end" || ev.type === "done" || ev.type === "error") {
        _streams[key]?.es.close();
        delete _streams[key];
      }
    };
    es.onerror = () => {
      // Don't close — browser will retry SSE automatically.
      // Only close if the server sent a terminal event already.
    };
  }
  const entry = _streams[key];
  entry.cbs.push(onEvent);
  // return unsubscribe fn — does NOT close the EventSource
  return () => {
    if (_streams[key]) {
      _streams[key].cbs = _streams[key].cbs.filter((cb) => cb !== onEvent);
    }
  };
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
  modelReady: () => jsonFetch("/api/model/ready"),

  generate: (params) =>
    jsonFetch("/api/generate", { method: "POST", body: JSON.stringify(params) }),

  // Returns an unsubscribe fn. Does NOT close the underlying EventSource
  // so switching pages never interrupts the stream.
  streamGenerate: (jid, onEvent) =>
    _openStream(`/api/generate/stream/${jid}`, onEvent),

  // SSE for startup preload progress
  streamPreload: (onEvent) =>
    _openStream("/api/model/preload/stream", onEvent),
};
