import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, Search, XCircle } from "lucide-react";

export interface WaStaffMember {
  uid: string;
  name: string;
  role: string;
  active: boolean;
  hasPhone: boolean;
  phone: string; // masked by the server
}

export type WaSendStatus = { status: "terkirim" | "gagal"; reason: string | null };

/**
 * Chooses WhatsApp recipients: all active members, by role (e.g. only finance)
 * or a manual pick. Shows each person's number state and send result.
 */
export default function WaRecipientPicker({
  staff,
  statuses,
  onChange,
}: {
  staff: WaStaffMember[] | null;
  statuses: Record<string, WaSendStatus>;
  onChange: (selected: WaStaffMember[]) => void;
}) {
  const [mode, setMode] = useState<"all" | "role" | "manual">("all");
  const [roles, setRoles] = useState<string[]>([]);
  const [manual, setManual] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const active = useMemo(() => (staff || []).filter((s) => s.active), [staff]);
  const allRoles = useMemo(() => [...new Set(active.map((s) => s.role))].sort(), [active]);
  const selected = useMemo(() => {
    if (mode === "all") return active;
    if (mode === "role") return active.filter((s) => roles.includes(s.role));
    return active.filter((s) => manual.includes(s.uid));
  }, [mode, active, roles, manual]);

  useEffect(() => onChange(selected), [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = mode === "manual" ? active.filter((s) => !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())) : selected;
  const chip = (on: boolean) =>
    `px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${on ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"}`;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setMode("all")} className={chip(mode === "all")}>Semua akun aktif</button>
        <button type="button" onClick={() => setMode("role")} className={chip(mode === "role")}>Per peran</button>
        <button type="button" onClick={() => setMode("manual")} className={chip(mode === "manual")}>Pilih manual</button>
      </div>
      {mode === "role" && (
        <div className="flex flex-wrap gap-1.5">
          {allRoles.map((r) => (
            <label key={r} className={`${chip(roles.includes(r))} inline-flex items-center gap-1.5 capitalize`}>
              <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} className="sr-only" />
              {r}
            </label>
          ))}
        </div>
      )}
      {mode === "manual" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama..." className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none" />
          </div>
          <button type="button" onClick={() => setManual(active.map((s) => s.uid))} className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer">Pilih semua</button>
          <button type="button" onClick={() => setManual([])} className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer">Kosongkan</button>
        </div>
      )}
      <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/80 max-h-[42vh] overflow-y-auto">
        {staff === null && (
          <div className="p-3 text-xs text-slate-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat akun...
          </div>
        )}
        {staff !== null && shown.length === 0 && <p className="p-3 text-xs text-slate-500">Belum ada penerima dipilih.</p>}
        {shown.map((s) => {
          const st = statuses[s.uid];
          return (
            <label key={s.uid} className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer">
              {mode === "manual" && (
                <input type="checkbox" checked={manual.includes(s.uid)} onChange={(e) => setManual(e.target.checked ? [...manual, s.uid] : manual.filter((u) => u !== s.uid))} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-slate-100 font-semibold truncate">
                  {s.name} <span className="text-slate-500 font-normal capitalize">· {s.role}</span>
                </p>
                <p className="text-[10px] font-mono text-slate-500">{s.hasPhone ? s.phone : "No. HP belum diisi"}</p>
                {st?.status === "gagal" && st.reason && <p className="text-[10px] text-rose-300">{st.reason}</p>}
              </div>
              {st ? (
                <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase ${st.status === "terkirim" ? "text-emerald-300" : "text-rose-300"}`}>
                  {st.status === "terkirim" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {st.status}
                </span>
              ) : (
                <Clock className="w-3 h-3 text-slate-600 shrink-0" />
              )}
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400">
        {selected.length} penerima dipilih · {selected.filter((s) => !s.hasPhone).length} tanpa No. HP
      </p>
    </div>
  );
}
