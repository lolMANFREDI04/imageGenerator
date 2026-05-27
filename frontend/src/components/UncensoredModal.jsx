import React, { useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";

export default function UncensoredModal({ onCancel, onConfirm }) {
  const [adult, setAdult] = useState(false);
  const [risks, setRisks] = useState(false);
  const [legal, setLegal] = useState(false);
  const allOk = adult && risks && legal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="surface max-w-lg w-full p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "color-mix(in srgb, var(--danger) 25%, transparent)", color: "var(--danger)" }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="font-bold text-lg">Enable Uncensored Mode</h2>
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              Read all warnings carefully before continuing.
            </p>
          </div>
        </div>

        <div
          className="surface-2 p-4 text-sm flex gap-2"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, var(--border))" }}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
          <div>
            Disabling content filtering may produce explicit, disturbing or otherwise
            sensitive imagery. The interface will switch to a red theme to remind you
            this mode is active. You are solely responsible for the prompts you submit
            and the use of generated content.
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1" />
          <span>I confirm I am <b>at least 18 years old</b> (or the legal adult age in my country).</span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={risks} onChange={(e) => setRisks(e.target.checked)} className="mt-1" />
          <span>I understand the safety filter is being disabled and outputs may contain explicit content.</span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} className="mt-1" />
          <span>I will <b>not</b> generate content depicting minors or other illegal subject matter.</span>
        </label>

        <div className="flex gap-2 justify-end mt-2">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" disabled={!allOk} onClick={onConfirm}>
            Enable Uncensored
          </button>
        </div>
      </div>
    </div>
  );
}
