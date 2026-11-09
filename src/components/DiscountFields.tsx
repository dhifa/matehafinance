import React from "react";
import { Percent } from "lucide-react";
import { formatRupiah } from "../types";
import { DiscountType, computeDiscount } from "../utils/discount";

const ACCENTS = {
  blue: { active: "bg-blue-600 text-white", focus: "focus:border-blue-500" },
  cyan: { active: "bg-cyan-600 text-white", focus: "focus:border-cyan-500" },
};

/** Discount picker shown above the total of a quotation or invoice form. */
export default function DiscountFields({
  subtotal,
  type,
  value,
  onChange,
  accent,
}: {
  subtotal: number;
  type: DiscountType | "none";
  value: number;
  onChange: (type: DiscountType | "none", value: number) => void;
  accent: keyof typeof ACCENTS;
}) {
  const a = ACCENTS[accent];
  const amount = computeDiscount(subtotal, type, value);
  const options: { key: DiscountType | "none"; label: string }[] = [
    { key: "none", label: "Tanpa diskon" },
    { key: "percent", label: "Persen (%)" },
    { key: "nominal", label: "Nominal (Rp)" },
  ];

  return (
    <div className="px-4 py-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2.5 mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Percent className="w-3.5 h-3.5 text-slate-400" /> Diskon
        </span>
        <div className="flex rounded-lg border border-slate-800 overflow-hidden text-[11px]">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key, o.key === type ? value : 0)}
              className={`px-2.5 py-1.5 font-semibold cursor-pointer ${type === o.key ? a.active : "bg-slate-950 text-slate-400 hover:text-white"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {type !== "none" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-40">
            {type === "nominal" && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">Rp</span>}
            <input
              type="number"
              min="0"
              max={type === "percent" ? 100 : undefined}
              step="any"
              inputMode="decimal"
              value={value || ""}
              onChange={(e) => onChange(type, Math.max(0, Number(e.target.value) || 0))}
              placeholder={type === "percent" ? "mis. 10" : "mis. 500000"}
              className={`w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 text-xs text-white font-mono focus:outline-none ${a.focus} ${type === "nominal" ? "pl-8 pr-2" : "pl-2.5 pr-7"}`}
              aria-label={type === "percent" ? "Persentase diskon" : "Nominal diskon"}
            />
            {type === "percent" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">%</span>}
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Potongan: <strong className="text-rose-300">−{formatRupiah(amount)}</strong>
            {type === "percent" && value > 100 && <span className="text-amber-300"> (maks. 100%)</span>}
          </span>
        </div>
      )}
    </div>
  );
}
