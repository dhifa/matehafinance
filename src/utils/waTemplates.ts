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

export const TEMPLATE_VARIABLES = ["nama", "acara", "tanggal", "call_time", "lokasi", "maps", "titik_kumpul", "pic", "rundown", "reimburse", "catatan"];

/** Point B page of the event, where crew log their expenses (reimburse). Same link as "Bagikan Point B". */
export function reimburseLink(origin: string, event: { id: string; isPointBClosed?: boolean }): string {
  return event.isPointBClosed ? "(input reimburse sedang ditutup admin)" : `${origin}/?shareProject=${event.id}`;
}

/** Where the crew gathers before leaving, unless an event sets its own meeting point. */
export const DEFAULT_MEETING_POINT = "Kantor Mateha — https://maps.app.goo.gl/m1sABY77cMVRf3Zx8";

export const DEFAULT_EVENT_TEMPLATES: Record<EventBlastKind, string> = {
  info: [
    "Halo {nama} 👋",
    "",
    "*INFO EVENT — {acara}*",
    "📅 Tanggal: {tanggal}",
    "⏰ Call time: {call_time}",
    "📍 Lokasi: {lokasi}",
    "🗺️ Maps lokasi venue: {maps}",
    "🚩 Titik kumpul tim: {titik_kumpul}",
    "👤 PIC: {pic}",
    "📋 Rundown: {rundown}",
    "💸 Input reimburse: {reimburse}",
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
    "🗺️ Maps lokasi venue: {maps}",
    "🚩 Titik kumpul tim: {titik_kumpul}",
    "👤 PIC: {pic}",
    "💸 Input reimburse: {reimburse}",
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

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "07:00" → "07.00 WIB"; other text is kept as typed. */
export function formatCallTime(raw?: string): string {
  const t = (raw || "").trim();
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(t);
  return m ? `${m[1].padStart(2, "0")}.${m[2]} WIB` : t;
}

/** One date → "Jumat, 20 November 2026"; several → same as formatEventDates. */
export function formatEventDatesLong(dates: string[] | undefined, fallback = ""): string {
  const valid = (dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length !== 1) return formatEventDates(dates, fallback);
  const [y, m, d] = valid[0].split("-").map(Number);
  return `${DAYS[new Date(y, m - 1, d).getDay()]}, ${formatEventDates(valid)}`;
}

export interface GroupMessageInput {
  name: string;
  dates?: string[];
  date?: string;
  callTime?: string;
  location?: string;
  mapsUrl?: string;
  meetingPoint?: string;
  picName?: string;
  rundownUrl?: string;
  reimburse?: string;
  crewNotes?: string;
  crew: string; // one "Nama, Peran" per line
}

/**
 * Event info for a WhatsApp crew group: WhatsApp *bold*, no emoji, and no
 * personal data (payslips only ever go to each person's own number).
 */
export function buildGroupMessage(e: GroupMessageInput): string {
  const line = (label: string, value?: string) => (value && value.trim() && value.trim() !== "-" ? `${label}: ${value.trim()}` : null);
  const crew = e.crew
    .split("\n")
    .map((l) => l.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean)
    .map((l) => `- ${l}`);
  const blocks: (string | null)[][] = [
    [`*INFO EVENT: ${e.name.trim() || "-"}*`],
    [
      line("Tanggal", formatEventDatesLong(e.dates, e.date)),
      line("Call time", formatCallTime(e.callTime)),
      line("Lokasi", e.location),
      line("Maps lokasi", e.mapsUrl),
      line("Titik kumpul", e.meetingPoint || DEFAULT_MEETING_POINT.replace(" — ", ", ")),
      line("PIC", e.picName),
    ],
    crew.length ? ["*Kru bertugas:*", ...crew] : [],
    [line("Rundown", e.rundownUrl), line("Input reimburse", e.reimburse), line("Catatan", e.crewNotes)],
    ["Mohon konfirmasi kehadiran di grup ini. Terima kasih."],
  ];
  return blocks
    .map((b) => b.filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}
