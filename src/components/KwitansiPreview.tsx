import React, { useState } from "react";
import { Invoice, Kwitansi, formatRupiah } from "../types";
import { Download, Loader2, MessageCircle, Printer, Receipt } from "lucide-react";
import { formatDateString } from "../utils/date";
import { terbilang } from "../utils/numberToWords";
import { saveAs } from "file-saver";
import { generateKwitansiItemPdfBlob, pdfFileName, printPdfBlob } from "../utils/documentPdf";
import { notify } from "../utils/notification";
import KwitansiDocument, { kwitansiFromInvoice } from "./documents/KwitansiDocument";
import SendWhatsAppModal from "./documents/SendWhatsAppModal";
import DocumentPreviewShell, { primaryToolbarButton, toolbarButton } from "./documents/DocumentPreviewShell";

interface KwitansiPreviewProps {
  kwitansi?: Kwitansi | null;
  invoice?: Invoice | null;
  onClose: () => void;
}

export default function KwitansiPreview({ kwitansi, invoice, onClose }: KwitansiPreviewProps) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const [showWa, setShowWa] = useState(false);
  const data = kwitansi || (invoice ? kwitansiFromInvoice(invoice) : null);
  if (!data) return null;

  const runExport = async (mode: "download" | "print") => {
    setBusy(mode);
    try {
      const blob = await generateKwitansiItemPdfBlob(data);
      if (mode === "download") {
        saveAs(blob, pdfFileName("Kwitansi", data.kwitansiNumber, data.customerName));
      } else {
        printPdfBlob(blob);
      }
    } catch (err) {
      console.error("Error generating kwitansi PDF:", err);
      notify.error("Gagal membuat PDF. Silakan coba lagi.", mode === "download" ? "Unduh Gagal" : "Cetak Gagal");
    } finally {
      setBusy(null);
    }
  };

  const waText =
    `*KWITANSI PEMBAYARAN - MATEHA PRODUCTION*\n` +
    `No. Kwitansi: *${data.kwitansiNumber}*\n` +
    `Tanggal: ${formatDateString(data.date)}\n` +
    `Telah diterima dari: *${data.customerName}*\n` +
    `Sejumlah: *${formatRupiah(data.amount)}*\n` +
    `_(Terbilang: ${data.terbilangText || `${terbilang(data.amount)} Rupiah`})_\n` +
    `Untuk pembayaran: ${data.paymentFor}\n` +
    (data.invoiceNumber ? `Referensi invoice: ${data.invoiceNumber}\n` : "") +
    (data.paymentMethod ? `Metode: ${data.paymentMethod}\n` : "") +
    `\nPembayaran telah kami terima dengan baik. Terima kasih atas kepercayaan Anda.\n` +
    `*Mateha Production* (Hotline: +62 811-1244-7701)`;

  return (
    <>
      <DocumentPreviewShell
        icon={<Receipt className="w-5 h-5" />}
        title="Pratinjau Kwitansi"
        badge="Kwitansi"
        reference={data.kwitansiNumber}
        onClose={onClose}
        actions={
          <>
            <button onClick={() => setShowWa(true)} className={toolbarButton} title="Kirim ke klien lewat WhatsApp">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
            <button onClick={() => runExport("print")} disabled={busy !== null} className={toolbarButton} title="Cetak dokumen">
              {busy === "print" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5 text-slate-400" />}
              <span className="hidden sm:inline">Cetak</span>
            </button>
            <button onClick={() => runExport("download")} disabled={busy !== null} className={primaryToolbarButton}>
              {busy === "download" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>{busy === "download" ? "Memproses..." : "Unduh PDF"}</span>
            </button>
          </>
        }
      >
        <KwitansiDocument kwitansi={data} />
      </DocumentPreviewShell>
      {showWa && (
        <SendWhatsAppModal
          title="Kirim Kwitansi via WhatsApp"
          phone={invoice?.customerPhone}
          initialText={waText}
          fileName={pdfFileName("Kwitansi", data.kwitansiNumber, data.customerName)}
          buildPdf={() => generateKwitansiItemPdfBlob(data)}
          onClose={() => setShowWa(false)}
        />
      )}
    </>
  );
}
