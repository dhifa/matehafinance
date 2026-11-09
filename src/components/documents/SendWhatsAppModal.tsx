import React, { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import { Check, Copy, Loader2, MessageCircle, Share2, X } from "lucide-react";

/** "0812-3456 789", "+62 812..." or "812..." → "62812..." (empty when not a phone number). */
export function normalizeWaNumber(raw?: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  return digits.length >= 9 && digits.length <= 15 ? digits : "";
}

/**
 * Sends a document to a client on WhatsApp: the message (editable) plus the PDF.
 * Phones that support sharing files attach the PDF directly; elsewhere WhatsApp
 * opens with the message and the PDF is downloaded so it can be attached.
 */
export default function SendWhatsAppModal({
  title,
  phone,
  initialText,
  fileName,
  buildPdf,
  onClose,
}: {
  title: string;
  phone?: string;
  initialText: string;
  fileName: string;
  buildPdf: () => Promise<Blob>;
  onClose: () => void;
}) {
  const [number, setNumber] = useState(phone || "");
  const [text, setText] = useState(initialText);
  const [downloadPdf, setDownloadPdf] = useState(true);
  const [busy, setBusy] = useState<"share" | "open" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waNumber = normalizeWaNumber(number);
  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] });

  // Phones only allow sharing right after a tap, so the PDF is prepared as soon as the dialog opens
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  useEffect(() => {
    if (!canShareFiles) return;
    let alive = true;
    buildPdf()
      .then((blob) => alive && setSharedFile(new File([blob], fileName, { type: "application/pdf" })))
      .catch(() => alive && setError("PDF gagal disiapkan. Gunakan tombol Buka WhatsApp."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sharePdf = async () => {
    if (!sharedFile) return;
    setBusy("share");
    setError(null);
    try {
      await navigator.share({ files: [sharedFile], text });
      onClose();
    } catch (err: any) {
      if (err?.name !== "AbortError") setError("Gagal membagikan PDF. Coba tombol Buka WhatsApp.");
    } finally {
      setBusy(null);
    }
  };

  const openWhatsApp = async () => {
    setBusy("open");
    setError(null);
    // Open the window first (inside the click) so pop-up blockers allow it. "noopener" would
    // make window.open return null even on success, so detach the opener by hand instead.
    const win = window.open("", "_blank");
    if (win) {
      win.opener = null;
      win.location.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    }
    try {
      if (downloadPdf) saveAs(await buildPdf(), fileName);
      if (!win) setError("Browser memblokir jendela baru. Izinkan pop-up untuk situs ini, lalu coba lagi.");
    } catch {
      setError("WhatsApp terbuka, tapi PDF gagal dibuat. Unduh PDF dari tombol Unduh PDF.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Gagal menyalin otomatis. Blok teksnya lalu salin manual.");
    }
  };

  const input = "w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div
        className="bg-[#0e121a] border border-slate-750 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-wa-title"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-[#080b11]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <MessageCircle className="w-4.5 h-4.5" />
            </div>
            <h3 id="send-wa-title" className="text-sm font-bold text-white">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div>
            <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Nomor WhatsApp tujuan</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="mis. 0812 3456 7890" inputMode="tel" className={`${input} font-mono`} />
            <p className="text-[10px] text-slate-500 mt-1">
              {waNumber ? `Akan dikirim ke +${waNumber}` : "Kosongkan untuk memilih kontak atau grup di WhatsApp."}
            </p>
          </div>
          <div>
            <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Pesan</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className={`${input} font-mono leading-relaxed`} />
          </div>
          {!canShareFiles && (
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={downloadPdf} onChange={(e) => setDownloadPdf(e.target.checked)} />
              Unduh PDF juga, untuk dilampirkan di chat WhatsApp
            </label>
          )}
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-800 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Tersalin" : "Salin Teks"}
          </button>
          {canShareFiles && (
            <button
              type="button"
              onClick={sharePdf}
              disabled={busy !== null || !sharedFile}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-bold text-emerald-300 cursor-pointer disabled:opacity-50"
            >
              {busy === "share" || !sharedFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              {sharedFile ? "Kirim PDF ke WhatsApp" : "Menyiapkan PDF..."}
            </button>
          )}
          <button
            type="button"
            onClick={openWhatsApp}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-50"
          >
            {busy === "open" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
            Buka WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
