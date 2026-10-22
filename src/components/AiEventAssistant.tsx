import React, { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, Sparkles, CalendarDays, MapPin, AlertTriangle, CheckCircle2, RotateCcw, User } from "lucide-react";
import { apiFetch } from "../lib/api";
import { formatRupiah } from "../types";
import { formatMultiDates } from "../utils/date";

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

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SECTIONS: { key: "income" | "accommodation" | "feeDistribution"; label: string; tone: string }[] = [
  { key: "income", label: "A. Pemasukan", tone: "text-emerald-300" },
  { key: "accommodation", label: "B. Akomodasi & Operasional", tone: "text-rose-300" },
  { key: "feeDistribution", label: "D. Fee Kru", tone: "text-cyan-300" },
];

const EXAMPLE =
  "tgl 23 oktober ada event Bagimu Negeri di Mercure Lengkong, kita memberikan service 3 kamera streaming dan 1 VJ, matador 2";

const sum = (rows: AiDraftItem[]) => rows.reduce((s, r) => s + r.qty * r.expense, 0);

/**
 * Chat with the AI to draft a new event; the event is only created when the user confirms.
 */
export default function AiEventAssistant({ onCreate }: { onCreate: (draft: AiEventDraft) => Promise<void> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<AiEventDraft | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"chat" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", text: content }];
    setMessages(next);
    setInput("");
    setError(null);
    setBusy("chat");
    try {
      const res = await apiFetch<{ reply: string; missing: string[]; draft: AiEventDraft }>("/ai/event-draft", {
        method: "POST",
        body: { messages: next, draft },
      });
      setMessages([...next, { role: "assistant", text: res.reply }]);
      setDraft(res.draft);
      setMissing(res.missing || []);
    } catch (err: any) {
      setError(err?.message || "Asisten AI gagal merespons.");
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setMessages([]);
    setDraft(null);
    setMissing([]);
    setError(null);
  };

  const create = async () => {
    if (!draft || !draft.name.trim()) return;
    setBusy("create");
    setError(null);
    try {
      await onCreate(draft);
      reset();
    } catch (err: any) {
      setError(err?.message || "Gagal membuat event.");
    } finally {
      setBusy(null);
    }
  };

  const hasItems = !!draft && SECTIONS.some((s) => draft[s.key].length > 0);

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl mb-6">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            Asisten AI · Buat Event dari Chat
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Ceritakan event-nya, AI menyusun draf Lembar Kerja. Periksa dulu, lalu klik Buat Event.
          </p>
        </div>
        {(messages.length > 0 || draft) && (
          <button
            onClick={reset}
            disabled={busy !== null}
            className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-700 bg-slate-800/70 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mulai ulang</span>
          </button>
        )}
      </div>

      <div className={`grid grid-cols-1 ${draft ? "lg:grid-cols-2" : ""}`}>
        {/* Chat */}
        <div className="flex flex-col min-h-0">
          <div ref={listRef} className="px-4 sm:px-6 py-4 space-y-3 max-h-[380px] min-h-[160px] overflow-y-auto">
            {messages.length === 0 && (
              <div className="text-xs text-slate-400 space-y-2.5">
                <p>Contoh pesan:</p>
                <button
                  onClick={() => setInput(EXAMPLE)}
                  className="text-left w-full rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 px-3 py-2.5 text-cyan-100 cursor-pointer"
                >
                  “{EXAMPLE}”
                </button>
                <p className="text-slate-500">
                  Harga diambil dari riwayat event sebelumnya. Anda bisa mengoreksi lewat chat, misalnya “harga streaming 4,5 juta” atau
                  “tambahkan bensin dan tol”.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
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
                </div>
                {m.role === "user" && (
                  <div className="w-7 h-7 shrink-0 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                )}
              </div>
            ))}
            {busy === "chat" && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                AI sedang menyusun draf...
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
            className="px-4 sm:px-6 pb-4 pt-1 flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder={draft ? "Koreksi draf, mis. “harga VJ 1,5 juta”..." : "Ceritakan event-nya..."}
              className="flex-1 resize-none bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy !== null}
              className="h-11 w-11 shrink-0 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center cursor-pointer disabled:opacity-40"
              aria-label="Kirim"
            >
              {busy === "chat" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Draft preview */}
        {draft && (
          <div className="border-t lg:border-t-0 lg:border-l border-slate-800/80 bg-slate-950/40 px-4 sm:px-6 py-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Draf event</p>
              <h3 className="text-lg font-bold text-white mt-0.5">{draft.name || "(nama belum ada)"}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {draft.dates.length ? formatMultiDates(draft.dates) : "Tanggal belum ada"}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {draft.location || "Lokasi belum ada"}
                </span>
              </div>
            </div>

            {SECTIONS.map((s) =>
              draft[s.key].length > 0 ? (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className={`font-semibold ${s.tone}`}>{s.label}</span>
                    <span className="text-slate-300 font-semibold tabular-nums">{formatRupiah(sum(draft[s.key]))}</span>
                  </div>
                  <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/80">
                    {draft[s.key].map((r, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="text-slate-100 font-medium break-words">{r.description}</p>
                          <p className="text-slate-500 tabular-nums">
                            {r.qty} × {r.expense > 0 ? formatRupiah(r.expense) : <span className="text-amber-300">harga belum ada</span>}
                            {r.notes ? ` · ${r.notes}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-slate-200 tabular-nums">{formatRupiah(r.qty * r.expense)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}

            {!hasItems && <p className="text-xs text-slate-500 italic">Belum ada item RAB.</p>}

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
                <p className="mt-1 text-amber-200/70">Bisa juga dilengkapi nanti di Lembar Kerja.</p>
              </div>
            )}

            <button
              onClick={create}
              disabled={busy !== null || !draft.name.trim()}
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {busy === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Buat Event
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
