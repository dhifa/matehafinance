import React, { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { PAGE_WIDTH } from "./docTheme";

const VIEWER_PADDING = 24;

/**
 * Modal chrome for document previews. The document itself is rendered at its
 * real A4 pixel size and scaled down to fit, so the preview is a faithful copy
 * of the exported PDF on any screen size.
 */
export default function DocumentPreviewShell({
  icon,
  title,
  badge,
  reference,
  pageCount,
  actions,
  onClose,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  reference: string;
  pageCount?: number;
  actions: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const update = () => {
      const available = viewport.clientWidth - VIEWER_PADDING * 2;
      setScale(Math.min(1, Math.max(0.3, available / PAGE_WIDTH)));
      setContentHeight(content.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(viewport);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl sm:rounded-3xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        <div className="px-4 sm:px-6 py-3.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl shrink-0">{icon}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-white tracking-wide">{title}</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-300 rounded-md uppercase">{badge}</span>
                {pageCount !== undefined && pageCount > 1 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 rounded-md">{pageCount} Halaman</span>
                )}
              </div>
              <p className="text-xs font-mono text-cyan-400 font-semibold truncate">{reference}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {actions}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition cursor-pointer ml-1"
              title="Tutup Pratinjau"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={viewportRef} className="overflow-y-auto overflow-x-hidden bg-slate-800/60" style={{ padding: VIEWER_PADDING }}>
          <div style={{ width: PAGE_WIDTH * scale, height: contentHeight * scale, margin: "0 auto" }}>
            <div
              ref={contentRef}
              className="[&_.doc-page]:mb-6 [&_.doc-page:last-child]:mb-0 [&_.doc-page]:shadow-2xl [&_.doc-page]:rounded-sm"
              style={{ width: PAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const toolbarButton =
  "flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50";

export const primaryToolbarButton =
  "flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-950 disabled:opacity-50 cursor-pointer";
