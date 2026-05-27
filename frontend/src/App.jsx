import React, { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles, Image as ImageIcon, Settings as SettingsIcon, ShieldAlert } from "lucide-react";
import { api } from "./api.js";
import GeneratePage from "./pages/GeneratePage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import UncensoredModal from "./components/UncensoredModal.jsx";

const PAGES = [
  { id: "generate", label: "Generate", icon: Sparkles },
  { id: "gallery", label: "Gallery", icon: ImageIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const DEFAULT_PARAMS = {
  width: 512, height: 512, steps: 25, guidance: 7.5, seed: -1,
  negative_prompt: "lowres, blurry, deformed, ugly, watermark, text",
};

export default function App() {
  const [page, setPage] = useState("generate");
  const [settings, setSettings] = useState(null);
  const [showUncensoredModal, setShowUncensoredModal] = useState(false);

  // Prompt state lifted here so it survives page switches
  const [prompt, setPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState(null);
  const [params, setParams] = useState(DEFAULT_PARAMS);

  const refreshSettings = useCallback(async () => {
    const s = await api.getSettings();
    setSettings(s);
    setParams(p => ({ ...DEFAULT_PARAMS, ...(s.defaults || {}), ...p }));
    document.body.className = `theme-${s.uncensored ? "red" : s.theme}`;
  }, []);

  useEffect(() => { refreshSettings(); }, [refreshSettings]);

  const updateSettings = async (patch) => {
    const updated = await api.updateSettings(patch);
    setSettings(updated);
    document.body.className = `theme-${updated.uncensored ? "red" : updated.theme}`;
    return updated;
  };

  const requestUncensored = (enable) => {
    if (!enable) {
      updateSettings({ uncensored: false });
      return;
    }
    if (settings?.uncensored_acknowledged) {
      updateSettings({ uncensored: true });
    } else {
      setShowUncensoredModal(true);
    }
  };

  const confirmUncensored = async () => {
    setShowUncensoredModal(false);
    await updateSettings({ uncensored: true, uncensored_acknowledged: true });
  };

  if (!settings) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: "var(--fg-muted)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <aside
        className="w-60 shrink-0 flex flex-col p-4 gap-2 border-r"
        style={{ background: "var(--bg-elev)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 px-2 py-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <div className="font-bold leading-tight">Image Gen</div>
            <div className="text-xs" style={{ color: "var(--fg-muted)" }}>
              SD 1.5 · OpenVINO
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1 mt-2">
          {PAGES.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                className={`nav-item ${page === p.id ? "active" : ""}`}
                onClick={() => setPage(p.id)}
              >
                <Icon size={16} />
                <span>{p.label}</span>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          {settings.uncensored && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: "color-mix(in srgb, var(--danger) 18%, transparent)", color: "var(--danger)" }}
            >
              <ShieldAlert size={14} />
              Uncensored ON
            </div>
          )}
          <div className="text-[11px] px-2" style={{ color: "var(--fg-muted)" }}>
            Backend: <b style={{ color: "var(--fg)" }}>{settings.backend}</b><br />
            Device: <b style={{ color: "var(--fg)" }}>{settings.device}</b>
          </div>
        </div>
      </aside>

      {/* Main — never unmount pages, just hide them so state is preserved */}
      <main className="flex-1 min-w-0 scroll-y">
        <div style={{ display: page === "generate" ? "block" : "none" }}>
          <GeneratePage
            settings={settings}
            prompt={prompt}
            setPrompt={setPrompt}
            originalPrompt={originalPrompt}
            setOriginalPrompt={setOriginalPrompt}
            params={params}
            setParams={setParams}
          />
        </div>
        <div style={{ display: page === "gallery" ? "block" : "none" }}>
          <GalleryPage />
        </div>
        <div style={{ display: page === "settings" ? "block" : "none" }}>
          <SettingsPage
            settings={settings}
            updateSettings={updateSettings}
            requestUncensored={requestUncensored}
            refreshSettings={refreshSettings}
          />
        </div>
      </main>

      {showUncensoredModal && (
        <UncensoredModal
          onCancel={() => setShowUncensoredModal(false)}
          onConfirm={confirmUncensored}
        />
      )}
    </div>
  );
}
