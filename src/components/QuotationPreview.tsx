import React, { useState } from "react";
import { Quotation, formatRupiah } from "../types";
import { generateQuotationPdfBlob, pdfFileName, printPdfBlob } from "../utils/documentPdf";
import { saveAs } from "file-saver";
import { notify } from "../utils/notification";
import { formatDateString } from "../utils/date";
import { terbilang } from "../utils/numberToWords";
import { Download, Printer, FileText, Loader2, Copy, Check, UserCheck, Trash2 } from "lucide-react";
import QuotationDocument from "./documents/QuotationDocument";
import DocumentPreviewShell, { primaryToolbarButton, toolbarButton } from "./documents/DocumentPreviewShell";

export default function QuotationPreview({
  quotation,
  onClose,
  onDelete
}: {
  quotation: Quotation;
  onClose: () => void;
  onDelete?: (quotation: Quotation) => void;
}) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const [copied, setCopied] = useState(false);
  const [pageCount, setPageCount] = useState<number>();
  const [showClientApproval, setShowClientApproval] = useState<boolean>(!!quotation.showClientApproval);

  // The preview and the exported PDF are rendered from this same object
  const activeQuotation: Quotation = { ...quotation, showClientApproval };

  const formattedDate = formatDateString(quotation.date);
  const terbilangText = terbilang(quotation.grandTotal) + " Rupiah";

  const runExport = async (mode: "download" | "print") => {
    setBusy(mode);
    try {
      const blob = await generateQuotationPdfBlob(activeQuotation);
      if (mode === "download") {
        saveAs(blob, pdfFileName("Quotation", quotation.quotationNumber, quotation.customerName));
      } else {
        printPdfBlob(blob);
      }
    } catch (err) {
      console.error("Error generating quotation PDF:", err);
      notify.error("Gagal membuat PDF. Silakan coba lagi.", mode === "download" ? "Unduh Gagal" : "Cetak Gagal");
    } finally {
      setBusy(null);
    }
  };

  const copySummaryForWA = () => {
    let itemsText = quotation.items.map((item, idx) => {
      return `${idx + 1}. *${item.description.replace(/\n/g, ' ')}*\n   Qty: ${item.qty}${(Number(item.days) || 1) > 1 ? ` | Hari: ${item.days}` : ''} | Harga: ${formatRupiah(item.price)} | Subtotal: *${formatRupiah(item.total)}*`;
    }).join('\n');

    let bankText = "";
    if (quotation.selectedBanks && quotation.selectedBanks.length > 0) {
      bankText = `\n\n*Rekening Pembayaran:*\n` + quotation.selectedBanks.map(b => `- ${b.name}: *${b.accountNumber}* a.n. ${b.accountHolder}`).join('\n');
    }

    const text = `*SURAT PENAWARAN HARGA - MATEHA PRODUCTION*\n` +
      `No. Dokumen: *${quotation.quotationNumber}*\n` +
      `Tanggal: ${formattedDate}\n` +
      `Kepada Yth: *${quotation.customerName}* ${quotation.customerContact ? `(PIC: ${quotation.customerContact})` : ''}\n` +
      `Perihal: *${quotation.subject || 'Penawaran Kerjasama Event'}*\n\n` +
      `*Rincian Penawaran:*\n${itemsText}\n\n` +
      `*Total Penawaran: ${formatRupiah(quotation.grandTotal)}*\n` +
      `_(Terbilang: ${terbilangText})_\n` +
      `${bankText}\n\n` +
      `*Syarat & Ketentuan:*\n${quotation.termsAndConditions || 'Penawaran berlaku selama 14 hari sejak diterbitkan.'}\n\n` +
      `Terima kasih,\n*Mateha Production* (Hotline: +62 811-1244-7701)`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <DocumentPreviewShell
      icon={<FileText className="w-5 h-5" />}
      title="Pratinjau Penawaran Harga"
      badge="Quotation"
      reference={quotation.quotationNumber}
      pageCount={pageCount}
      onClose={onClose}
      actions={
        <>
          <button
            onClick={() => setShowClientApproval(!showClientApproval)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              showClientApproval
                ? "bg-cyan-950/90 border-cyan-500/80 text-cyan-300"
                : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400"
            }`}
            title="Tampilkan atau sembunyikan kolom tanda tangan klien"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Approval Klien:</span>
            <span>{showClientApproval ? "ON" : "OFF"}</span>
          </button>

          <button onClick={copySummaryForWA} className={toolbarButton} title="Salin ringkasan teks untuk WhatsApp">
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-bold">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Salin WA</span>
              </>
            )}
          </button>

          <button onClick={() => runExport("print")} disabled={busy !== null} className={toolbarButton} title="Cetak dokumen">
            {busy === "print" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5 text-slate-400" />}
            <span className="hidden sm:inline">Cetak</span>
          </button>

          <button onClick={() => runExport("download")} disabled={busy !== null} className={primaryToolbarButton}>
            {busy === "download" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>{busy === "download" ? "Memproses..." : "Unduh PDF"}</span>
          </button>

          {onDelete && (
            <button
              onClick={() => onDelete(quotation)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-950 border border-slate-700 hover:border-rose-700 text-slate-400 hover:text-rose-400 text-xs font-semibold transition cursor-pointer"
              title="Hapus Quotation Ini"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Hapus</span>
            </button>
          )}
        </>
      }
    >
      <QuotationDocument quotation={activeQuotation} onPageCount={setPageCount} />
    </DocumentPreviewShell>
  );
}
