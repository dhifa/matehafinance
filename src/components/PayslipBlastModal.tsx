import React, { useMemo, useState } from "react";
import { Check, Copy, MessageCircle, X } from "lucide-react";

interface Props {
  periodLabel: string; // e.g. "Oktober 2026"
  releasedNames: string[]; // staff whose payslip for the period is released
  draftCount: number;
  onClose: () => void;
  onNotify: (text: string, type?: "success" | "info" | "error") => void;
}

const CEO_NAME = "Dhifa Aksa Hermawan";

function buildMessage(periodLabel: string, names: string[], includeNames: boolean, siteUrl: string): string {
  const lines = [
    "*📢 INFO SLIP GAJI — MATEHA PRODUCTION*",
    `*Periode: ${periodLabel}*`,
    "",
    "Halo tim Mateha! 👋",
    `Slip gaji periode *${periodLabel}* sudah *RILIS* dan bisa dicek di website:`,
    `🔗 ${siteUrl}`,
  ];
  if (includeNames && names.length > 0) {
    lines.push("", `Slip yang sudah rilis (${names.length} orang):`, ...names.map((n, i) => `${i + 1}. ${n}`));
  }
  lines.push(
    "",
    "*Yang perlu dilakukan:*",
    `1️⃣ Login ke website, buka menu *Staff Payslip*, lalu pilih periode *${periodLabel}*.`,
    "2️⃣ Cek rincian honor/fee, reimburse, dan potongan kasbon kamu.",
    "3️⃣ ✅ Jika sudah *SESUAI*: klik tombol *Ajukan Pencairan Gaji* di halaman slip gaji.",
    `4️⃣ ❗ Jika *BELUM SESUAI*: jangan ajukan pencairan dulu, langsung komplain ke CEO (*${CEO_NAME}*) dan sebutkan bagian yang tidak sesuai.`,
    "",
    "Terima kasih atas kerja kerasnya! 🙏"
  );
  return lines.join("\n");
}

/**
 * Prepares the WhatsApp announcement for the team group after payslips are
 * released. WhatsApp links can't target a group directly, so "Buka WhatsApp"
 * opens the share screen where the admin picks the Mateha group.
 */
export default function PayslipBlastModal({ periodLabel, releasedNames, draftCount, onClose, onNotify }: Props) {
  const [includeNames, setIncludeNames] = useState(true);
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const generated = useMemo(
    () => buildMessage(periodLabel, releasedNames, includeNames, siteUrl),
    [periodLabel, releasedNames, includeNames, siteUrl]
  );
  const [text, setText] = useState(generated);
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const message = edited ? text : generated;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      onNotify("Teks pengumuman disalin. Tempel di grup WhatsApp Mateha.", "success");
    } catch {
      onNotify("Gagal menyalin otomatis. Blok teksnya lalu salin manual.", "error");
    }
  };

  const openWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div
        className="bg-[#0e121a] border border-slate-750 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payslip-blast-title"
      >
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3 bg-[#080b11]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="payslip-blast-title" className="text-sm font-bold text-white">Blast WhatsApp: Gaji Sudah Rilis</h3>
              <p className="text-[11px] text-slate-400">Periode {periodLabel} · {releasedNames.length} slip rilis</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {releasedNames.length === 0 ? (
            <p className="text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 px-3 py-2">
              Belum ada slip gaji yang dirilis untuk periode ini. Rilis dulu slip gajinya sebelum mengirim pengumuman.
            </p>
          ) : draftCount > 0 ? (
            <p className="text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 px-3 py-2">
              Masih ada {draftCount} slip berstatus Draft di periode ini. Staf tersebut belum bisa melihat slip resminya.
            </p>
          ) : null}

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeNames}
              onChange={(e) => {
                setIncludeNames(e.target.checked);
                setEdited(false);
              }}
            />
            Sertakan daftar nama staf yang slipnya sudah rilis (tanpa nominal)
          </label>

          <textarea
            value={message}
            onChange={(e) => {
              setText(e.target.value);
              setEdited(true);
            }}
            rows={16}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-mono leading-relaxed focus:outline-none"
            aria-label="Isi pesan WhatsApp"
          />
          {edited && (
            <button type="button" onClick={() => setEdited(false)} className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer">
              Kembalikan ke teks otomatis
            </button>
          )}
          <p className="text-[11px] text-slate-500">
            Tombol <strong>Buka WhatsApp</strong> membuka WhatsApp dengan pesan ini; pilih grup Mateha sebagai tujuan, lalu kirim.
          </p>
        </div>

        <div className="p-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? "Tersalin" : "Salin Teks"}
          </button>
          <button
            type="button"
            onClick={openWhatsApp}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            Buka WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
