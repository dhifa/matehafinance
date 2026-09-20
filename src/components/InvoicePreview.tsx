import React, { useState } from "react";
import { Invoice, formatRupiah } from "../types";
import { generateInvoicePdfBlob } from "../utils/pdfGenerator";
import { saveAs } from "file-saver";
import { formatDateString } from "../utils/date";
import { terbilang } from "../utils/numberToWords";
import { Download, Printer, X, FileText, Loader2, Copy, Check } from "lucide-react";

export default function InvoicePreview({ invoice, onClose }: { invoice: Invoice, onClose: () => void }) {
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const formattedDate = formatDateString(invoice.date);
  const formattedDueDate = invoice.dueDate ? formatDateString(invoice.dueDate) : "-";
  const terbilangText = terbilang(invoice.grandTotal) + " Rupiah";

  const exportPdf = async () => {
    setIsExporting(true);
    try {
      const blob = await generateInvoicePdfBlob(invoice);
      const cleanFileName = `Invoice_${invoice.invoiceNumber.replace(/\//g, '_')}_${invoice.customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      saveAs(blob, cleanFileName);
    } catch (err) {
      console.error("Error generating invoice PDF:", err);
      alert("Gagal mengunduh PDF. Silakan coba lagi.");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const copySummaryForWA = () => {
    let itemsText = invoice.items.map((item, idx) => {
      return `${idx + 1}. *${item.description.replace(/\n/g, ' ')}*\n   Qty: ${item.qty} | Harga: ${formatRupiah(item.price)} | Subtotal: *${formatRupiah(item.total)}*`;
    }).join('\n');

    let bankText = "";
    if (invoice.selectedBanks && invoice.selectedBanks.length > 0) {
      bankText = `\n\n*Rekening Pembayaran:*\n` + invoice.selectedBanks.map(b => `- ${b.name}: *${b.accountNumber}* a.n. ${b.accountHolder}`).join('\n');
    }

    const text = `*TAGIHAN INVOICE RESMI - MATEHA PRODUCTION*\n` +
      `No. Invoice: *${invoice.invoiceNumber}*\n` +
      `Tanggal: ${formattedDate}\n` +
      `Jatuh Tempo: ${formattedDueDate}\n` +
      `Ditagihkan Kepada: *${invoice.customerName}* ${invoice.customerContact ? `(PIC: ${invoice.customerContact})` : ''}\n` +
      `Perihal: *${invoice.subject || 'Tagihan Layanan Event'}*\n\n` +
      `*Rincian Tagihan:*\n${itemsText}\n\n` +
      `*Total Tagihan: ${formatRupiah(invoice.grandTotal)}*\n` +
      `_(Terbilang: ${terbilangText})_\n` +
      `${bankText}\n\n` +
      `*Syarat & Ketentuan Pembayaran:*\n${invoice.termsAndConditions || 'Pelunasan invoice wajib dibayarkan selambat-lambatnya pada hari H acara.'}\n\n` +
      `Terima kasih,\n*Mateha Production* (Hotline: +62 811-1244-7701)`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl sm:rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        
        {/* Top Control Bar (Hidden on Print) */}
        <div className="no-print px-4 sm:px-6 py-3.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Pratinjau Faktur Tagihan</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 rounded-md uppercase">Invoice</span>
              </div>
              <p className="text-xs font-mono text-blue-400 font-semibold">{invoice.invoiceNumber}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={copySummaryForWA}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              title="Salin ringkasan teks untuk WhatsApp"
            >
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

            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              title="Cetak Dokumen"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cetak</span>
            </button>

            <button
              onClick={exportPdf}
              disabled={isExporting}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-950 disabled:opacity-50 cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh PDF</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition cursor-pointer ml-1"
              title="Tutup Pratinjau"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Paper Container View */}
        <div className="p-3 sm:p-6 md:p-8 overflow-y-auto bg-slate-950/60 flex justify-center">
          <div className="print-only-sheet bg-white text-slate-900 p-8 sm:p-12 md:p-14 rounded-xl shadow-2xl w-full max-w-3xl text-xs sm:text-[13px] relative font-sans leading-relaxed border border-slate-200">
            
            {/* Watermark Logo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.035] z-0 overflow-hidden">
              <img src="/logo-mateha.png" alt="Mateha Watermark" className="w-[450px] filter grayscale" />
            </div>

            {/* KOP SURAT */}
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-3">
                <div>
                  <img src="/logo-mateha.png" alt="Mateha Production Logo" className="w-44 sm:w-48 mb-1.5 object-contain" />
                  <p className="text-[11px] text-slate-500 font-semibold tracking-wide uppercase">Event Production & Multimedia Specialist</p>
                </div>
                <div className="text-left sm:text-right text-[11px] text-slate-600 space-y-0.5 leading-snug">
                  <p className="font-extrabold text-slate-900 text-[13px]">MATEHA PRODUCTION</p>
                  <p>Komplek BTN No.6A, Sekejati, Kec. Buahbatu</p>
                  <p>Kota Bandung, Jawa Barat 40286</p>
                  <p className="text-sky-700 font-bold pt-0.5">
                    WA: +62 811-1244-7701 <span className="text-slate-300">|</span> matehaproduction@gmail.com
                  </p>
                </div>
              </div>

              {/* Kop Line Divider */}
              <div className="border-t-2 border-slate-900 mt-1 mb-6 pt-0.5 border-b border-slate-300"></div>
            </div>

            {/* DOKUMEN TITLE */}
            <div className="relative z-10 mb-6">
              <div className="text-center mb-5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
                  INVOICE TAGIHAN
                </h1>
                <p className="text-xs font-mono font-bold text-sky-700 tracking-wider mt-0.5">
                  NO: {invoice.invoiceNumber}
                </p>
              </div>

              {/* Metadata & Recipient */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 border border-slate-200 rounded-xl p-4 text-xs">
                <div>
                  <p className="text-slate-500 font-bold uppercase text-[10px] tracking-wider mb-1">Ditagihkan Kepada:</p>
                  <p className="font-extrabold text-base text-slate-950">{invoice.customerName}</p>
                  {invoice.customerContact && (
                    <p className="text-slate-600">
                      <strong className="text-slate-700">PIC:</strong> {invoice.customerContact}
                    </p>
                  )}
                  {invoice.customerPhone && (
                    <p className="text-slate-600">
                      <strong className="text-slate-700">No. Telp:</strong> {invoice.customerPhone}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 sm:text-right">
                  <div>
                    <span className="text-slate-500 font-semibold">Tanggal Invoice: </span>
                    <strong className="text-slate-900">{formattedDate}</strong>
                  </div>
                  {invoice.dueDate && (
                    <div>
                      <span className="text-slate-500 font-semibold">Jatuh Tempo: </span>
                      <strong className="text-rose-600">{formattedDueDate}</strong>
                    </div>
                  )}
                  {invoice.subject && (
                    <div>
                      <span className="text-slate-500 font-semibold">Perihal: </span>
                      <strong className="text-sky-800">{invoice.subject}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* TABEL RINCIAN TAGIHAN */}
            <div className="relative z-10 mb-5 overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase">
                    <th className="py-2.5 px-3 border border-slate-800 text-center w-10">No</th>
                    <th className="py-2.5 px-3 border border-slate-800">Deskripsi Layanan / Item</th>
                    <th className="py-2.5 px-3 border border-slate-800 text-center w-14">Qty</th>
                    <th className="py-2.5 px-3 border border-slate-800 text-right w-32">Harga Satuan</th>
                    <th className="py-2.5 px-3 border border-slate-800 text-right w-36">Sub Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {invoice.items.map((item, idx) => (
                    <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}>
                      <td className="py-2.5 px-3 border border-slate-200 text-center font-semibold text-slate-600 align-top">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-200 text-slate-900 leading-relaxed align-top">
                        {item.description.split('\n').map((line, i) => {
                          const trimmed = line.trim();
                          if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
                            return (
                              <div key={i} className="pl-3 text-slate-600 flex items-start space-x-1.5 my-0.5">
                                <span className="text-sky-600 font-bold">•</span>
                                <span>{trimmed.substring(1).trim()}</span>
                              </div>
                            );
                          }
                          return <div key={i} className="font-medium text-slate-900">{line}</div>;
                        })}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-200 text-center font-semibold text-slate-700 align-top">
                        {item.qty}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-200 text-right text-slate-700 font-mono align-top">
                        {formatRupiah(item.price)}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-200 text-right font-bold text-slate-950 font-mono align-top">
                        {formatRupiah(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-xs text-slate-800">
                    <td colSpan={3} className="py-2 px-3 border border-slate-300 text-right uppercase tracking-wider">
                      Subtotal
                    </td>
                    <td colSpan={2} className="py-2 px-3 border border-slate-300 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(invoice.grandTotal)}
                    </td>
                  </tr>
                  <tr className="bg-slate-900 text-white font-extrabold text-sm">
                    <td colSpan={3} className="py-2.5 px-3 border border-slate-900 text-right uppercase tracking-wider">
                      Total Pembayaran
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 border border-slate-900 text-right font-mono text-cyan-300 text-base">
                      {formatRupiah(invoice.grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* TERBILANG BOX */}
            <div className="relative z-10 mb-6 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <span className="text-slate-500 font-semibold">Terbilang : </span>
              <span className="italic font-bold text-slate-900"># {terbilangText} #</span>
            </div>

            {/* BANK & KETENTUAN */}
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 text-xs">
              {/* Rekening Pembayaran */}
              <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-3.5">
                <p className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
                  Rekening Pembayaran Resmi:
                </p>
                {invoice.selectedBanks && invoice.selectedBanks.length > 0 ? (
                  <div className="space-y-2">
                    {invoice.selectedBanks.map(bank => (
                      <div key={bank.id} className="text-xs bg-white p-2 rounded-lg border border-slate-200">
                        <p className="font-bold text-sky-800">{bank.name}</p>
                        <p className="font-mono font-extrabold text-slate-900 text-sm tracking-wide">{bank.accountNumber}</p>
                        <p className="text-[10px] text-slate-500 font-medium">a.n. {bank.accountHolder}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 italic py-2">
                    Informasi nomor rekening pembayaran dapat dikonfirmasi ke admin.
                  </div>
                )}
              </div>

              {/* Syarat & Ketentuan */}
              <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3.5">
                <p className="font-bold text-amber-900 text-[11px] uppercase tracking-wider mb-2 border-b border-amber-200 pb-1">
                  Syarat & Ketentuan Pembayaran:
                </p>
                <div className="text-[11px] text-amber-900 space-y-1.5 leading-relaxed">
                  <p>1. Bukti transfer mohon dikirimkan ke admin untuk verifikasi pembayaran.</p>
                  {invoice.termsAndConditions && (
                    <p className="font-medium pt-1 border-t border-amber-200">
                      {invoice.termsAndConditions}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* TANDA TANGAN */}
            <div className="relative z-10 pt-2 text-xs">
              <div className="flex justify-between items-end">
                <div className="text-slate-400 text-[10px] space-y-0.5">
                  <p className="font-mono">Dokumen Resmi Mateha Production</p>
                  <p>Dicetak pada: {new Date().toLocaleDateString('id-ID')}</p>
                </div>

                <div className="text-center w-60">
                  <p className="text-xs text-slate-600 mb-1">Bandung, {formattedDate}</p>
                  <p className="text-xs font-semibold text-slate-800 mb-2">Hormat Kami,</p>
                  <div className="relative h-20 flex items-center justify-center">
                    <img src="/logo-ttd.png" alt="Tanda Tangan CEO" className="w-36 max-h-20 object-contain mx-auto" />
                  </div>
                  <p className="font-extrabold text-slate-950 text-sm underline underline-offset-2">
                    Dhifa Aksa Hermawan
                  </p>
                  <p className="text-[11px] text-slate-600 font-medium mt-0.5">CEO Mateha Production</p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
