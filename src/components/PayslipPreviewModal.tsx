import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Printer, X } from "lucide-react";

const PAGE_WIDTH = 794; // same A4 width the PDF is rendered at

/**
 * Shows a payslip on screen, exactly as the PDF looks, without downloading it.
 * The slip is rendered in a sandboxed iframe (no scripts), so free text in the
 * slip can never run in the app. Rendered into document.body so a transformed
 * parent cannot clip the fixed overlay.
 */
export default function PayslipPreviewModal({
  title,
  html,
  onClose,
  onDownload,
  onPrint,
  downloading,
  printing,
}: {
  title: string;
  html: string | null; // null while it is being prepared
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  downloading?: boolean;
  printing?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(1123);

  // Fit the A4 page to the available width (phones included)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / PAGE_WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const measure = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc) setPageHeight(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0));
  };

  const srcDoc = html
    ? `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#0f172a}*{box-sizing:border-box}</style></head><body><div style="width:${PAGE_WIDTH}px">${html}</div></body></html>`
    : "";

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-[#0e121a] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-[#080b11]">
          <h3 className="text-sm font-bold text-white truncate">{title}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onDownload}
              disabled={!html || downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Unduh PDF</span>
            </button>
            <button
              type="button"
              onClick={onPrint}
              disabled={!html || printing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Cetak</span>
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer" aria-label="Tutup pratinjau">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-3 sm:p-5 bg-slate-900/60">
          <div ref={wrapRef} className="w-full">
            {!html ? (
              <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Menyiapkan slip…
              </div>
            ) : (
              <div className="mx-auto shadow-xl" style={{ width: PAGE_WIDTH * scale, height: pageHeight * scale, overflow: "hidden" }}>
                <iframe
                  ref={frameRef}
                  title={title}
                  // allow-same-origin only lets us measure the height; without allow-scripts nothing in it can run
                  sandbox="allow-same-origin"
                  srcDoc={srcDoc}
                  onLoad={measure}
                  scrolling="no"
                  style={{ width: PAGE_WIDTH, height: pageHeight, border: 0, background: "#fff", transform: `scale(${scale})`, transformOrigin: "top left" }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
