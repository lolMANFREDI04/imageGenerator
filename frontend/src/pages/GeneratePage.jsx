import React, { useRef, useState, useEffect } from "react";
import {
  Wand2, Sparkles, Settings2, Undo2, RefreshCw, Image as ImageIcon,
  Loader2, Dice5, Clock, Timer,
} from "lucide-react";
import { api } from "../api.js";

function fmtSeconds(s) {
  if (s === null || s === undefined) return null;
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export default function GeneratePage({
  settings, modelReady, preloadDone,
  prompt, setPrompt,
  originalPrompt, setOriginalPrompt,
  params, setParams,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, message: "", elapsed: null, eta: null });
  const [lastImage, setLastImage] = useState(null);
  const [error, setError] = useState("");
  // Wall-clock timer (ticks every second while generating)
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const unsubRef = useRef(null);

  // Start/stop wall clock
  useEffect(() => {
    if (generating) {
      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [generating]);

  // Cleanup SSE unsubscribe on unmount
  useEffect(() => () => unsubRef.current?.(), []);

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
    setElapsed(0);
    setError("");
    setProgress({ pct: 0, message: "Submitting job...", elapsed: 0, eta: null });
    try {
      const { job_id } = await api.generate({ ...params, prompt });
      const unsub = api.streamGenerate(job_id, (event) => {
        if (event.type === "ping") return;
        if (event.type === "progress") {
          setProgress({
            pct: event.pct,
            message: event.message,
            elapsed: event.elapsed ?? null,
            eta: event.eta ?? null,
          });
        } else if (event.type === "status") {
          setProgress(p => ({
            ...p,
            message: event.message,
            elapsed: event.elapsed ?? p.elapsed,
          }));
        } else if (event.type === "done") {
          setLastImage(event.image);
          setProgress({ pct: 100, message: "Done.", elapsed: event.elapsed ?? null, eta: 0 });
          setGenerating(false);
          unsub();
        } else if (event.type === "error") {
          setError(event.message);
          setGenerating(false);
          unsub();
        } else if (event.type === "end") {
          setGenerating(false);
          unsub();
        }
      });
      unsubRef.current = unsub;
    } catch (e) {
      setError(e.message);
      setGenerating(false);
    }
  };

  const randomSeed = () => setParam("seed", Math.floor(Math.random() * 2 ** 31));

  const canGenerate = prompt.trim() && !generating && (modelReady || preloadDone);

  return (
    <div className="p-6 lg:p-8 flex flex-col gap-5 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Generate</h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Stable Diffusion 1.5 · {settings.backend === "genai" ? "OpenVINO GenAI" : "Optimum-Intel"} · {settings.device}
          </p>
        </div>
        {!preloadDone && (
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "color-mix(in srgb, var(--brand) 15%, transparent)", color: "var(--brand)" }}>
            <Loader2 size={12} className="animate-spin" />
            Loading model, please wait…
          </div>
        )}
      </header>

      {/* Prompt */}
      <section className="surface p-4 flex flex-col gap-3">
        <label className="label flex items-center gap-2"><Wand2 size={12} /> Prompt</label>
        <div className="flex gap-2 items-start">
          <textarea
            className="textarea min-h-[110px] flex-1 resize-y"
            placeholder="Describe the image you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary" onClick={handleRewrite}
              disabled={!prompt.trim() || rewriting} title="Rewrite with Ollama">
              {rewriting ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
              {rewriting ? "Rewriting…" : "Enhance"}
            </button>
            <button className="btn" onClick={handleRewrite}
              disabled={!prompt.trim() || rewriting} title="Re-roll prompt">
              <RefreshCw size={14} /> Re-roll
            </button>
            <button className="btn btn-ghost" onClick={restoreOriginal}
              disabled={originalPrompt === null} title="Restore original prompt">
              <Undo2 size={14} /> Restore
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
        <button className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
          onClick={() => setAdvancedOpen((v) => !v)}>
          <span className="flex items-center gap-2"><Settings2 size={14} /> Advanced settings</span>
          <span style={{ color: "var(--fg-muted)" }}>{advancedOpen ? "▾" : "▸"}</span>
        </button>
        {advancedOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-4 gap-4 border-t"
            style={{ borderColor: "var(--border)" }}>
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
                <button className="btn" onClick={randomSeed} title="Random seed">
                  <Dice5 size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Generate button + progress */}
      <section className="surface p-4 flex flex-col gap-3">
        <button className="btn btn-primary py-3 text-base"
          onClick={handleGenerate} disabled={!canGenerate}>
          {generating
            ? <><Loader2 className="animate-spin" size={16} /> Generating…</>
            : !preloadDone
              ? <><Loader2 className="animate-spin" size={16} /> Waiting for model…</>
              : <><Sparkles size={16} /> Generate image</>}
        </button>

        {/* Progress bar — always rendered, width driven by pct */}
        <div className="flex flex-col gap-2">
          <div className="progress-track">
            <div className="progress-fill"
              style={{ width: `${generating || progress.pct > 0 ? progress.pct : 0}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs gap-4"
            style={{ color: "var(--fg-muted)" }}>
            <span className={generating ? "animate-pulseSoft flex-1 min-w-0 truncate" : "flex-1 min-w-0 truncate"}>
              {generating || progress.pct > 0 ? (progress.message || "Idle") : "Ready"}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              {/* Wall-clock elapsed */}
              {generating && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {fmtSeconds(elapsed)}
                </span>
              )}
              {/* Server-side ETA */}
              {generating && progress.eta !== null && progress.eta > 0 && (
                <span className="flex items-center gap-1">
                  <Timer size={11} /> ~{fmtSeconds(progress.eta)} left
                </span>
              )}
              {(generating || progress.pct > 0) && (
                <span>{progress.pct}%</span>
              )}
            </div>
          </div>
        </div>

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
              {lastImage.meta?.generation_time && (
                <span>time: {lastImage.meta.generation_time}s</span>
              )}
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
