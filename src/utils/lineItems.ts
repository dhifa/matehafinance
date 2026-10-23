import { InvoiceItem, LineSubItem } from "../types";

/**
 * Invoice/quotation line items: Qty (+ unit) × Time (+ unit) × unit price, plus
 * detail lines ("poin") that become add-costs only when they have a price.
 */

export interface SubItemDraft {
  id: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
}

export interface LineItemDraft {
  description: string;
  qty: number;
  unit: string;
  days: number;
  timeUnit: string;
  price: number;
  subItems: SubItemDraft[];
}

export const QTY_UNITS = ["unit", "m", "set", "pcs", "package", "paket", "orang", "titik", "ls"];
export const TIME_UNITS = ["hari", "event", "days", "jam", "sesi", "minggu", "bulan"];

const newId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

export const emptyLineItem = (): LineItemDraft => ({
  description: "",
  qty: 1,
  unit: "",
  days: 1,
  timeUnit: "",
  price: 0,
  subItems: [],
});

export const emptySubItem = (): SubItemDraft => ({ id: newId(), description: "", qty: 1, unit: "", price: 0 });

export const mainAmount = (item: { qty?: number; days?: number; price?: number }) =>
  (Number(item.qty) || 1) * (Number(item.days) || 1) * (Number(item.price) || 0);

/** Add-cost of a detail line; a line without a price costs nothing. */
export const subItemAmount = (sub: { qty?: number; price?: number }) =>
  (Number(sub.price) || 0) > 0 ? (Number(sub.qty) || 1) * Number(sub.price) : 0;

export const lineItemTotal = (item: { qty?: number; days?: number; price?: number; subItems?: { qty?: number; price?: number }[] }) =>
  mainAmount(item) + (item.subItems || []).reduce((s, sub) => s + subItemAmount(sub), 0);

export const formatQty = (qty: number | undefined, unit?: string) =>
  `${Number(qty) || 1}${unit?.trim() ? ` ${unit.trim()}` : ""}`;

export const formatTime = (days: number | undefined, timeUnit?: string) =>
  `${Number(days) || 1} ${timeUnit?.trim() || "hari"}`;

/** Whether a document needs the time column: some item spans more than 1, or names a time unit. */
export const itemsHaveTime = (items: { days?: number; timeUnit?: string }[]) =>
  items.some((i) => (Number(i.days) || 1) > 1 || !!i.timeUnit?.trim());

export function draftFromItem(item: InvoiceItem): LineItemDraft {
  return {
    description: item.description,
    qty: Number(item.qty) || 1,
    unit: item.unit || "",
    days: Number(item.days) || 1,
    timeUnit: item.timeUnit || "",
    price: Number(item.price) || 0,
    subItems: (item.subItems || []).map((s) => ({
      id: s.id || newId(),
      description: s.description || "",
      qty: Number(s.qty) || 1,
      unit: s.unit || "",
      price: Number(s.price) || 0,
    })),
  };
}

/**
 * Builds a clean item (also used to sanitize stored items before saving).
 * Optional fields are left out when empty so documents stay compact.
 */
export function normalizeItem(source: LineItemDraft | InvoiceItem, id: string): InvoiceItem {
  const subItems: LineSubItem[] = (source.subItems || [])
    .filter((s) => (s.description || "").trim())
    .map((s) => {
      const sub: LineSubItem = { id: s.id || newId(), description: s.description.trim(), qty: Number(s.qty) || 1 };
      if (s.unit?.trim()) sub.unit = s.unit.trim();
      if ((Number(s.price) || 0) > 0) sub.price = Number(s.price);
      return sub;
    });
  const item: InvoiceItem = {
    id,
    description: (source.description || "").trim(),
    qty: Number(source.qty) || 1,
    days: Number(source.days) || 1,
    price: Number(source.price) || 0,
    total: 0,
  };
  if (source.unit?.trim()) item.unit = source.unit.trim();
  if (source.timeUnit?.trim()) item.timeUnit = source.timeUnit.trim();
  if (subItems.length) item.subItems = subItems;
  item.total = lineItemTotal(item);
  return item;
}

/** Returns a warning message, or null when the draft can be saved. */
export function validateLineItem(draft: LineItemDraft): string | null {
  // A price of 0 is allowed (e.g. an included item); only the description is required
  return draft.description.trim() ? null : "Mohon isi deskripsi item.";
}

export const newItemId = newId;

/** One-line summary used in WhatsApp texts. */
export function itemSummaryText(item: InvoiceItem, formatRupiah: (n: number) => string): string {
  const time = (Number(item.days) || 1) > 1 || item.timeUnit ? ` × ${formatTime(item.days, item.timeUnit)}` : "";
  const lines = [`   ${formatQty(item.qty, item.unit)}${time} @ ${formatRupiah(item.price)}`];
  for (const sub of item.subItems || []) {
    const cost = subItemAmount(sub);
    lines.push(`   - ${sub.description} (${formatQty(sub.qty, sub.unit)})${cost ? ` + ${formatRupiah(cost)}` : ""}`);
  }
  lines.push(`   Subtotal: *${formatRupiah(item.total)}*`);
  return lines.join("\n");
}
