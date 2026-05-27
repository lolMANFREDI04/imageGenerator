import React, { useEffect, useState, useCallback } from "react";
import { Trash2, RotateCw, FlipHorizontal, FlipVertical, Crop, Wand2, X, Image as ImageIcon } from "lucide-react";
import { api } from "../api.js";

export default function GalleryPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState({ left: 0, top: 0, right: 0, bottom: 0 });

  const refresh = useCallback(async () => {
    const { items } = await api.gallery();
    setItems(items);
    if (selected) {
      const updated = items.find((i) => i.filename === selected.filename);
      if (updated) setSelected(updated);
      else setSelected(null);
    }
  }, [selected]);

  useEffect(() => { refresh(); }, []);

  const onSelect = (item) => {
    setSelected(item);
    setCropMode(false);
    setCrop({ left: 0, top: 0, right: item.meta?.width || 512, bottom: item.meta?.height || 512 });
  };

  const doEdit = async (op, params = {}) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const updated = await api.galleryEdit(selected.filename, op, params);
      setSelected({ ...updated });
      const list = await api.gallery();
      setItems(list.items);
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!selected) return;
    if (!confirm(`Delete ${selected.filename}?`)) return;
    setBusy(true);
    try {
      await api.galleryDelete(selected.filename);
      setSelected(null);
      const list = await api.gallery();
      setItems(list.items);
    } finally { setBusy(false); }
  };

  return (
    <div className="p-6 lg:p-8 flex flex-col gap-5 max-w-6xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gallery</h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>{items.length} image(s)</p>
        </div>
        <button className="btn" onClick={refresh}>Refresh</button>
      </header>

      {items.length === 0 ? (
        <div className="surface p-10 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
          <ImageIcon size={32} className="mx-auto mb-3 opacity-50" />
          No images yet. Generate one from the Generate tab.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="surface overflow-hidden cursor-pointer group"
              onClick={() => onSelect(it)}
              style={{ borderColor: selected?.id === it.id ? "var(--brand)" : "var(--border)" }}
            >
              <div className="aspect-square overflow-hidden" style={{ background: "var(--bg-elev-2)" }}>
                <img src={it.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
              </div>
              <div className="px-2 py-1.5 text-[11px] truncate" style={{ color: "var(--fg-muted)" }}>
                {it.meta?.prompt || it.filename}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 bg-black/70 p-6 flex items-center justify-center" onClick={() => setSelected(null)}>
          <div className="surface max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 truncate">
                <Wand2 size={14} />
                <span className="font-medium truncate">{selected.filename}</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}><X size={16} /></button>
            </div>
            <div className="flex flex-col lg:flex-row gap-4 p-4 overflow-y-auto">
              <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg-elev-2)", borderRadius: 12, minHeight: 320 }}>
                <img src={selected.url} alt="" className="max-w-full max-h-[60vh] object-contain" />
              </div>
              <div className="lg:w-72 flex flex-col gap-3">
                <div className="surface-2 p-3 text-xs flex flex-col gap-1" style={{ color: "var(--fg-muted)" }}>
                  <div><span className="label">Prompt</span></div>
                  <div style={{ color: "var(--fg)" }}>{selected.meta?.prompt || "—"}</div>
                  {selected.meta?.negative_prompt && (<>
                    <div className="mt-2"><span className="label">Negative</span></div>
                    <div>{selected.meta.negative_prompt}</div>
                  </>)}
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <span>Seed: <b style={{ color: "var(--fg)" }}>{selected.meta?.seed}</b></span>
                    <span>Steps: <b style={{ color: "var(--fg)" }}>{selected.meta?.steps}</b></span>
                    <span>Size: <b style={{ color: "var(--fg)" }}>{selected.meta?.width}×{selected.meta?.height}</b></span>
                    <span>CFG: <b style={{ color: "var(--fg)" }}>{selected.meta?.guidance}</b></span>
                  </div>
                </div>

                <div className="label">Edit</div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn" disabled={busy} onClick={() => doEdit("rotate", { angle: 90 })}><RotateCw size={14} /> Rotate</button>
                  <button className="btn" disabled={busy} onClick={() => doEdit("flip_h")}><FlipHorizontal size={14} /> Flip H</button>
                  <button className="btn" disabled={busy} onClick={() => doEdit("flip_v")}><FlipVertical size={14} /> Flip V</button>
                  <button className="btn" disabled={busy} onClick={() => doEdit("grayscale")}>B/W</button>
                </div>

                <button className="btn" onClick={() => setCropMode((v) => !v)}>
                  <Crop size={14} /> {cropMode ? "Cancel crop" : "Crop"}
                </button>
                {cropMode && (
                  <div className="surface-2 p-3 grid grid-cols-2 gap-2 text-xs">
                    {["left", "top", "right", "bottom"].map((k) => (
                      <label key={k} className="flex flex-col">
                        <span className="capitalize">{k}</span>
                        <input type="number" className="input" value={crop[k]}
                          onChange={(e) => setCrop({ ...crop, [k]: +e.target.value })} />
                      </label>
                    ))}
                    <button className="btn btn-primary col-span-2" disabled={busy}
                      onClick={async () => { await doEdit("crop", crop); setCropMode(false); }}>
                      Apply crop
                    </button>
                  </div>
                )}

                <button className="btn btn-danger mt-auto" onClick={doDelete} disabled={busy}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
