import React, { useEffect, useState } from "react";
import { Loader2, Megaphone, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { apiFetch as aiFetch } from "../lib/api";
import { renderTemplate } from "../utils/waTemplates";
import WaRecipientPicker, { WaSendStatus, WaStaffMember } from "./WaRecipientPicker";

const BATCH = 5;
const VARIABLES = ["nama", "peran", "username", "password", "link_login", "pengirim"];
const ADMIN_ONLY_TEMPLATE = "Info Akun & Login";
const QUICK_TEMPLATES: { label: string; text: string }[] = [
  {
    label: "Pengumuman",
    text: "Halo {nama} 👋\n\n📢 *PENGUMUMAN*\n\n[tulis pengumuman di sini]\n\nTerima kasih,\n{pengirim} — Mateha Production",
  },
  {
    label: "Rapat / Briefing",
    text: "Halo {nama},\n\n📅 *UNDANGAN RAPAT*\nHari/Tanggal: [isi]\nJam: [isi]\nTempat: Kantor Mateha — https://maps.app.goo.gl/m1sABY77cMVRf3Zx8\nAgenda: [isi]\n\nMohon hadir tepat waktu ya. Terima kasih!\n— {pengirim}",
  },
  {
    label: "Info Akun & Login",
    text: [
      "Halo {nama} 👋",
      "",
      "🔐 *INFO AKUN MATEHA FINANCE*",
      "Berikut detail akun Anda:",
      "👤 Username: *{username}*",
      "🏷️ Peran: {peran}",
      "🌐 Link login: {link_login}",
      "🔑 Password: *{password}*",
      "_(Password ini baru dibuat. Password lama tidak berlaku lagi.)_",
      "",
      "*Cara login*",
      "1. Buka {link_login}",
      "2. Isi kolom *Username atau Email* dengan: {username}",
      "3. Isi *Kata Sandi*, lalu tekan *Masuk ke Sistem*",
      "",
      "*Cara ganti password*",
      "1. Setelah login, di HP tekan *Menu* (pojok kanan bawah) → *Ganti Password*. Di laptop/PC, klik tombol *Password* di kiri bawah (di bawah nama Anda).",
      "2. Isi password lama, lalu password baru (minimal 6 karakter) dua kali.",
      "3. Tekan *Simpan Password Baru*. Login berikutnya pakai password baru.",
      "",
      "Mohon segera ganti password Anda dan jangan bagikan ke siapa pun ya. 🙏",
      "— {pengirim}, Mateha Production",
    ].join("\n"),
  },
  {
    label: "Pengingat Finance",
    text: "Halo {nama},\n\n🔔 *PENGINGAT*\nMohon segera [cek invoice jatuh tempo / rekap pembayaran / laporan kas] hari ini.\n\nTerima kasih,\n{pengirim}",
  },
];

/**
 * Free-text WhatsApp broadcast to chosen accounts (everyone, by role such as
 * finance, or a manual pick). Phone numbers are looked up on the server.
 */
export default function BroadcastView({ currentUserName, isAdmin }: { currentUserName: string; isAdmin: boolean }) {
  const draftKey = "mateha_wa_broadcast_draft";
  const [message, setMessage] = useState<string>(() => {
    try {
      return localStorage.getItem(draftKey) || QUICK_TEMPLATES[0].text;
    } catch {
      return QUICK_TEMPLATES[0].text;
    }
  });
  const [staff, setStaff] = useState<WaStaffMember[] | null>(null);
  const [selected, setSelected] = useState<WaStaffMember[]>([]);
  const [statuses, setStatuses] = useState<Record<string, WaSendStatus>>({});
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    aiFetch<{ staff: WaStaffMember[] }>("/wa/staff")
      .then((r) => setStaff(r.staff))
      .catch((err) => {
        setStaff([]);
        setNotice({ ok: false, text: err.message });
      });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, message);
    } catch {
      // Storage unavailable: the draft lasts until reload
    }
  }, [message]);

  const first = selected[0];
  const preview = renderTemplate(message, {
    nama: first?.name || "Nama Penerima",
    peran: first?.role || "staff",
    username: first?.username || "username",
    link_login: window.location.origin,
    password: "(password baru acak)",
    pengirim: currentUserName,
  });
  // {password} resets each recipient's password to a new random one on the server (admin only)
  const withPassword = message.includes("{password}");
  const templates = isAdmin ? QUICK_TEMPLATES : QUICK_TEMPLATES.filter((t) => t.label !== ADMIN_ONLY_TEMPLATE);
  const variables = isAdmin ? VARIABLES : VARIABLES.filter((v) => v !== "password");

  const sendTest = async () => {
    setBusy("test");
    setNotice(null);
    try {
      const res = await aiFetch<{ message: string }>("/wa/broadcast/send", { method: "POST", body: { message, mode: "test", origin: window.location.origin } });
      setNotice({ ok: true, text: res.message });
    } catch (err: any) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const send = async (targets: WaStaffMember[]) => {
    if (!targets.length || !message.trim()) return;
    const question = withPassword
      ? `Kirim pesan ini ke ${targets.length} orang?\n\nPASSWORD MEREKA AKAN DIGANTI dengan password baru acak (dikirim di pesan). Password lama tidak berlaku lagi dan mereka akan logout. Hanya diganti bila pesan berhasil terkirim.`
      : `Kirim pesan ini ke ${targets.length} orang via WhatsApp?`;
    if (!window.confirm(question)) return;
    setBusy("send");
    setNotice(null);
    setProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i += BATCH) {
        const chunk = targets.slice(i, i + BATCH);
        const res = await aiFetch<{ results: { uid: string; status: WaSendStatus["status"]; reason: string | null }[] }>("/wa/broadcast/send", {
          method: "POST",
          body: { message, mode: "send", recipients: chunk.map((c) => c.uid), origin: window.location.origin },
        });
        setStatuses((prev) => ({ ...prev, ...Object.fromEntries(res.results.map((r) => [r.uid, { status: r.status, reason: r.reason }])) }));
        setProgress({ done: Math.min(targets.length, i + BATCH), total: targets.length });
      }
      setNotice({ ok: true, text: "Broadcast selesai. Periksa status per orang." });
    } catch (err: any) {
      setNotice({ ok: false, text: `Pengiriman terhenti: ${err.message}` });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const failed = selected.filter((s) => statuses[s.uid]?.status === "gagal");

  return (
    <div className="space-y-5">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-6">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-emerald-400" /> Broadcast WhatsApp
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Kirim pesan bebas ke akun tim: semua, per peran (mis. hanya <strong>finance</strong>), atau pilih manual. Setiap orang menerima pesan dengan
          namanya sendiri. Nomor diambil dari No. HP di Manajemen Staff.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 mr-1">Template cepat:</span>
            {templates.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => (message.trim() && message !== t.text && !window.confirm("Ganti isi pesan dengan template ini?") ? null : setMessage(t.text))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border bg-slate-950 border-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={12}
            maxLength={3000}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono leading-relaxed focus:outline-none"
            aria-label="Isi pesan broadcast"
          />
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-slate-500 mr-1">Variabel:</span>
            {variables.map((v) => (
              <button key={v} type="button" onClick={() => setMessage(`${message}{${v}}`)} className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] font-mono text-cyan-300 hover:bg-slate-700 cursor-pointer">
                {`{${v}}`}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-slate-500 font-mono">{message.length}/3000</span>
          </div>
          {withPassword && (
            <p className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
              <strong>{"{password}"}</strong> = setiap penerima dibuatkan <strong>password baru acak</strong>. Password lama mereka tidak berlaku lagi dan mereka
              akan logout. Password hanya diganti bila pesan berhasil terkirim; akun Anda sendiri dilewati. Pesan tes memakai contoh dan tidak mengganti
              password siapa pun.
              {!isAdmin && <span className="block mt-1 text-rose-300">Hanya admin yang bisa mengirim password.</span>}
            </p>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Pratinjau ({first?.name || "contoh"})</p>
            <pre className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-[#0b141a] p-3 text-[11px] text-slate-100 font-sans leading-relaxed max-h-64 overflow-y-auto">{preview}</pre>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4">
          <WaRecipientPicker staff={staff} statuses={statuses} onChange={setSelected} />
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 space-y-2">
        {progress && (
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}
        {notice && <p className={`text-xs ${notice.ok ? "text-emerald-300" : "text-rose-300"}`}>{notice.text}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={sendTest} disabled={busy !== null || !message.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer disabled:opacity-50">
            {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Kirim tes ke saya
          </button>
          {failed.length > 0 && (
            <button type="button" onClick={() => send(failed)} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-bold cursor-pointer disabled:opacity-50">
              <RotateCcw className="w-3.5 h-3.5" /> Kirim ulang yang gagal ({failed.length})
            </button>
          )}
          <button type="button" onClick={() => send(selected)} disabled={busy !== null || selected.length === 0 || !message.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40">
            {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Kirim ke {selected.length} orang
          </button>
        </div>
      </div>
    </div>
  );
}
