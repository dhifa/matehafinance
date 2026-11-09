/**
 * WhatsApp message templates for event blasts. Variables in {curly braces} are
 * filled per recipient on the server; admins can edit and save the templates
 * (settings/wa_templates).
 */

export type EventBlastKind = "info" | "perubahan" | "pembatalan";

export const EVENT_BLAST_KINDS: { key: EventBlastKind; label: string }[] = [
  { key: "info", label: "Info Event" },
  { key: "perubahan", label: "Perubahan Jadwal" },
  { key: "pembatalan", label: "Pembatalan" },
];

export const TEMPLATE_VARIABLES = ["nama", "acara", "tanggal", "call_time", "lokasi", "maps", "pic", "rundown", "catatan"];

export const DEFAULT_EVENT_TEMPLATES: Record<EventBlastKind, string> = {
  info: [
    "Halo {nama} 👋",
    "",
    "*INFO EVENT — {acara}*",
    "📅 Tanggal: {tanggal}",
    "⏰ Call time: {call_time}",
    "📍 Lokasi: {lokasi}",
    "🗺️ Maps: {maps}",
    "👤 PIC: {pic}",
    "📋 Rundown: {rundown}",
    "📝 Catatan: {catatan}",
    "",
    "Mohon konfirmasi kehadiran ya. Terima kasih! 🙏",
    "— Mateha Production",
  ].join("\n"),
  perubahan: [
    "Halo {nama},",
    "",
    "⚠️ *PERUBAHAN JADWAL — {acara}*",
    "Jadwal terbaru:",
    "📅 Tanggal: {tanggal}",
    "⏰ Call time: {call_time}",
    "📍 Lokasi: {lokasi}",
    "🗺️ Maps: {maps}",
    "👤 PIC: {pic}",
    "",
    "Mohon sesuaikan jadwal Anda. Terima kasih 🙏",
    "— Mateha Production",
  ].join("\n"),
  pembatalan: [
    "Halo {nama},",
    "",
    "❌ *PEMBATALAN EVENT — {acara}* ({tanggal})",
    "Event ini dibatalkan. Mohon abaikan jadwal sebelumnya.",
    "Info lebih lanjut hubungi PIC: {pic}.",
    "",
    "Terima kasih atas pengertiannya 🙏",
    "— Mateha Production",
  ].join("\n"),
};

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** ["2026-11-17","2026-11-18"] → "17, 18 November 2026" (same as the server). */
export function formatEventDates(dates: string[] | undefined, fallback = ""): string {
  const parsed = (dates || [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .map((d) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1, d: Number(d.slice(8, 10)) }));
  if (!parsed.length) return fallback || "-";
  const groups: string[] = [];
  let i = 0;
  while (i < parsed.length) {
    const { y, m } = parsed[i];
    const days: number[] = [];
    while (i < parsed.length && parsed[i].y === y && parsed[i].m === m) days.push(parsed[i++].d);
    groups.push(`${days.join(", ")} ${MONTHS[m]} ${y}`);
  }
  return groups.join(" & ");
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? vars[key] : all));
}
