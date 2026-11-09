import React, { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, MessageCircle, Trash2, XCircle } from "lucide-react";
import { apiFetch as aiFetch } from "../lib/api";

export interface WaStatus {
  configured: boolean;
  maskedKey: string | null;
  deviceId: string;
  testNumber: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Admin card for the Atlantic-Notify WhatsApp gateway. The API key is stored on
 * the server; the browser only sees a masked preview.
 */
export default function WaSettingsCard() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [busy, setBusy] = useState<"load" | "save" | "test" | "delete" | null>("load");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (s: WaStatus) => {
    setStatus(s);
    setDeviceId(s.deviceId || "");
    setTestNumber(s.testNumber ? `+${s.testNumber}` : "");
  };

  useEffect(() => {
    aiFetch<WaStatus>("/wa/settings")
      .then(apply)
      .catch((err) => setMessage({ ok: false, text: err.message }))
      .finally(() => setBusy(null));
  }, []);

  const run = async (kind: "save" | "test" | "delete") => {
    if (kind === "delete" && !window.confirm("Hapus pengaturan WhatsApp (API key & Device ID)?")) return;
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === "save") {
        apply(await aiFetch<WaStatus>("/wa/settings", { method: "PUT", body: { apiKey: apiKey.trim(), deviceId: deviceId.trim(), testNumber: testNumber.trim() } }));
        setApiKey("");
        setMessage({ ok: true, text: "Pengaturan WhatsApp tersimpan." });
      } else if (kind === "test") {
        const res = await aiFetch<{ ok: boolean; message: string }>("/wa/settings/test", { method: "POST", body: {} });
        setMessage({ ok: res.ok, text: res.message });
      } else {
        apply(await aiFetch<WaStatus>("/wa/settings", { method: "DELETE" }));
        setMessage({ ok: true, text: "Pengaturan WhatsApp dihapus." });
      }
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Terjadi kesalahan." });
    } finally {
      setBusy(null);
    }
  };

  const input =
    "w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none";

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl p-4 sm:p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="lg:max-w-md">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-400" />
            Pengaturan WhatsApp (Atlantic-Notify)
          </h2>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Dipakai untuk <strong>Kirim Slip Gaji via WA</strong> dan <strong>Blast Info Event</strong>. API key disimpan aman di
            server dan tidak pernah ditampilkan utuh. Nomor WA staf diambil dari kolom <strong>No. HP</strong> di Manajemen Staff.
          </p>
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
            <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Status</span>
            {busy === "load" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
            ) : status?.configured ? (
              <span className="text-emerald-300 font-semibold">
                Terhubung · key <span className="font-mono">{status.maskedKey}</span>
                {status.updatedBy ? <span className="text-slate-500 font-normal"> · oleh @{status.updatedBy}</span> : null}
              </span>
            ) : (
              <span className="text-amber-300 font-semibold">Belum diatur</span>
            )}
          </div>
        </div>

        <div className="w-full lg:max-w-md space-y-2.5">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.configured ? "API key baru (kosongkan jika tidak diganti)" : "API key Atlantic-Notify"}
              className={`${input} pr-9 font-mono`}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
              aria-label={showKey ? "Sembunyikan API key" : "Tampilkan API key"}
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="Device ID (dari dashboard Atlantic-Notify)" className={`${input} font-mono`} />
          <input
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
            placeholder="Nomor tes (WA Anda), mis. 0812 3456 7890"
            inputMode="tel"
            className={`${input} font-mono`}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run("save")}
              disabled={busy !== null || !deviceId.trim() || (!status?.configured && !apiKey.trim())}
              className="flex-1 min-w-[8rem] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Simpan
            </button>
            <button
              type="button"
              onClick={() => run("test")}
              disabled={busy !== null || !status?.configured}
              title="Cek koneksi device dan kirim pesan tes ke Nomor Tes"
              className="flex-1 min-w-[8rem] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer disabled:opacity-50"
            >
              {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
              Tes Koneksi
            </button>
            {status?.configured && (
              <button
                type="button"
                onClick={() => run("delete")}
                disabled={busy !== null}
                className="px-3 py-2 rounded-xl border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50"
                aria-label="Hapus pengaturan WhatsApp"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {message && (
            <p className={`flex items-start gap-1.5 text-[11px] ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {message.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-px shrink-0" />}
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
