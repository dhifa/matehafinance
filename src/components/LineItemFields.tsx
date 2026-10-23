import React from "react";
import { ListPlus, Trash2 } from "lucide-react";
import { formatRupiah } from "../types";
import {
  LineItemDraft,
  QTY_UNITS,
  SubItemDraft,
  TIME_UNITS,
  emptySubItem,
  lineItemTotal,
  mainAmount,
  subItemAmount,
} from "../utils/lineItems";

const ACCENTS = {
  blue: { focus: "focus:border-blue-500", text: "text-blue-400", hover: "hover:text-blue-300" },
  cyan: { focus: "focus:border-cyan-500", text: "text-cyan-400", hover: "hover:text-cyan-300" },
};

interface Props {
  draft: LineItemDraft;
  onChange: (draft: LineItemDraft) => void;
  accent: keyof typeof ACCENTS;
  /** Prefix for datalist ids, unique per form on the page. */
  idPrefix: string;
}

const num = (v: string) => parseInt(v) || 0;

/**
 * Qty/unit, time/unit, unit price and the "poin" detail lines of an invoice or
 * quotation item. A poin with a price is an add-cost; without one it is just a detail.
 */
export default function LineItemFields({ draft, onChange, accent, idPrefix }: Props) {
  const a = ACCENTS[accent];
  const input = `w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-xs text-white focus:outline-none ${a.focus}`;
  const label = "text-[10px] text-slate-400 font-semibold mb-1 block";
  const set = (patch: Partial<LineItemDraft>) => onChange({ ...draft, ...patch });
  const setSub = (i: number, patch: Partial<SubItemDraft>) =>
    set({ subItems: draft.subItems.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const addCost = draft.subItems.reduce((s, sub) => s + subItemAmount(sub), 0);

  return (
    <div className="space-y-3">
      <datalist id={`${idPrefix}-qty-units`}>
        {QTY_UNITS.map((u) => <option key={u} value={u} />)}
      </datalist>
      <datalist id={`${idPrefix}-time-units`}>
        {TIME_UNITS.map((u) => <option key={u} value={u} />)}
      </datalist>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div>
          <label className={label}>Qty</label>
          <input type="number" min="1" placeholder="Qty" className={`${input} text-center font-semibold`}
            value={draft.qty || ""} onChange={(e) => set({ qty: num(e.target.value) })} />
        </div>
        <div>
          <label className={label}>Satuan</label>
          <input list={`${idPrefix}-qty-units`} placeholder="unit / m / set" className={input}
            value={draft.unit} onChange={(e) => set({ unit: e.target.value })} />
        </div>
        <div>
          <label className={label}>Waktu</label>
          <input type="number" min="1" placeholder="Waktu" className={`${input} text-center font-semibold`}
            value={draft.days || ""} onChange={(e) => set({ days: num(e.target.value) })} />
        </div>
        <div>
          <label className={label}>Satuan Waktu</label>
          <input list={`${idPrefix}-time-units`} placeholder="hari / event" className={input}
            value={draft.timeUnit} onChange={(e) => set({ timeUnit: e.target.value })} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={label}>Harga Satuan (Rp)</label>
          <input type="number" min="0" placeholder="Harga" className={`${input} font-mono`}
            value={draft.price || ""} onChange={(e) => set({ price: num(e.target.value) })} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400 font-semibold">
            Poin rincian <span className="font-normal text-slate-500">(isi harga jika add-cost, kosongkan jika sudah termasuk)</span>
          </span>
          <button
            type="button"
            onClick={() => set({ subItems: [...draft.subItems, emptySubItem()] })}
            className={`shrink-0 flex items-center gap-1 text-[10px] text-slate-300 ${a.hover} bg-slate-950 px-2 py-1 rounded-md border border-slate-700 cursor-pointer`}
          >
            <ListPlus className="w-3 h-3" />
            <span>+ Poin</span>
          </button>
        </div>
        {draft.subItems.map((sub, i) => (
          <div key={sub.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_64px_96px_128px_auto] gap-1.5 items-center">
            <input placeholder="mis. mic wireless" className={`${input} col-span-1`}
              value={sub.description} onChange={(e) => setSub(i, { description: e.target.value })} />
            <button type="button" onClick={() => set({ subItems: draft.subItems.filter((_, j) => j !== i) })}
              className="sm:order-last p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer" title="Hapus poin">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="col-span-2 sm:col-span-3 grid grid-cols-[52px_1fr_1fr] sm:contents gap-1.5">
              <input type="number" min="1" placeholder="Qty" className={`${input} text-center`}
                value={sub.qty || ""} onChange={(e) => setSub(i, { qty: num(e.target.value) })} />
              <input list={`${idPrefix}-qty-units`} placeholder="Satuan" className={input}
                value={sub.unit} onChange={(e) => setSub(i, { unit: e.target.value })} />
              <input type="number" min="0" placeholder="Add-cost (Rp)" className={`${input} font-mono`}
                value={sub.price || ""} onChange={(e) => setSub(i, { price: num(e.target.value) })} />
            </div>
          </div>
        ))}
      </div>

      <div className={`text-right text-[11px] font-mono ${a.text}`}>
        {formatRupiah(mainAmount(draft))}
        {addCost > 0 && <> + add-cost {formatRupiah(addCost)}</>}
        {" = "}
        <strong>{formatRupiah(lineItemTotal(draft))}</strong>
      </div>
    </div>
  );
}
