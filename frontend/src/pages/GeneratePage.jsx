import React, { useRef, useState } from "react";
import {
  Wand2, Sparkles, Settings2, Undo2, RefreshCw, Image as ImageIcon, Loader2, Dice5,
} from "lucide-react";
import { api } from "../api.js";

export default function GeneratePage({
  settings,
  prompt, setPrompt,
  originalPrompt, setOriginalPrompt,
  params, setParams,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, message: "" });
  const [lastImage, setLastImage] = useState(null);
  const [error, setError] = useState("");
  const stopFnRef = useRef(null);

  const setParam = (k, v) => setParams((p) => ({ ...p, [k]: v }));

  const handleRewrite = async () => {
    if (!prompt.trim() || rewriting) return;
    setRewriting(true);
    setError("");
    if (originalPrompt === null) setOriginalPrompt(prompt);
    try {
      const { prompt: newPrompt } = await api.rewritePrompt(prompt, settings.uncensored);
      if (newPrompt) setPrompt(newPrompt);
    } catch (e) {
      setError(`Ollama: ${e.message}`);
    } finally {
      setRewriting(false);
    }
  };

  const restoreOriginal = () => {
    if (originalPrompt !== null) {
      setPrompt(originalPrompt);
      setOriginalPrompt(null);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError("");
    setProgress({ pct: 0, message: "Submitting job..." });
    try {
      const { job_id } = await api.generate({ ...params, prompt });
      const stop = api.streamGenerate(job_id, (event) => {
        if (event.type === "progress") {
          setProgress({ pct: event.pct, message: event.message });
        } else if (event.type === "status") {
          setProgress((p) => ({ ...p, message: event.message }));
        } else if (event.type === "done") {
          setLastImage(event.image);
          setProgress({ pct: 100, message: "Done." });
          setGenerating(false);
          stop();
        } else if (event.type === "error") {
          setError(event.message);
          setGenerating(false);
          stop();
        } else if (event.type === "end") {
          setGenerating(false);
          stop();
        }
      });
      stopFnRef.current = stop;
    } catch (e) {
      setError(e.message);
      setGenerating(false);
    }
  };

  const randomSeed = () => setParam("seed", Math.floor(Math.random() * 2 ** 31));

  return (
    <div className="p-6 lg:p-8 flex flex-col gap-5 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Generate</h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Stable Diffusion 1.5 · {settings.backend === "genai" ? "OpenVINO GenAI" : "Optimum-Intel"} · {settings.device}
          </p>
        </div>
      </header>

      {/* Prompt */}
      <section className="surface p-4 flex flex-col gap-3">
        <label className="label flex items-center gap-2">
          <Wand2 size={12} /> Prompt
        </label>
        <div className="flex gap-2 items-start">
          <textarea
            className="textarea min-h-[110px] flex-1 resize-y"
            placeholder="Describe the image you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <button
              className="btn btn-primary"
              onClick={handleRewrite}
              disabled={!prompt.trim() || rewriting}
              title="Rewrite with Ollama"
            >
              {rewriting ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
              {rewriting ? "Rewriting…" : "Enhance"}
            </button>
            <button
              className="btn"
              onClick={handleRewrite}
              disabled={!prompt.trim() || rewriting}
              title="Rigenera prompt"
            >
              <RefreshCw size={14} />
              Re-roll
            </button>
            <button
              className="btn btn-ghost"
              onClick={restoreOriginal}
              disabled={originalPrompt === null}
              title="Ripristina prompt originale"
            >
              <Undo2 size={14} />
              Restore
            </button>
          </div>
        </div>
        {originalPrompt !== null && (
          <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            Original prompt saved — click Restore to revert.
          </p>
        )}
      </section>

      {/* Advanced drawer */}
      <section className="surface">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <span className="flex items-center gap-2"><Settings2 size={14} /> Advanced settings</span>
          <span style={{ color: "var(--fg-muted)" }}>{advancedOpen ? "▾" : "▸"}</span>
        </button>
        {advancedOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-4 gap-4 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="pt-4">
              <div className="label mb-1">Width</div>
              <input type="number" min={256} max={1024} step={64} className="input"
                value={params.width} onChange={(e) => setParam("width", +e.target.value)} />
            </div>
            <div className="pt-4">
              <div className="label mb-1">Height</div>
              <input type="number" min={256} max={1024} step={64} className="input"
                value={params.height} onChange={(e) => setParam("height", +e.target.value)} />
            </div>
            <div className="pt-4">
              <div className="label mb-1">Steps ({params.steps})</div>
              <input type="range" min={5} max={75} value={params.steps}
                onChange={(e) => setParam("steps", +e.target.value)} className="w-full" />
            </div>
            <div className="pt-4">
              <div className="label mb-1">Guidance ({params.guidance})</div>
              <input type="range" min={1} max={20} step={0.5} value={params.guidance}
                onChange={(e) => setParam("guidance", +e.target.value)} className="w-full" />
            </div>
            <div className="col-span-2">
              <div className="label mb-1">Negative prompt</div>
              <input className="input" value={params.negative_prompt}
                onChange={(e) => setParam("negative_prompt", e.target.value)} />
            </div>
            <div>
              <div className="label mb-1">Seed</div>
              <div className="flex gap-2">
                <input type="number" className="input" value={params.seed}
                  onChange={(e) => setParam("seed", +e.target.value)} />
                <button className="btn" onClick={randomSeed} title="Random seed"><Dice5 size={14} /></button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Generate button + progress */}
      <section className="surface p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            className="btn btn-primary flex-1 py-3 text-base"
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
          >
            {generating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {generating ? "Generating…" : "Generate image"}
          </button>
        </div>
        {(generating || progress.pct > 0) && (
          <div className="flex flex-col gap-2">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs" style={{ color: "var(--fg-muted)" }}>
              <span className={generating ? "animate-pulseSoft" : ""}>{progress.message || "Idle"}</span>
              <span>{progress.pct}%</span>
            </div>
          </div>
        )}
        {error && (
          <div className="text-sm px-3 py-2 rounded-lg"
            style={{ background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)" }}>
            {error}
          </div>
        )}
      </section>

      {/* Last image preview */}
      <section className="surface p-4">
        <div className="label flex items-center gap-2 mb-3"><ImageIcon size={12} /> Last result</div>
        {lastImage ? (
          <div className="flex gap-4 flex-col md:flex-row">
            <img src={lastImage.url} alt="" className="rounded-xl max-w-full md:max-w-sm border"
              style={{ borderColor: "var(--border)" }} />
            <div className="text-xs flex flex-col gap-1" style={{ color: "var(--fg-muted)" }}>
              <span><b style={{ color: "var(--fg)" }}>{lastImage.filename}</b></span>
              <span>{lastImage.meta?.width}×{lastImage.meta?.height} · {lastImage.meta?.steps} steps</span>
              <span>seed: {lastImage.meta?.seed}</span>
              <span>backend: {lastImage.meta?.backend} ({lastImage.meta?.device})</span>
            </div>
          </div>
        ) : (
          <div className="text-sm py-8 text-center" style={{ color: "var(--fg-muted)" }}>
            No image yet. Hit <b>Generate</b> to create your first one.
          </div>
        )}
      </section>
    </div>
  );
}
