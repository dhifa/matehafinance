import React, { useEffect, useRef, useState } from "react";
import {
  Bot, Send, Loader2, Sparkles, CalendarDays, MapPin, AlertTriangle, CheckCircle2, RotateCcw, User,
  Brain, Pin, Trash2, Undo2, Plus, Pencil, X, FileText, Receipt, FileSignature, Coins, Paperclip,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { formatRupiah } from "../types";
import { formatDateString, formatMultiDates } from "../utils/date";
import { terbilang } from "../utils/numberToWords";
import { formatQty, formatTime, lineItemTotal, subItemAmount } from "../utils/lineItems";
import { ACCEPTED_TYPES, ChatAttachment, MAX_ATTACHMENTS, MAX_TOTAL_CHARS, prepareAttachment } from "../utils/chatAttachments";
import {
  AiDocItem, AiInvoiceDraft, AiKwitansiDraft, AiQuotationDraft,
  createInvoiceFromDraft, createKwitansiFromDraft, createQuotationFromDraft,
} from "../utils/aiDocuments";

export interface AiDraftItem {
  description: string;
  qty: number;
  expense: number;
  notes?: string;
}

export interface AiEventDraft {
  name: string;
  location: string;
  dates: string[];
  income: AiDraftItem[];
  accommodation: AiDraftItem[];
  feeDistribution: AiDraftItem[];
}

type Draft =
  | ({ type: "event" } & AiEventDraft)
  | ({ type: "invoice" } & AiInvoiceDraft)
  | ({ type: "quotation" } & AiQuotationDraft)
  | ({ type: "kwitansi" } & AiKwitansiDraft);

interface Memory {
  id: number;
  content: string;
  active: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** names of attached files (the files themselves are not kept) */
  attachments?: string[];
  /** set when this reply came with a draft */
  draftType?: Draft["type"];
  saved?: Memory[];
  forgotten?: Memory[];
}

interface AssistantResponse {
  reply: string;
  missing: string[];
  type: Draft["type"] | "none";
  draft: Draft | null;
  memoriesSaved: Memory[];
  memoriesForgotten: Memory[];
  memoryError: string | null;
}

const EVENT_SECTIONS: { key: "income" | "accommodation" | "feeDistribution"; label: string; tone: string }[] = [
  { key: "income", label: "A. Pemasukan", tone: "text-emerald-300" },
  { key: "accommodation", label: "B. Akomodasi & Operasional", tone: "text-rose-300" },
  { key: "feeDistribution", label: "D. Fee Kru", tone: "text-cyan-300" },
];

const TYPE_META: Record<Draft["type"], { label: string; action: string; icon: React.ComponentType<{ className?: string }> }> = {
  event: { label: "Draf Event", action: "Buat Event", icon: Coins },
  invoice: { label: "Draf Invoice", action: "Buat Invoice", icon: FileText },
  quotation: { label: "Draf Quotation", action: "Buat Quotation", icon: FileSignature },
  kwitansi: { label: "Draf Kwitansi", action: "Buat Kwitansi", icon: Receipt },
};

const EXAMPLES = [
  "tgl 23 oktober ada event Bagimu Negeri di Mercure Lengkong, kita memberikan service 3 kamera streaming dan 1 VJ, matador 2",
  "buatkan invoice DP 50% untuk event Bagimu Negeri",
  "kedepannya kalau ada live streaming, selalu tambahkan 1 operator zoom di fee kru",
  "ini invoice event AHM Inter, buatkan RAB eventnya ya (lampirkan gambar invoice dengan tombol 📎)",
];

const eventSum = (rows: AiDraftItem[]) => rows.reduce((s, r) => s + r.qty * r.expense, 0);
const docSum = (rows: AiDocItem[]) => rows.reduce((s, r) => s + lineItemTotal(r), 0);

function canCreate(d: Draft): boolean {
  if (d.type === "event") return !!d.name.trim();
  if (d.type === "kwitansi") return !!d.customerName.trim() && d.amount > 0;
  return !!d.customerName.trim() && d.items.length > 0;
}

/**
 * Dashboard chat assistant: drafts events, invoices, quotations and kwitansi from a
 * conversation and remembers the team's workflow rules. Nothing is created until
 * the user confirms the draft.
 */
export default function AiAssistant({
  storageKey,
  isAdmin,
  onCreateEvent,
  onDocumentCreated,
}: {
  storageKey: string;
  isAdmin: boolean;
  onCreateEvent: (draft: AiEventDraft) => Promise<void>;
  onDocumentCreated: (tab: "invoice" | "quotation" | "kwitansi", message: string) => void;
}) {
  const persistKey = `mateha_ai_chat_${storageKey}`;
  const restored = (() => {
    try {
      return JSON.parse(localStorage.getItem(persistKey) || "null");
    } catch {
      return null;
    }
  })();

  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages || []);
  const [draft, setDraft] = useState<Draft | null>(restored?.draft || null);
  const [missing, setMissing] = useState<string[]>(restored?.missing || []);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"chat" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(persistKey, JSON.stringify({ messages: messages.slice(-40), draft, missing }));
    } catch {
      // Storage unavailable: the conversation only lasts until reload
    }
  }, [persistKey, messages, draft, missing]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setAttaching(true);
    try {
      const room = MAX_ATTACHMENTS - attachments.length;
      if (room <= 0) throw new Error(`Maksimal ${MAX_ATTACHMENTS} lampiran per pesan.`);
      const prepared = await Promise.all(files.slice(0, room).map(prepareAttachment));
      const all = [...attachments, ...prepared];
      if (all.reduce((n, a) => n + a.data.length, 0) > MAX_TOTAL_CHARS) {
        throw new Error("Total lampiran terlalu besar. Kirim lebih sedikit file atau PDF yang lebih kecil.");
      }
      setAttachments(all);
      if (files.length > room) setError(`Hanya ${MAX_ATTACHMENTS} lampiran pertama yang dipakai.`);
    } catch (err: any) {
      setError(err?.message || "Lampiran gagal diproses.");
    } finally {
      setAttaching(false);
    }
  };

  const send = async (text: string) => {
    const files = attachments;
    const content = text.trim() || (files.length ? "Tolong baca lampiran ini." : "");
    if (!content || busy || attaching) return;
    const next: ChatMessage[] = [
      ...messages,
      { role: "user", text: content, ...(files.length ? { attachments: files.map((f) => f.name) } : {}) },
    ];
    setMessages(next);
    setInput("");
    setAttachments([]);
    setError(null);
    setBusy("chat");
    try {
      const res = await apiFetch<AssistantResponse>("/ai/assistant", {
        method: "POST",
        body: {
          messages: next.map(({ role, text, attachments: names }) => ({
            role,
            text: names?.length ? `${text}\n[lampiran: ${names.join(", ")}]` : text,
          })),
          draft,
          attachments: files.map(({ mimeType, data }) => ({ mimeType, data })),
        },
      });
      setMessages([
        ...next,
        {
          role: "assistant",
          text: res.reply,
          ...(res.draft ? { draftType: res.draft.type } : {}),
          saved: res.memoriesSaved,
          forgotten: res.memoriesForgotten,
        },
      ]);
      setDraft(res.draft);
      setMissing(res.draft ? res.missing || [] : []);
      if (res.memoryError) setError(res.memoryError);
    } catch (err: any) {
      setError(err?.message || "Asisten AI gagal merespons.");
      if (files.length) setAttachments(files); // let the user retry without re-attaching
    } finally {
      setBusy(null);
    }
  };

  const undoMemory = async (msgIndex: number, memory: Memory) => {
    try {
      await apiFetch(`/ai/memories/${memory.id}`, { method: "DELETE" });
      setMessages((prev) =>
        prev.map((m, i) => (i === msgIndex ? { ...m, saved: (m.saved || []).filter((s) => s.id !== memory.id) } : m))
      );
    } catch (err: any) {
      setError(err?.message || "Gagal membatalkan memori.");
    }
  };

  const reset = () => {
    setMessages([]);
    setAttachments([]);
    setDraft(null);
    setMissing([]);
    setError(null);
  };

  const create = async () => {
    if (!draft || !canCreate(draft)) return;
    setBusy("create");
    setError(null);
    try {
      if (draft.type === "event") {
        const { type: _t, ...event } = draft;
        await onCreateEvent(event);
        reset();
        return;
      }
      let note: string;
      if (draft.type === "invoice") {
        const inv = await createInvoiceFromDraft(draft);
        note = `Invoice ${inv.invoiceNumber} berhasil dibuat oleh Asisten AI!`;
      } else if (draft.type === "quotation") {
        const quo = await createQuotationFromDraft(draft);
        note = `Quotation ${quo.quotationNumber} berhasil dibuat oleh Asisten AI!`;
      } else {
        const kwt = await createKwitansiFromDraft(draft);
        note = `Kwitansi ${kwt.kwitansiNumber} berhasil dibuat oleh Asisten AI!`;
      }
      const tab = draft.type;
      setMessages((prev) => [...prev, { role: "assistant", text: `✅ ${note}` }]);
      setDraft(null);
      setMissing([]);
      onDocumentCreated(tab, note);
    } catch (err: any) {
      setError(err?.message || "Gagal membuat dokumen.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl mb-6">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            Asisten AI
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Buat event, invoice, quotation, atau kwitansi lewat chat. AI juga mengingat aturan kerja yang Anda ajarkan.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              onClick={() => setShowMemory(!showMemory)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs cursor-pointer ${
                showMemory ? "border-violet-500/50 bg-violet-500/15 text-violet-200" : "border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Memori AI</span>
            </button>
          )}
          {(messages.length > 0 || draft) && (
            <button
              onClick={reset}
              disabled={busy !== null}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-700 bg-slate-800/70 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mulai ulang</span>
            </button>
          )}
        </div>
      </div>

      {showMemory && isAdmin && <MemoryPanel onClose={() => setShowMemory(false)} />}

      <div className={`grid grid-cols-1 ${draft ? "lg:grid-cols-2" : ""}`}>
        {/* Chat */}
        <div className="flex flex-col min-h-0">
          <div ref={listRef} className="px-4 sm:px-6 py-4 space-y-3 max-h-[420px] min-h-[160px] overflow-y-auto">
            {messages.length === 0 && (
              <div className="text-xs text-slate-400 space-y-2">
                <p>Contoh pesan:</p>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setInput(ex)}
                    className="block text-left w-full rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 px-3 py-2 text-cyan-100 cursor-pointer"
                  >
                    “{ex}”
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="space-y-1.5">
                <div className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="w-7 h-7 shrink-0 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-cyan-500 text-slate-950 rounded-br-md"
                        : "bg-slate-800/80 text-slate-100 border border-slate-700/60 rounded-bl-md"
                    }`}
                  >
                    {m.text}
                    {(m.attachments || []).length > 0 && (
                      <span className={`mt-1 flex flex-wrap gap-1 text-[11px] ${m.role === "user" ? "text-slate-900/80" : "text-slate-400"}`}>
                        {m.attachments!.map((name, j) => (
                          <span key={j} className="inline-flex items-center gap-1 rounded-md bg-black/10 px-1.5 py-0.5">
                            <Paperclip className="w-3 h-3" /> {name}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="w-7 h-7 shrink-0 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  )}
                </div>
                {m.draftType && draft?.type === m.draftType && i === messages.length - 1 && (
                  <div className="ml-9 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
                    <span className="flex-1 min-w-[10rem]">
                      {TYPE_META[m.draftType].label} siap. Belum tersimpan sampai Anda klik <strong>{TYPE_META[m.draftType].action}</strong>.
                    </span>
                    <button
                      onClick={() => draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="shrink-0 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-2.5 py-1 font-semibold text-slate-950 cursor-pointer"
                    >
                      Lihat draf
                    </button>
                  </div>
                )}
                {(m.saved || []).map((mem) => (
                  <div key={`s${mem.id}`} className="ml-9 flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
                    <Pin className="w-3.5 h-3.5 mt-px shrink-0 text-violet-300" />
                    <span className="flex-1">
                      <strong>Diingat:</strong> {mem.content}
                    </span>
                    <button onClick={() => undoMemory(i, mem)} className="shrink-0 flex items-center gap-1 text-violet-300 hover:text-white cursor-pointer">
                      <Undo2 className="w-3.5 h-3.5" /> Batalkan
                    </button>
                  </div>
                ))}
                {(m.forgotten || []).map((mem) => (
                  <div key={`f${mem.id}`} className="ml-9 flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
                    <Trash2 className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
                    <span>
                      <strong>Dilupakan:</strong> <span className="line-through">{mem.content}</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {busy === "chat" && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                {messages[messages.length - 1]?.attachments?.length ? "AI sedang membaca lampiran..." : "AI sedang berpikir..."}
              </div>
            )}
          </div>

          {error && (
            <p className="mx-4 sm:mx-6 mb-2 flex items-start gap-1.5 text-xs text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="px-4 sm:px-6 pb-4 pt-1 space-y-2"
          >
            {(attachments.length > 0 || attaching) && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={i} className="relative group">
                    {a.preview ? (
                      <img src={a.preview} alt={a.name} className="h-16 w-16 rounded-lg object-cover border border-slate-700" />
                    ) : (
                      <div className="h-16 w-16 rounded-lg border border-slate-700 bg-slate-800 flex flex-col items-center justify-center text-[10px] text-slate-300 px-1">
                        <FileText className="w-5 h-5 text-rose-300" />
                        <span className="truncate w-full text-center">{a.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-900 border border-slate-600 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                      aria-label={`Hapus ${a.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {attaching && (
                  <div className="h-16 w-16 rounded-lg border border-dashed border-slate-700 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy !== null || attaching || attachments.length >= MAX_ATTACHMENTS}
                className="h-11 w-11 shrink-0 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer disabled:opacity-40"
                aria-label="Lampirkan gambar atau PDF"
                title="Lampirkan gambar/PDF (invoice, RAB, daftar kebutuhan)"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files as FileList).filter((f: File) => f.type.startsWith("image/") || f.type === "application/pdf");
                  if (files.length) {
                    e.preventDefault();
                    addFiles(files);
                  }
                }}
                rows={2}
                placeholder={
                  attachments.length
                    ? "Jelaskan lampirannya, mis. “ini invoice event AHM Inter, buatkan RAB eventnya”"
                    : draft
                      ? "Koreksi draf, mis. “harga VJ 1,5 juta”..."
                      : "Ketik permintaan, atau lampirkan gambar invoice dengan 📎"
                }
                className="flex-1 resize-none bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={(!input.trim() && attachments.length === 0) || busy !== null || attaching}
                className="h-11 w-11 shrink-0 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center cursor-pointer disabled:opacity-40"
                aria-label="Kirim"
              >
                {busy === "chat" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </div>

        {/* Draft preview */}
        {draft && (
          <div ref={draftRef} className="scroll-mt-4 border-t lg:border-t-0 lg:border-l border-slate-800/80 bg-slate-950/40 px-4 sm:px-6 py-4 space-y-4">
            <DraftPreview draft={draft} />

            {missing.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <p className="font-semibold flex items-center gap-1.5 mb-0.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Masih perlu dilengkapi
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {missing.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={create}
              disabled={busy !== null || !canCreate(draft)}
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {busy === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {TYPE_META[draft.type].action}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft previews
// ---------------------------------------------------------------------------

function DraftPreview({ draft }: { draft: Draft }) {
  const meta = TYPE_META[draft.type];
  const Icon = meta.icon;

  const header = (title: string, lines: React.ReactNode[]) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {meta.label}
      </p>
      <h3 className="text-lg font-bold text-white mt-0.5 break-words">{title}</h3>
      <div className="flex flex-col gap-0.5 mt-1 text-xs text-slate-400">{lines}</div>
    </div>
  );

  if (draft.type === "event") {
    const hasItems = EVENT_SECTIONS.some((s) => draft[s.key].length > 0);
    return (
      <>
        {header(draft.name || "(nama belum ada)", [
          <span key="d" className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            {draft.dates.length ? formatMultiDates(draft.dates) : "Tanggal belum ada"}
          </span>,
          <span key="l" className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {draft.location || "Lokasi belum ada"}
          </span>,
        ])}
        {EVENT_SECTIONS.map((s) =>
          draft[s.key].length > 0 ? (
            <React.Fragment key={s.key}>
              <ItemList
                title={s.label}
                tone={s.tone}
                total={eventSum(draft[s.key])}
                rows={draft[s.key].map((r) => ({ description: r.description, qty: r.qty, price: r.expense, note: r.notes }))}
              />
            </React.Fragment>
          ) : null
        )}
        {!hasItems && <p className="text-xs text-slate-500 italic">Belum ada item RAB.</p>}
      </>
    );
  }

  if (draft.type === "kwitansi") {
    return (
      <>
        {header(draft.customerName || "(nama pembayar belum ada)", [
          <span key="d">Tanggal: {formatDateString(draft.date)}</span>,
          draft.invoiceNumber ? <span key="i">Untuk invoice: {draft.invoiceNumber}</span> : null,
        ])}
        <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/80 text-xs">
          <Row label="Jumlah" value={<span className="text-base font-bold text-emerald-300">{formatRupiah(draft.amount)}</span>} />
          <Row label="Terbilang" value={<span className="italic">{draft.amount > 0 ? `${terbilang(draft.amount)} Rupiah` : "-"}</span>} />
          <Row label="Untuk pembayaran" value={draft.paymentFor || "-"} />
          <Row label="Metode" value={draft.paymentMethod || "-"} />
        </div>
      </>
    );
  }

  const total = docSum(draft.items);
  const isInvoice = draft.type === "invoice";
  const dp = isInvoice && draft.isDp ? Math.round((total * draft.dpPercent) / 100) : 0;
  return (
    <>
      {header(draft.customerName || "(nama klien belum ada)", [
        draft.customerContact || draft.customerPhone ? (
          <span key="c">
            {[draft.customerContact && `PIC: ${draft.customerContact}`, draft.customerPhone].filter(Boolean).join(" · ")}
          </span>
        ) : null,
        <span key="s">Perihal: {draft.subject || (isInvoice ? "Tagihan Layanan Event" : "Penawaran Kerjasama Acara")}</span>,
        <span key="d">
          Tanggal: {formatDateString(draft.date)}
          {isInvoice && draft.dueDate ? ` · Jatuh tempo: ${formatDateString(draft.dueDate)}` : ""}
          {!isInvoice ? ` · Berlaku hingga: ${formatDateString(draft.validUntil)}` : ""}
        </span>,
      ])}
      {draft.items.length > 0 ? (
        <ItemList title="Rincian item" tone="text-emerald-300" total={total} rows={draft.items} />
      ) : (
        <p className="text-xs text-slate-500 italic">Belum ada item.</p>
      )}
      {isInvoice && draft.isDp && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 space-y-0.5">
          <div className="flex justify-between"><span>Tagihan DP {draft.dpPercent}%</span><strong>{formatRupiah(dp)}</strong></div>
          <div className="flex justify-between text-amber-200/70"><span>Sisa pelunasan</span><span>{formatRupiah(total - dp)}</span></div>
        </div>
      )}
    </>
  );
}

function ItemList({
  title, tone, total, rows,
}: {
  title: string;
  tone: string;
  total: number;
  rows: AiDocItem[] | { description: string; qty: number; price: number; note?: string }[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className={`font-semibold ${tone}`}>{title}</span>
        <span className="text-slate-300 font-semibold tabular-nums">{formatRupiah(total)}</span>
      </div>
      <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/80">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="text-slate-100 font-medium break-words whitespace-pre-line">{r.description}</p>
              <p className="text-slate-500 tabular-nums">
                {formatQty(r.qty, "unit" in r ? r.unit : undefined)}
                {"days" in r && ((r.days || 1) > 1 || r.timeUnit) && ` × ${formatTime(r.days, r.timeUnit)}`}
                {" × "}{r.price > 0 ? formatRupiah(r.price) : <span className="text-amber-300">harga belum ada</span>}
                {"note" in r && r.note ? ` · ${r.note}` : ""}
              </p>
              {"subItems" in r && (r.subItems || []).map((sub, j) => (
                <p key={j} className="text-slate-400 pl-2 border-l border-slate-700">
                  {sub.description} ({formatQty(sub.qty, sub.unit)})
                  {subItemAmount(sub) > 0 && <span className="text-amber-300"> + {formatRupiah(subItemAmount(sub))}</span>}
                </p>
              ))}
            </div>
            <span className="shrink-0 text-slate-200 tabular-nums">{formatRupiah(lineItemTotal(r))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-3 py-2">
      <span className="w-28 shrink-0 text-slate-500">{label}</span>
      <span className="flex-1 text-slate-100 break-words">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory panel (admin)
// ---------------------------------------------------------------------------

function MemoryPanel({ onClose }: { onClose: () => void }) {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [newRule, setNewRule] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    apiFetch<{ memories: Memory[] }>("/ai/memories")
      .then((r) => setMemories(r.memories))
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err: any) {
      setError(err?.message || "Terjadi kesalahan.");
    }
  };

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-slate-800/80 bg-violet-500/5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-violet-200 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" /> Memori AI · aturan kerja yang selalu diikuti asisten
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Ajarkan lewat chat (“kedepannya kalau…”) atau tambahkan di sini. Nonaktifkan untuk menyimpan tanpa dipakai.
          </p>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white cursor-pointer" aria-label="Tutup memori">
          <X className="w-4 h-4" />
        </button>
      </div>

      {memories === null ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat...</p>
      ) : memories.length === 0 ? (
        <p className="text-xs text-slate-500 italic">Belum ada aturan yang diingat.</p>
      ) : (
        <ul className="space-y-1.5 max-h-60 overflow-y-auto">
          {memories.map((m) => (
            <li key={m.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${m.active ? "border-violet-500/30 bg-slate-900/70" : "border-slate-800 bg-slate-900/40 opacity-60"}`}>
              <input
                type="checkbox"
                checked={m.active}
                onChange={() => run(() => apiFetch(`/ai/memories/${m.id}`, { method: "PATCH", body: { active: !m.active } }))}
                className="mt-0.5 accent-violet-500 cursor-pointer"
                title={m.active ? "Nonaktifkan" : "Aktifkan"}
              />
              {editing?.id === m.id ? (
                <div className="flex-1 flex gap-1.5">
                  <input
                    value={editing.text}
                    onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-100 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    onClick={() => run(async () => { await apiFetch(`/ai/memories/${m.id}`, { method: "PATCH", body: { content: editing.text } }); setEditing(null); })}
                    className="px-2 rounded-lg bg-violet-500 text-white cursor-pointer"
                  >
                    Simpan
                  </button>
                </div>
              ) : (
                <span className="flex-1 text-slate-200 break-words">{m.content}</span>
              )}
              {editing?.id !== m.id && (
                <button onClick={() => setEditing({ id: m.id, text: m.content })} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => window.confirm("Hapus aturan ini dari memori AI?") && run(() => apiFetch(`/ai/memories/${m.id}`, { method: "DELETE" }))}
                className="text-slate-400 hover:text-rose-300 cursor-pointer"
                aria-label="Hapus"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newRule.trim()) return;
          run(async () => {
            await apiFetch("/ai/memories", { method: "POST", body: { content: newRule } });
            setNewRule("");
          });
        }}
        className="flex gap-2"
      >
        <input
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          placeholder="Tambah aturan, mis. “Harga VJ standar Rp 2.000.000”"
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-violet-500/60 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button type="submit" disabled={!newRule.trim()} className="flex items-center gap-1 px-3 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-xs font-semibold cursor-pointer disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" /> Tambah
        </button>
      </form>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
