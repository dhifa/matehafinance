import React from "react";
import { Invoice, Kwitansi, formatRupiah } from "../types";
import { INDONESIAN_MONTHS } from "../utils/date";
import { terbilang } from "../utils/numberToWords";
import { X, Printer, Download } from "lucide-react";
import { generateKwitansiItemPdfBlob } from "../utils/pdfGenerator";
import { saveAs } from "file-saver";

interface KwitansiPreviewProps {
  kwitansi?: Kwitansi | null;
  invoice?: Invoice | null;
  onClose: () => void;
}

export default function KwitansiPreview({ kwitansi, invoice, onClose }: KwitansiPreviewProps) {
  const customerName = kwitansi ? kwitansi.customerName : (invoice ? invoice.customerName : "-");
  const amount = kwitansi ? kwitansi.amount : (invoice ? invoice.grandTotal : 0);
  const kwitansiNumber = kwitansi 
    ? kwitansi.kwitansiNumber 
    : (invoice ? invoice.invoiceNumber.replace("INV", "KWT") : "KWT/MATEHA/001");
  const paymentFor = kwitansi 
    ? kwitansi.paymentFor 
    : (invoice ? (invoice.subject || `Pembayaran Invoice ${invoice.invoiceNumber}`) : "-");
  const paymentMethod = kwitansi?.paymentMethod || "Transfer Bank";
  const receiverName = kwitansi?.receiverName || "Dhifa Aksa Hermawan";
  const receiverTitle = kwitansi?.receiverTitle || "CEO Mateha Production";

  const dateObj = kwitansi?.date ? new Date(kwitansi.date) : (invoice?.createdAt ? new Date(invoice.createdAt) : new Date());
  const formattedDate = !isNaN(dateObj.getTime())
    ? `${dateObj.getDate()} ${INDONESIAN_MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`
    : new Date().toLocaleDateString("id-ID");

  const terbilangAmount = terbilang(amount) + " Rupiah";

  const handleDownloadPdf = async () => {
    if (kwitansi) {
      const blob = await generateKwitansiItemPdfBlob(kwitansi);
      saveAs(blob, `Kwitansi_${kwitansi.kwitansiNumber.replace(/\//g, '_')}.pdf`);
    } else if (invoice) {
      const kwtData: Kwitansi = {
        id: invoice.id,
        kwitansiNumber: invoice.invoiceNumber.replace("INV", "KWT"),
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        amount: invoice.grandTotal,
        paymentFor: invoice.subject || `Pembayaran Invoice ${invoice.invoiceNumber}`,
        date: invoice.date,
        paymentMethod: "Transfer Bank",
        receiverName: "Dhifa Aksa Hermawan",
        receiverTitle: "CEO Mateha Production",
        createdAt: invoice.createdAt
      };
      const blob = await generateKwitansiItemPdfBlob(kwtData);
      saveAs(blob, `Kwitansi_${kwtData.kwitansiNumber.replace(/\//g, '_')}.pdf`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white text-slate-900 p-8 rounded-2xl max-w-xl w-full shadow-2xl relative overflow-y-auto max-h-[92vh] border border-slate-200">
        
        {/* Actions header */}
        <div className="no-print flex justify-between items-center pb-4 mb-4 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleDownloadPdf}
              className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
            <button 
              onClick={() => window.print()}
              className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-1.5 px-3 rounded-lg transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak</span>
            </button>
          </div>

          <button 
            onClick={onClose} 
            className="p-1.5 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="print-sheet p-4 text-center">
          <div className="flex items-center justify-between border-b-2 border-slate-300 pb-4 mb-6">
            <div className="text-left">
              <img src="/logo-mateha.png" alt="Logo Mateha" className="w-36 mb-1" />
              <p className="text-[10px] text-slate-500 font-mono">Event & Production Management</p>
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-black tracking-tight text-slate-800 uppercase">KWITANSI</h1>
              <p className="text-xs font-mono font-bold text-cyan-700">{kwitansiNumber}</p>
            </div>
          </div>

          <div className="text-left space-y-4 mb-6 text-sm">
            <div className="flex items-start border-b border-slate-100 pb-2">
              <p className="w-40 text-slate-500 text-xs uppercase font-bold tracking-wider">Telah Terima dari</p>
              <p className="flex-1 font-bold text-slate-900">: {customerName}</p>
            </div>

            <div className="flex items-start border-b border-slate-100 pb-2">
              <p className="w-40 text-slate-500 text-xs uppercase font-bold tracking-wider">Jumlah Uang</p>
              <p className="flex-1 font-black text-slate-900 text-lg font-mono">: {formatRupiah(amount)}</p>
            </div>

            <div className="flex items-start border-b border-slate-100 pb-2">
              <p className="w-40 text-slate-500 text-xs uppercase font-bold tracking-wider">Terbilang</p>
              <p className="flex-1 font-semibold text-slate-700 italic">: # {terbilangAmount} #</p>
            </div>

            <div className="flex items-start border-b border-slate-100 pb-2">
              <p className="w-40 text-slate-500 text-xs uppercase font-bold tracking-wider">Untuk Pembayaran</p>
              <p className="flex-1 font-medium text-slate-800 leading-relaxed">: {paymentFor}</p>
            </div>

            <div className="flex items-start border-b border-slate-100 pb-2">
              <p className="w-40 text-slate-500 text-xs uppercase font-bold tracking-wider">Metode Pembayaran</p>
              <p className="flex-1 font-medium text-slate-700">: {paymentMethod}</p>
            </div>
          </div>

          <div className="bg-emerald-50 border-2 border-dashed border-emerald-500/60 rounded-xl p-3.5 mb-6 text-emerald-800 font-bold text-xs flex items-center justify-between print-avoid-break">
            <span>STATUS: LUNAS / VERIFIED</span>
            <span className="font-mono">{formattedDate}</span>
          </div>

          <div className="flex justify-between items-end mt-8 pt-4 print-avoid-break">
            <div className="text-left text-[11px] text-slate-500 font-sans space-y-0.5 leading-snug">
              <p className="font-extrabold text-slate-800 font-mono">MATEHA PRODUCTION</p>
              <p>Komplek BTN No.6A, Sekejati, Kec. Buahbatu</p>
              <p>Kota Bandung, Jawa Barat 40286</p>
              <p className="text-cyan-700 font-bold text-[10px]">+62 811-1244-7701 | matehaproduction@gmail.com</p>
            </div>

            <div className="text-center">
              <p className="text-xs text-slate-600 mb-1">Bandung, {formattedDate}</p>
              <p className="text-xs text-slate-500 mb-1">Yang Menerima,</p>
              <img src="/logo-ttd.png" alt="TTD" className="w-28 mx-auto" />
              <p className="font-bold underline text-xs text-slate-900 mt-1">{receiverName}</p>
              <p className="text-[10px] text-slate-500">{receiverTitle}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
