import React, { useEffect, useState } from "react";
import { Download, RefreshCw, Sun, Moon, Flame, Cpu, Server, ShieldAlert, Loader2 } from "lucide-react";
import { api } from "../api.js";

export default function SettingsPage({ settings, updateSettings, requestUncensored, refreshSettings }) {
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaError, setOllamaError] = useState("");
  const [loadingOllama, setLoadingOllama] = useState(false);
  const [download, setDownload] = useState({ status: "idle", progress: 0, message: "", local_dir: "" });
  const [pollingDl, setPollingDl] = useState(false);

  const refreshOllama = async () => {
    setLoadingOllama(true);
    setOllamaError("");
    try {
      const { models, error } = await api.ollamaModels();
      setOllamaModels(models || []);
      if (error) setOllamaError(error);
    } catch (e) { setOllamaError(e.message); }
    finally { setLoadingOllama(false); }
  };

  useEffect(() => { refreshOllama(); refreshDownload(); }, []);

  const refreshDownload = async () => {
    try { setDownload(await api.modelStatus()); } catch {}
  };

  useEffect(() => {
    if (!pollingDl) return;
    const id = setInterval(async () => {
      const st = await api.modelStatus();
      setDownload(st);
      if (st.status === "done" || st.status === "error") {
        setPollingDl(false);
        await refreshSettings();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [pollingDl]);

  const startDownload = async () => {
    setPollingDl(true);
    await api.modelDownload(settings.model_id);
  };

  return (
    <div className="p-6 lg:p-8 flex flex-col gap-5 max-w-4xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Configure backend, model, prompt helper and theme.
        </p>
      </header>

      {/* Inference */}
      <section className="surface p-5 flex flex-col gap-4">
        <h2 className="font-semibold flex items-center gap-2"><Cpu size={16} /> Inference</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="label mb-1">Backend</div>
            <select className="select" value={settings.backend}
              onChange={(e) => updateSettings({ backend: e.target.value })}>
              <option value="optimum">optimum-intel (OVStableDiffusionPipeline)</option>
              <option value="genai">openvino-genai (Text2ImagePipeline)</option>
            </select>
            <p className="text-[11px] mt-1" style={{ color: "var(--fg-muted)" }}>
              Switch freely. The model is reloaded on the next generation.
            </p>
          </div>
          <div>
            <div className="label mb-1">Device</div>
            <select className="select" value={settings.device}
              onChange={(e) => updateSettings({ device: e.target.value })}>
              <option value="GPU">GPU (Intel Iris Xe)</option>
              <option value="CPU">CPU</option>
              <option value="AUTO">AUTO</option>
            </select>
          </div>
        </div>

        <div>
          <div className="label mb-1">Model repo (HuggingFace)</div>
          <input className="input" value={settings.model_id}
            onChange={(e) => updateSettings({ model_id: e.target.value })} />
          <p className="text-[11px] mt-1" style={{ color: "var(--fg-muted)" }}>
            Default: OpenVINO/stable-diffusion-v1-5-fp16-ov · {settings.model_local_dir ? `Local: ${settings.model_local_dir}` : "Not downloaded"}
          </p>
        </div>

        <div className="surface-2 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Model download</div>
            <button className="btn btn-primary" onClick={startDownload}
              disabled={download.status === "running"}>
              {download.status === "running" ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
              {download.status === "running" ? "Downloading…" : "Download model"}
            </button>
          </div>
          {download.status !== "idle" && (
            <>
              <div className="progress-track"><div className="progress-fill"
                style={{ width: `${Math.round((download.progress || 0) * 100)}%` }} /></div>
              <div className="text-xs" style={{ color: "var(--fg-muted)" }}>{download.message}</div>
            </>
          )}
        </div>

        <div>
          <div className="label mb-1 flex items-center gap-2">
            <ShieldAlert size={12} /> NSFW model (phase-2)
          </div>
          <input className="input" placeholder="e.g. OpenVINO/realistic-vision-v6-fp16-ov (future)"
            value={settings.nsfw_model_id || ""}
            onChange={(e) => updateSettings({ nsfw_model_id: e.target.value })} />
          <p className="text-[11px] mt-1" style={{ color: "var(--fg-muted)" }}>
            Reserved for a future dedicated uncensored model. Not used yet.
          </p>
        </div>
      </section>

      {/* Ollama */}
      <section className="surface p-5 flex flex-col gap-4">
        <h2 className="font-semibold flex items-center gap-2"><Server size={16} /> Ollama (prompt rewrite)</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="label mb-1">Host</div>
            <input className="input" value={settings.ollama.host}
              onChange={(e) => updateSettings({ ollama: { ...settings.ollama, host: e.target.value } })} />
          </div>
          <div>
            <div className="label mb-1 flex items-center justify-between">
              <span>Model</span>
              <button className="btn btn-ghost !py-0 !px-1" onClick={refreshOllama} title="Refresh">
                {loadingOllama ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
              </button>
            </div>
            <select className="select" value={settings.ollama.model}
              onChange={(e) => updateSettings({ ollama: { ...settings.ollama, model: e.target.value } })}>
              {!ollamaModels.find((m) => m.name === settings.ollama.model) && (
                <option value={settings.ollama.model}>{settings.ollama.model}</option>
              )}
              {ollamaModels.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
            {ollamaError && (
              <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{ollamaError}</p>
            )}
          </div>
        </div>

        <details className="surface-2 p-3">
          <summary className="text-sm font-medium cursor-pointer">System prompts</summary>
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <div className="label mb-1">Standard system prompt</div>
              <textarea className="textarea min-h-[90px]"
                value={settings.ollama.system_prompt}
                onChange={(e) => updateSettings({ ollama: { ...settings.ollama, system_prompt: e.target.value } })} />
            </div>
            <div>
              <div className="label mb-1">Uncensored system prompt</div>
              <textarea className="textarea min-h-[90px]"
                value={settings.ollama.system_prompt_uncensored}
                onChange={(e) => updateSettings({ ollama: { ...settings.ollama, system_prompt_uncensored: e.target.value } })} />
            </div>
          </div>
        </details>
      </section>

      {/* Appearance */}
      <section className="surface p-5 flex flex-col gap-4">
        <h2 className="font-semibold">Appearance</h2>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: "light", label: "Light", Icon: Sun },
            { id: "dark", label: "Dark", Icon: Moon },
          ].map(({ id, label, Icon }) => (
            <button key={id}
              className={`btn ${settings.theme === id && !settings.uncensored ? "btn-primary" : ""}`}
              onClick={() => updateSettings({ theme: id })}
              disabled={settings.uncensored}>
              <Icon size={14} /> {label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            className={`btn ${settings.uncensored ? "btn-danger" : ""}`}
            onClick={() => requestUncensored(!settings.uncensored)}>
            <Flame size={14} /> {settings.uncensored ? "Disable uncensored" : "Enable uncensored"}
          </button>
        </div>
        {settings.uncensored && (
          <div className="text-xs px-3 py-2 rounded-lg"
            style={{ background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)" }}>
            Uncensored mode is ON. Theme forced to red. Safety checker is disabled.
          </div>
        )}
      </section>
    </div>
  );
}
