import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, Loader2, RefreshCw, ShieldCheck, Users, XCircle } from "lucide-react";
import { apiFetch as aiFetch } from "../lib/api";
import { EventProject } from "../types";
import { buildGroupMessage, reimburseLink } from "../utils/waTemplates";
import { confirmDialog } from "../utils/notification";
import { WaStaffMember } from "./WaRecipientPicker";

interface WaGroup {
  id: string;
  name: string;
  size: number | null;
}
interface HistoryRow {
  at: string;
  by: string;
  group: string;
  event: string;
  ok: boolean;
  reason: string | null;
  test?: boolean;
}
type GroupStatus = { ok: boolean; message: string };

const GAP_MS = 4000; // pause between groups (Atlantic-Notify daily quota)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const wib = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " WIB";

/**
 * Admin only: sends the event info to WhatsApp crew groups through
 * Atlantic-Notify, one group per request. The server only accepts group ids
 * from its cached group list.
 */
export default function WaGroupPanel({ event, staff }: { event: EventProject; staff: WaStaffMember[] | null }) {
  const crewKey = `mateha_wa_group_crew_${event.id}`;
  const [crew, setCrew] = useState<string>(() => {
    try {
      return localStorage.getItem(crewKey) || "";
    } catch {
      return "";
    }
  });
  const draft = useMemo(
    () => buildGroupMessage({ ...event, reimburse: reimburseLink(window.location.origin, event), crew }),
    [event, crew]
  );
  const [message, setMessage] = useState(draft);
  const [edited, setEdited] = useState(false);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Record<string, GroupStatus>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState<"load" | "refresh" | "test" | "send" | null>("load");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<GroupStatus | null>(null);

  // Keep the message in step with the form until the admin edits it by hand
  useEffect(() => {
    if (!edited) setMessage(draft);
  }, [draft, edited]);

  useEffect(() => {
    try {
      localStorage.setItem(crewKey, crew);
    } catch {
      // Storage unavailable: the crew list lasts until reload
    }
  }, [crew, crewKey]);

  const loadHistory = () =>
    aiFetch<{ history: HistoryRow[] }>("/wa/groups/history")
      .then((r) => setHistory(r.history))
      .catch(() => {});

  useEffect(() => {
    Promise.all([
      aiFetch<{ groups: WaGroup[]; fetchedAt: string | null }>("/wa/groups").then((r) => {
        setGroups(r.groups);
        setFetchedAt(r.fetchedAt);
      }),
      loadHistory(),
    ])
      .catch((err) => setNotice({ ok: false, message: err.message }))
      .finally(() => setBusy(null));
  }, []);

  const refresh = async () => {
    setBusy("refresh");
    setNotice(null);
    try {
      const r = await aiFetch<{ groups: WaGroup[]; fetchedAt: string; diagnostic?: string | null }>("/wa/groups/refresh", { method: "POST", body: {} });
      setGroups(r.groups);
      setFetchedAt(r.fetchedAt);
      setPicked((prev) => prev.filter((id) => r.groups.some((g) => g.id === id)));
      setNotice(
        r.groups.length
          ? { ok: true, message: `${r.groups.length} grup dimuat.` }
          : { ok: false, message: r.diagnostic || "Nomor pengirim belum bergabung di grup mana pun." }
      );
    } catch (err: any) {
      setNotice({ ok: false, message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const addCrew = (m: WaStaffMember) => {
    const entry = m.jobTitle ? `${m.name}, ${m.jobTitle}` : m.name;
    setCrew((c) => (c.split("\n").some((l) => l.trim().startsWith(m.name)) ? c : `${c.trim() ? `${c.trimEnd()}\n` : ""}${entry}`));
  };

  const sendTest = async () => {
    setBusy("test");
    setNotice(null);
    try {
      const r = await aiFetch<GroupStatus>("/wa/groups/send", { method: "POST", body: { mode: "test", message, event: event.name } });
      setNotice(r);
      loadHistory();
    } catch (err: any) {
      setNotice({ ok: false, message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const send = async (ids: string[]) => {
    const targets = groups.filter((g) => ids.includes(g.id));
    if (!targets.length || !message.trim()) return;
    const ok = await confirmDialog(`Info event akan dikirim ke ${targets.length} grup:\n${targets.map((g) => `• ${g.name}`).join("\n")}`, {
      title: "Kirim ke grup WhatsApp?",
      confirmText: "Ya, Kirim",
      type: "info",
    });
    if (!ok) return;
    setBusy("send");
    setNotice(null);
    setProgress({ done: 0, total: targets.length });
    let okCount = 0;
    try {
      for (const [i, g] of targets.entries()) {
        if (i > 0) await sleep(GAP_MS);
        let result: GroupStatus;
        try {
          result = await aiFetch<GroupStatus>("/wa/groups/send", { method: "POST", body: { groupId: g.id, message, event: event.name } });
        } catch (err: any) {
          result = { ok: false, message: err.message };
        }
        if (result.ok) okCount++;
        setStatuses((prev) => ({ ...prev, [g.id]: result }));
        setProgress({ done: i + 1, total: targets.length });
      }
      const failedCount = targets.length - okCount;
      setNotice({
        ok: failedCount === 0,
        message: failedCount === 0 ? `Terkirim ke ${okCount} grup.` : `${okCount} grup terkirim, ${failedCount} gagal. Lihat alasannya di daftar grup.`,
      });
    } finally {
      setBusy(null);
      setProgress(null);
      loadHistory();
    }
  };

  const failed = picked.filter((id) => statuses[id] && !statuses[id].ok);
  const activeStaff = (staff || []).filter((s) => s.active);
  const btn = "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Message */}
      <div className="space-y-2.5 min-w-0">
        <label className="block text-[11px] font-semibold text-slate-300" htmlFor="wa-group-crew">
          Kru bertugas <span className="font-normal text-slate-500">(satu baris: Nama, Peran)</span>
        </label>
        <textarea
          id="wa-group-crew"
          value={crew}
          onChange={(e) => setCrew(e.target.value)}
          rows={4}
          placeholder={"Jimmy, vMix Operator\nDhika, Camera Person"}
          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none"
        />
        {activeStaff.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-slate-500 mr-1 self-center">Tambah cepat:</span>
            {activeStaff.map((m) => (
              <button key={m.uid} type="button" onClick={() => addCrew(m)} className="px-2 py-1 rounded-md bg-slate-800 text-[10px] text-slate-200 hover:bg-slate-700 cursor-pointer">
                + {m.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-semibold text-slate-300" htmlFor="wa-group-message">
            Pesan untuk grup <span className="font-normal text-slate-500">(bisa diedit)</span>
          </label>
          {edited && (
            <button type="button" onClick={() => setEdited(false)} className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer">
              Susun ulang dari data event
            </button>
          )}
        </div>
        <textarea
          id="wa-group-message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setEdited(true);
          }}
          rows={14}
          maxLength={3000}
          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono leading-relaxed focus:outline-none"
        />
        <p className="text-[10px] text-slate-500">
          Slip gaji dan data pribadi tidak dikirim ke grup. Untuk itu pakai kirim per orang.
        </p>
      </div>

      {/* Groups */}
      <div className="space-y-2.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-slate-300">Grup WhatsApp</p>
          <button type="button" onClick={refresh} disabled={busy !== null} className={`${btn} border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-slate-200`}>
            {busy === "refresh" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Muat daftar grup
          </button>
        </div>
        <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/80 max-h-64 overflow-y-auto">
          {busy === "load" ? (
            <p className="p-3 text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat…</p>
          ) : groups.length === 0 ? (
            <div className="p-3 space-y-1.5">
              <p className="text-xs text-slate-400">Belum ada daftar grup. Klik <strong>Muat daftar grup</strong>. Nomor WhatsApp Mateha harus sudah jadi anggota grupnya.</p>
              {notice && !notice.ok && <p className="text-[11px] text-rose-300 break-words font-mono">{notice.message}</p>}
            </div>
          ) : (
            groups.map((g) => {
              const st = statuses[g.id];
              return (
                <label key={g.id} className="flex items-start gap-2.5 p-2.5 cursor-pointer hover:bg-slate-900/60">
                  <input
                    type="checkbox"
                    checked={picked.includes(g.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, g.id] : p.filter((x) => x !== g.id)))}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-white truncate">{g.name}</span>
                    <span className="block text-[10px] text-slate-500">{g.size != null ? `${g.size} anggota` : "Grup"}</span>
                    {st && <span className={`block text-[10px] mt-0.5 ${st.ok ? "text-emerald-300" : "text-rose-300"}`}>{st.ok ? "Terkirim" : `Gagal: ${st.message}`}</span>}
                  </span>
                  {st && (st.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />)}
                </label>
              );
            })
          )}
        </div>
        <p className="text-[10px] text-slate-500">
          {picked.length} grup dipilih{fetchedAt ? ` · daftar dimuat ${wib(fetchedAt)}` : ""}
        </p>

        <details className="rounded-xl border border-slate-800 bg-slate-950/40">
          <summary className="px-3 py-2 text-[11px] font-semibold text-slate-300 cursor-pointer flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Riwayat kiriman grup ({history.length})
          </summary>
          <div className="max-h-56 overflow-auto">
            {history.length === 0 ? (
              <p className="px-3 pb-3 text-[11px] text-slate-500">Belum ada kiriman.</p>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="text-slate-500 text-left">
                  <tr>
                    <th className="px-3 py-1 font-semibold">Waktu</th>
                    <th className="px-2 py-1 font-semibold">Grup</th>
                    <th className="px-2 py-1 font-semibold">Acara</th>
                    <th className="px-2 py-1 font-semibold">Admin</th>
                    <th className="px-2 py-1 font-semibold">Hasil</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {history.map((h, i) => (
                    <tr key={i} className="border-t border-slate-800/70 align-top">
                      <td className="px-3 py-1 whitespace-nowrap">{wib(h.at)}</td>
                      <td className="px-2 py-1">{h.group}</td>
                      <td className="px-2 py-1">{h.event}</td>
                      <td className="px-2 py-1">{h.by}</td>
                      <td className={`px-2 py-1 ${h.ok ? "text-emerald-300" : "text-rose-300"}`}>{h.ok ? (h.test ? "Tes terkirim" : "Berhasil") : `Gagal: ${h.reason || "-"}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      </div>

      {/* Actions */}
      <div className="lg:col-span-2 space-y-2">
        {progress && (
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}
        {notice && <p className={`text-xs break-words ${notice.ok ? "text-emerald-300" : "text-rose-300"}`}>{notice.message}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={sendTest} disabled={busy !== null || !message.trim()} className={`${btn} border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-slate-200`}>
            {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Kirim tes ke saya
          </button>
          {failed.length > 0 && (
            <button type="button" onClick={() => send(failed)} disabled={busy !== null} className={`${btn} border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 font-bold`}>
              Kirim ulang yang gagal ({failed.length})
            </button>
          )}
          <button type="button" onClick={() => send(picked)} disabled={busy !== null || picked.length === 0 || !message.trim()} className={`${btn} px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold`}>
            {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
            Kirim ke {picked.length} grup
          </button>
        </div>
      </div>
    </div>
  );
}
