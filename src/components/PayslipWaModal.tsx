import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw, Send, ShieldCheck, X, XCircle } from "lucide-react";
import { apiFetch as aiFetch } from "../lib/api";

interface Recipient {
  id: string;
  name: string;
  username: string;
  hasAccount: boolean;
  phone: string; // masked by the server
  hasPhone: boolean;
  status: "belum" | "terkirim" | "gagal";
  reason: string | null;
  at: string | null;
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/**
 * Sends each staff a WhatsApp message with a login-protected link to THEIR OWN
 * released payslip. The server decides who gets what; this dialog only shows
 * the list, asks for confirmation and drives the batches.
 */
export default function PayslipWaModal({ month, year, onClose }: { month: number; year: number; onClose: () => void }) {
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<"load" | "test" | "pending" | "failed" | null>("load");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const periodLabel = `${MONTHS[month]} ${year}`;

  const load = async () => {
    const res = await aiFetch<{ recipients: Recipient[]; configured: boolean }>("/wa/payslips/list", { method: "POST", body: { month, year } });
    setRecipients(res.recipients);
    setConfigured(res.configured);
  };

  useEffect(() => {
    load()
      .catch((err) => setMessage({ ok: false, text: err.message }))
      .finally(() => setBusy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const counts = useMemo(() => {
    const list = recipients || [];
    return {
      total: list.length,
      belum: list.filter((r) => r.status === "belum").length,
      terkirim: list.filter((r) => r.status === "terkirim").length,
      gagal: list.filter((r) => r.status === "gagal").length,
      noPhone: list.filter((r) => !r.hasPhone || !r.hasAccount).length,
    };
  }, [recipients]);

  const sendTest = async () => {
    setBusy("test");
    setMessage(null);
    try {
      const res = await aiFetch<{ message: string }>("/wa/payslips/send", { method: "POST", body: { month, year, mode: "test", origin: window.location.origin } });
      setMessage({ ok: true, text: `${res.message} Cek tampilan pesan dan buka link-nya.` });
    } catch (err: any) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const sendAll = async (mode: "pending" | "failed") => {
    setBusy(mode);
    setMessage(null);
    const total = mode === "pending" ? counts.belum : counts.gagal;
    setProgress({ done: 0, total });
    let done = 0;
    try {
      // The server sends a few per request; repeat until nothing is left
      for (let guard = 0; guard < 200; guard++) {
        const res = await aiFetch<{ processed: Recipient[]; remaining: number }>("/wa/payslips/send", {
          method: "POST",
          body: { month, year, mode, confirm: "KIRIM", origin: window.location.origin },
        });
        done += res.processed.length;
        setProgress({ done, total });
        setRecipients((prev) => (prev || []).map((r) => res.processed.find((p) => p.id === r.id) || r));
        if (res.remaining === 0 || res.processed.length === 0) break;
      }
      await load();
      setMessage({ ok: true, text: "Pengiriman selesai. Periksa status per staf di bawah." });
      setConfirmText("");
    } catch (err: any) {
      setMessage({ ok: false, text: `Pengiriman terhenti: ${err.message}` });
      await load().catch(() => {});
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const confirmed = confirmText.trim() === "KIRIM";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#0e121a] border border-slate-750 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="payslip-wa-title">
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3 bg-[#080b11]">
          <div>
            <h3 id="payslip-wa-title" className="text-sm font-bold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-400" /> Kirim Slip Gaji via WhatsApp
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Periode {periodLabel} · setiap staf menerima link ke slip <strong>miliknya sendiri</strong> (wajib login), tanpa nominal di pesan.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy === "pending" || busy === "failed"} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer disabled:opacity-40" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {!configured && (
            <p className="text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 px-3 py-2">
              WhatsApp belum diatur. Admin perlu mengisi API key & Device ID di Dashboard → Pengaturan WhatsApp.
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              { label: "Penerima", value: counts.total, tone: "text-white" },
              { label: "Belum", value: counts.belum, tone: "text-slate-300" },
              { label: "Terkirim", value: counts.terkirim, tone: "text-emerald-300" },
              { label: "Gagal", value: counts.gagal, tone: "text-rose-300" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-950/50 py-2">
                <p className={`text-lg font-black font-mono ${c.tone}`}>{c.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</p>
              </div>
            ))}
          </div>
          {counts.noPhone > 0 && (
            <p className="text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              {counts.noPhone} staf belum punya No. HP atau akun yang cocok, dan akan tercatat gagal. Lengkapi di Manajemen Staff lalu kirim ulang yang gagal.
            </p>
          )}

          <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/80 max-h-[38vh] overflow-y-auto">
            {busy === "load" && (
              <div className="p-4 text-xs text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat penerima...
              </div>
            )}
            {recipients && recipients.length === 0 && (
              <p className="p-4 text-xs text-slate-400">Belum ada slip gaji yang dirilis untuk periode ini.</p>
            )}
            {(recipients || []).map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="text-slate-100 font-semibold truncate">{r.name}</p>
                  <p className="text-slate-500 font-mono text-[10px]">{r.hasPhone ? r.phone : "No. HP belum diisi"}</p>
                  {r.status === "gagal" && r.reason && <p className="text-rose-300/90 text-[10px] mt-0.5">{r.reason}</p>}
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                    r.status === "terkirim"
                      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                      : r.status === "gagal"
                      ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {r.status === "terkirim" ? <CheckCircle2 className="w-3 h-3" /> : r.status === "gagal" ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {r.status}
                </span>
              </div>
            ))}
          </div>

          {progress && (
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Memproses {progress.done} / {progress.total} staf… jangan tutup jendela ini.
              </p>
            </div>
          )}

          {message && <p className={`text-xs ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>{message.text}</p>}
        </div>

        <div className="p-4 border-t border-slate-800 space-y-3 bg-[#080b11]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={sendTest}
              disabled={busy !== null || !configured}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer disabled:opacity-50"
            >
              {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Kirim tes ke saya
            </button>
            <span className="text-[10px] text-slate-500">Pesan contoh dikirim ke Nomor Tes di Pengaturan WhatsApp.</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Ketik "KIRIM" untuk melanjutkan'
              className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
              aria-label='Ketik KIRIM untuk konfirmasi'
            />
            <button
              type="button"
              onClick={() => sendAll("pending")}
              disabled={!confirmed || busy !== null || !configured || counts.belum === 0}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40"
            >
              {busy === "pending" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Kirim ke {counts.belum} staf
            </button>
            {counts.gagal > 0 && (
              <button
                type="button"
                onClick={() => sendAll("failed")}
                disabled={!confirmed || busy !== null || !configured}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-bold cursor-pointer disabled:opacity-40"
              >
                {busy === "failed" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Kirim ulang yang gagal ({counts.gagal})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
