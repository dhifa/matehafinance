import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Trash2, KeyRound, ExternalLink } from "lucide-react";
import { apiFetch } from "../lib/api";

interface AiStatus {
  configured: boolean;
  source: "dashboard" | "env" | "none";
  maskedKey: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Admin card to manage the Gemini API key used by the AI scan features.
 * The key is stored server-side; the browser only ever sees a masked preview.
 */
export default function AiSettingsCard() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"load" | "save" | "test" | "delete" | null>("load");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiFetch<AiStatus>("/admin/settings/ai")
      .then(setStatus)
      .catch((err) => setMessage({ ok: false, text: err.message }))
      .finally(() => setBusy(null));
  }, []);

  const run = async (kind: "save" | "test" | "delete") => {
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === "save") {
        const next = await apiFetch<AiStatus>("/admin/settings/ai", { method: "PUT", body: { apiKey: keyInput.trim() } });
        setStatus(next);
        setKeyInput("");
        setMessage({ ok: true, text: "API key tersimpan. Fitur scan AI langsung memakai key ini." });
      } else if (kind === "test") {
        const res = await apiFetch<{ ok: boolean; message: string }>("/admin/settings/ai/test", {
          method: "POST",
          body: keyInput.trim() ? { apiKey: keyInput.trim() } : {},
        });
        setMessage({ ok: res.ok, text: res.message });
      } else {
        if (!window.confirm("Hapus API key Gemini dari dashboard?")) return;
        const next = await apiFetch<AiStatus>("/admin/settings/ai", { method: "DELETE" });
        setStatus(next);
        setMessage({ ok: true, text: next.configured ? "Key dashboard dihapus. Sekarang memakai GEMINI_API_KEY dari file .env." : "API key dihapus." });
      }
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Terjadi kesalahan." });
    } finally {
      setBusy(null);
    }
  };

  const sourceLabel =
    status?.source === "dashboard"
      ? "Diatur dari dashboard"
      : status?.source === "env"
      ? "Dari file .env server"
      : "Belum diatur";

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl p-4 sm:p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="lg:max-w-md">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Pengaturan AI (Gemini)</span>
          </h2>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            API key dipakai untuk <strong>Scan Spreadsheet (AI)</strong> dan <strong>Scan Struk</strong>. Key disimpan aman di server
            dan tidak pernah ditampilkan utuh.
          </p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
          >
            Buat API key di Google AI Studio <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="flex-1 lg:max-w-lg space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500">Status</p>
              {busy === "load" ? (
                <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat...</p>
              ) : (
                <p className={`text-xs font-semibold ${status?.configured ? "text-emerald-300" : "text-amber-300"}`}>
                  {sourceLabel}
                  {status?.maskedKey && <span className="ml-2 font-mono text-slate-300">{status.maskedKey}</span>}
                </p>
              )}
              {status?.updatedAt && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Diubah {status.updatedAt}
                  {status.updatedBy ? ` oleh @${status.updatedBy}` : ""}
                </p>
              )}
            </div>
            {status?.source === "dashboard" && (
              <button
                onClick={() => run("delete")}
                disabled={busy !== null}
                className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
                title="Hapus key dari dashboard"
              >
                {busy === "delete" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="relative">
            <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={status?.configured ? "Masukkan key baru untuk mengganti" : "Tempel API key Gemini (AIza...)"}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl pl-9 pr-10 py-2.5 text-sm text-slate-100 font-mono focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300 cursor-pointer"
              aria-label={showKey ? "Sembunyikan key" : "Tampilkan key"}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => run("test")}
              disabled={busy !== null || (!keyInput.trim() && !status?.configured)}
              className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-slate-400" />}
              Tes Koneksi
            </button>
            <button
              onClick={() => run("save")}
              disabled={busy !== null || !keyInput.trim()}
              className="flex items-center justify-center gap-1.5 h-10 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:hover:bg-cyan-500"
            >
              {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Simpan Key
            </button>
          </div>

          {message && (
            <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {message.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-px shrink-0" />}
              <span>{message.text}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
