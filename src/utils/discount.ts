/**
 * Document-level discount for quotations and invoices. Items keep their own
 * totals; the discount is applied once to their sum:
 *   subtotal (items) − discountAmount = grandTotal (or the contract total for DP invoices)
 */

export type DiscountType = "percent" | "nominal";

export interface DocumentDiscount {
  subtotal?: number; // sum of item totals before the discount
  discountType?: DiscountType;
  discountValue?: number; // percent (0-100) or rupiah, depending on discountType
  discountAmount?: number; // rupiah taken off the subtotal
}

/** Rupiah amount of the discount, never below 0 or above the subtotal. */
export function computeDiscount(subtotal: number, type: DiscountType | "none" | undefined, value: number): number {
  const base = Math.max(0, Number(subtotal) || 0);
  const v = Math.max(0, Number(value) || 0);
  if (type === "percent") return Math.round((base * Math.min(100, v)) / 100);
  if (type === "nominal") return Math.min(base, Math.round(v));
  return 0;
}

/** Fields to store on the document (empty object when there is no discount). */
export function discountFields(subtotal: number, type: DiscountType | "none", value: number): DocumentDiscount {
  const amount = computeDiscount(subtotal, type, value);
  if (type === "none" || amount <= 0) return {};
  return { subtotal, discountType: type, discountValue: Number(value) || 0, discountAmount: amount };
}

/** Label for totals, e.g. "Diskon (10%)" or "Diskon". */
export function discountLabel(doc: DocumentDiscount): string {
  return doc.discountType === "percent" && doc.discountValue ? `Diskon (${doc.discountValue}%)` : "Diskon";
}
