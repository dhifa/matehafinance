import { collection, doc, getDocs, setDoc, updateDoc } from "../lib/firestore";
import { db, sanitizeForFirestore } from "./backend";
import { terbilang } from "./numberToWords";
import { Bank, Invoice, Kwitansi, Quotation } from "../types";

/**
 * Creates invoices, quotations and kwitansi from AI assistant drafts, with the
 * same numbering, defaults and fields as the manual forms in InvoiceView,
 * QuotationView and KwitansiView.
 */

export interface AiDocItem {
  description: string;
  qty: number;
  price: number;
}

export interface AiInvoiceDraft {
  customerName: string;
  customerContact: string;
  customerPhone: string;
  subject: string;
  date: string;
  dueDate: string;
  items: AiDocItem[];
  termsAndConditions: string;
  isDp: boolean;
  dpPercent: number;
}

export interface AiQuotationDraft {
  customerName: string;
  customerContact: string;
  customerPhone: string;
  subject: string;
  date: string;
  validUntil: string;
  items: AiDocItem[];
  termsAndConditions: string;
}

export interface AiKwitansiDraft {
  customerName: string;
  amount: number;
  paymentFor: string;
  date: string;
  paymentMethod: string;
  invoiceNumber: string;
}

const DEFAULT_INVOICE_TERMS = "Pelunasan invoice wajib dibayarkan selambat-lambatnya pada hari H acara.";
const DEFAULT_QUOTATION_TERMS = "Penawaran ini berlaku selama 14 hari kerja sejak diterbitkan.";

/** Same scheme as the views: PREFIX/MATEHA/YYYY/MM/NNN, sequence per month. */
function nextNumber(prefix: "INV" | "QUO" | "KWT", date: string, existing: string[]): string {
  const d = new Date(date);
  const yyyy = !isNaN(d.getFullYear()) ? d.getFullYear() : new Date().getFullYear();
  const mm = String(!isNaN(d.getMonth()) ? d.getMonth() + 1 : new Date().getMonth() + 1).padStart(2, "0");
  const base = `${prefix}/MATEHA/${yyyy}/${mm}/`;
  const seqs = existing.filter((n) => n && n.startsWith(base)).map((n) => parseInt(n.split("/").pop() || "0", 10) || 0);
  return `${base}${String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, "0")}`;
}

async function listAll<T>(name: string): Promise<T[]> {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
}

async function defaultBanks(): Promise<Bank[]> {
  return (await listAll<Bank>("banks")).filter((b) => b.isDefault);
}

function toItems(items: AiDocItem[]) {
  return items.map((item, idx) => ({
    id: `item_${idx}_${Date.now()}`,
    description: item.description.trim(),
    qty: Number(item.qty) || 1,
    price: Number(item.price) || 0,
    total: (Number(item.qty) || 1) * (Number(item.price) || 0),
  }));
}

export async function createInvoiceFromDraft(draft: AiInvoiceDraft): Promise<Invoice> {
  const [invoices, banks] = await Promise.all([listAll<Invoice>("invoices"), defaultBanks()]);
  const items = toItems(draft.items);
  const total = items.reduce((s, i) => s + i.total, 0);
  const isDp = draft.isDp && draft.dpPercent > 0 && draft.dpPercent < 100;
  const dpAmount = isDp ? Math.round((total * draft.dpPercent) / 100) : 0;

  const id = Date.now().toString();
  const invoice: Invoice = {
    id,
    invoiceNumber: nextNumber("INV", draft.date, invoices.map((i) => i.invoiceNumber)),
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone.trim() || undefined,
    customerContact: draft.customerContact.trim() || undefined,
    subject: draft.subject.trim() || "Tagihan Layanan Event",
    date: draft.date,
    dueDate: draft.dueDate || "",
    items,
    grandTotal: isDp ? dpAmount : total,
    status: "draft",
    createdAt: new Date().toISOString(),
    selectedBanks: banks,
    termsAndConditions: draft.termsAndConditions.trim() || DEFAULT_INVOICE_TERMS,
    showClientApproval: false,
    isDp,
    dpMode: isDp ? "percentage" : undefined,
    dpPercent: isDp ? draft.dpPercent : undefined,
    dpAmount: isDp ? dpAmount : undefined,
    totalAmount: isDp ? total : undefined,
    remainingAmount: isDp ? total - dpAmount : undefined,
  };
  await setDoc(doc(db, "invoices", id), sanitizeForFirestore(invoice));
  return invoice;
}

export async function createQuotationFromDraft(draft: AiQuotationDraft): Promise<Quotation> {
  const [quotations, banks] = await Promise.all([listAll<Quotation>("quotations"), defaultBanks()]);
  const items = toItems(draft.items);

  const id = Date.now().toString();
  const quotation: Quotation = {
    id,
    quotationNumber: nextNumber("QUO", draft.date, quotations.map((q) => q.quotationNumber)),
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone.trim(),
    customerContact: draft.customerContact.trim(),
    subject: draft.subject.trim() || "Penawaran Kerjasama Acara",
    date: draft.date,
    validUntil: draft.validUntil,
    items,
    grandTotal: items.reduce((s, i) => s + i.total, 0),
    status: "draft",
    createdAt: new Date().toISOString(),
    selectedBanks: banks,
    termsAndConditions: draft.termsAndConditions.trim() || DEFAULT_QUOTATION_TERMS,
    showClientApproval: false,
  };
  await setDoc(doc(db, "quotations", id), sanitizeForFirestore(quotation));
  return quotation;
}

export async function createKwitansiFromDraft(draft: AiKwitansiDraft): Promise<Kwitansi> {
  const [kwitansiList, invoices, banks] = await Promise.all([
    listAll<Kwitansi>("kwitansi"),
    listAll<Invoice>("invoices"),
    defaultBanks(),
  ]);
  const invoice = draft.invoiceNumber ? invoices.find((i) => i.invoiceNumber === draft.invoiceNumber.trim()) : undefined;

  // "Transfer Bank" gets the default account details, like the manual form does
  let paymentMethod = draft.paymentMethod.trim() || "Transfer Bank";
  if (/^transfer bank$/i.test(paymentMethod) && banks[0]) {
    paymentMethod = `Transfer ${banks[0].name} (${banks[0].accountNumber} a.n ${banks[0].accountHolder})`;
  }

  const id = Date.now().toString();
  const kwitansi: Kwitansi = {
    id,
    kwitansiNumber: nextNumber("KWT", draft.date, kwitansiList.map((k) => k.kwitansiNumber)),
    customerName: (draft.customerName || invoice?.customerName || "").trim(),
    amount: draft.amount,
    terbilangText: terbilang(draft.amount),
    paymentFor: draft.paymentFor.trim(),
    date: draft.date,
    paymentMethod,
    receiverName: "Dhifa Aksa Hermawan",
    receiverTitle: "CEO Mateha Production",
    createdAt: new Date().toISOString(),
    invoiceId: invoice?.id,
    invoiceNumber: invoice?.invoiceNumber,
  };
  await setDoc(doc(db, "kwitansi", id), sanitizeForFirestore(kwitansi));
  if (invoice) {
    await updateDoc(doc(db, "invoices", invoice.id), { status: "paid" });
  }
  return kwitansi;
}
