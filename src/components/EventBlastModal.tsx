import React, { useEffect, useState } from "react";
import { Copy, Loader2, Megaphone, RotateCcw, Save, Send, ShieldCheck, Users, X } from "lucide-react";
import WaRecipientPicker, { WaSendStatus as Status, WaStaffMember as StaffMember } from "./WaRecipientPicker";
import { doc, getDoc, setDoc } from "../lib/firestore";
import { db } from "../utils/backend";
import { apiFetch as aiFetch } from "../lib/api";
import { EventProject } from "../types";
import {
  DEFAULT_EVENT_TEMPLATES,
  DEFAULT_MEETING_POINT,
  EVENT_BLAST_KINDS,
  EventBlastKind,
  TEMPLATE_VARIABLES,
  formatEventDates,
  reimburseLink,
  renderTemplate,
} from "../utils/waTemplates";
import { confirmDialog } from "../utils/notification";
import WaGroupPanel from "./WaGroupPanel";

const BATCH = 5;

/**
 * Sends event info (or a schedule change / cancellation) to selected crew on
 * WhatsApp. The server fills the template per person and looks up phone numbers.
 */
export default function EventBlastModal({ event, canSaveTemplates, onClose }: { event: EventProject; canSaveTemplates: boolean; onClose: () => void }) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [kind, setKind] = useState<EventBlastKind>("info");
  // Groups are admin only (canSaveTemplates is true for admins)
  const [mode, setMode] = useState<"person" | "group">("person");
  const [templates, setTemplates] = useState<Record<EventBlastKind, string>>(DEFAULT_EVENT_TEMPLATES);
  const [selected, setSelected] = useState<StaffMember[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<"load" | "test" | "send" | "save" | null>("load");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      aiFetch<{ staff: StaffMember[] }>("/wa/staff").then((r) => setStaff(r.staff)),
      getDoc(doc(db, "settings", "wa_templates"))
        .then((snap) => snap.exists() && setTemplates({ ...DEFAULT_EVENT_TEMPLATES, ...(snap.data() as Partial<Record<EventBlastKind, string>>) }))
        .catch(() => {}),
    ])
      .catch((err) => setMessage({ ok: false, text: err.message }))
      .finally(() => setBusy(null));
  }, []);


  const template = templates[kind];
  const eventVars = {
    acara: event.name || "-",
    tanggal: formatEventDates(event.dates, event.date),
    call_time: event.callTime || "-",
    lokasi: event.location || "-",
    maps: event.mapsUrl || "-",
    titik_kumpul: event.meetingPoint || DEFAULT_MEETING_POINT,
    pic: event.picName || "-",
    rundown: event.rundownUrl || "-",
    reimburse: reimburseLink(window.location.origin, event),
    catatan: event.crewNotes || "-",
  };
  // One message for a WhatsApp group: no personal name
  const groupText = renderTemplate(template, { ...eventVars, nama: "Tim" });
  const missingReimburse = kind !== "pembatalan" && !template.includes("{reimburse}");
  const preview = renderTemplate(template, {
    ...eventVars,
    nama: selected[0]?.name || "Nama Kru",
  });

  const openGroupShare = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(groupText)}`, "_blank");
  };
  const copyGroupText = async () => {
    try {
      await navigator.clipboard.writeText(groupText);
      setMessage({ ok: true, text: "Teks untuk grup disalin. Tempel di grup WhatsApp tim." });
    } catch {
      setMessage({ ok: false, text: "Gagal menyalin. Pakai tombol Kirim ke Grup WA." });
    }
  };

  const saveTemplates = async () => {
    setBusy("save");
    try {
      await setDoc(doc(db, "settings", "wa_templates"), templates);
      setMessage({ ok: true, text: "Template disimpan untuk blast berikutnya." });
    } catch (err: any) {
      setMessage({ ok: false, text: `Template gagal disimpan: ${err.message}` });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    setMessage(null);
    try {
      const res = await aiFetch<{ message: string }>("/wa/events/send", { method: "POST", body: { eventId: event.id, template, mode: "test", origin: window.location.origin } });
      setMessage({ ok: true, text: res.message });
    } catch (err: any) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const send = async (targets: StaffMember[]) => {
    if (!targets.length) return;
    const label = EVENT_BLAST_KINDS.find((k) => k.key === kind)!.label;
    if (!(await confirmDialog(`"${label}" untuk ${event.name} akan dikirim via WhatsApp ke ${targets.length} orang.`, { title: "Kirim blast WA?", confirmText: "Ya, Kirim", type: "info" }))) return;
    setBusy("send");
    setMessage(null);
    setProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i += BATCH) {
        const chunk = targets.slice(i, i + BATCH);
        const res = await aiFetch<{ results: { uid: string; status: Status["status"]; reason: string | null }[] }>("/wa/events/send", {
          method: "POST",
          body: { eventId: event.id, template, mode: "send", recipients: chunk.map((c) => c.uid), origin: window.location.origin },
        });
        setStatuses((prev) => ({ ...prev, ...Object.fromEntries(res.results.map((r) => [r.uid, { status: r.status, reason: r.reason }])) }));
        setProgress({ done: Math.min(targets.length, i + BATCH), total: targets.length });
      }
      setMessage({ ok: true, text: "Pengiriman selesai. Periksa status per orang." });
    } catch (err: any) {
      setMessage({ ok: false, text: `Pengiriman terhenti: ${err.message}` });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const failed = selected.filter((s) => statuses[s.uid]?.status === "gagal");
  const chip = (on: boolean) =>
    `px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${on ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#0e121a] border border-slate-750 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="event-blast-title">
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3 bg-[#080b11]">
          <div>
            <h3 id="event-blast-title" className="text-sm font-bold text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-emerald-400" /> Blast WhatsApp ke Kru — {event.name}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {mode === "group"
                ? "Satu pesan info event ke grup WhatsApp kru, dikirim lewat nomor WhatsApp Mateha."
                : "Setiap orang menerima pesan dengan namanya sendiri. Nomor diambil dari No. HP di Manajemen Staff."}
            </p>
            {canSaveTemplates && (
              <div className="flex gap-1.5 mt-2.5" role="tablist" aria-label="Tujuan kiriman">
                <button type="button" role="tab" aria-selected={mode === "person"} onClick={() => setMode("person")} disabled={busy === "send"} className={chip(mode === "person")}>
                  Per orang
                </button>
                <button type="button" role="tab" aria-selected={mode === "group"} onClick={() => setMode("group")} disabled={busy === "send"} className={chip(mode === "group")}>
                  Grup WhatsApp
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={busy === "send"} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer disabled:opacity-40" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode === "group" ? (
          <div className="p-4 overflow-y-auto">
            <WaGroupPanel event={event} staff={staff} />
          </div>
        ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-y-auto">
          {/* Message */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {EVENT_BLAST_KINDS.map((k) => (
                <button key={k.key} type="button" onClick={() => setKind(k.key)} className={chip(kind === k.key)}>
                  {k.label}
                </button>
              ))}
            </div>
            <textarea
              value={template}
              onChange={(e) => setTemplates({ ...templates, [kind]: e.target.value })}
              rows={11}
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono leading-relaxed focus:outline-none"
              aria-label="Template pesan"
            />
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-slate-500 mr-1">Variabel:</span>
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTemplates({ ...templates, [kind]: `${template}{${v}}` })}
                  className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] font-mono text-cyan-300 hover:bg-slate-700 cursor-pointer"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTemplates({ ...templates, [kind]: DEFAULT_EVENT_TEMPLATES[kind] })} className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer">
                Kembalikan template bawaan
              </button>
              {canSaveTemplates && (
                <button type="button" onClick={saveTemplates} disabled={busy !== null} className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 cursor-pointer disabled:opacity-50">
                  <Save className="w-3 h-3" /> Simpan template
                </button>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Pratinjau ({selected[0]?.name || "contoh"})</p>
              <pre className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-[#0b141a] p-3 text-[11px] text-slate-100 font-sans leading-relaxed max-h-56 overflow-y-auto">{preview}</pre>
              {missingReimburse && (
                <p className="text-[10px] text-amber-300 mt-1">
                  Template ini belum berisi link reimburse. Klik variabel <span className="font-mono">{"{reimburse}"}</span> atau "Kembalikan template bawaan".
                </p>
              )}
              {(!event.callTime || !event.picName) && (
                <p className="text-[10px] text-amber-300 mt-1">Call time / PIC event masih kosong. Isi di bagian Info Kru pada Lembar Kerja.</p>
              )}
            </div>
          </div>

          {/* Recipients */}
          <WaRecipientPicker staff={staff} statuses={statuses} onChange={setSelected} />
        </div>

        <div className="p-4 border-t border-slate-800 bg-[#080b11] space-y-2">
          {progress && (
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}
          {message && <p className={`text-xs ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>{message.text}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <div className="flex gap-2 mr-auto">
              <button type="button" onClick={openGroupShare} disabled={busy === "send"} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs font-bold cursor-pointer disabled:opacity-50" title="Buka WhatsApp lalu pilih grup tim">
                <Users className="w-3.5 h-3.5" /> Kirim ke Grup WA
              </button>
              <button type="button" onClick={copyGroupText} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer" title="Salin teks untuk grup">
                <Copy className="w-3.5 h-3.5" /> Salin teks
              </button>
            </div>
            <button type="button" onClick={sendTest} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer disabled:opacity-50">
              {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Kirim tes ke saya
            </button>
            {failed.length > 0 && (
              <button type="button" onClick={() => send(failed)} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-bold cursor-pointer disabled:opacity-50">
                <RotateCcw className="w-3.5 h-3.5" /> Kirim ulang yang gagal ({failed.length})
              </button>
            )}
            <button type="button" onClick={() => send(selected)} disabled={busy !== null || selected.length === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40">
              {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Kirim ke {selected.length} orang
            </button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
