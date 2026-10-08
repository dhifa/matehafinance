import React, { useState } from "react";
import { Quotation, formatRupiah } from "../types";
import { generateQuotationPdfBlob } from "../utils/pdfGenerator";
import { saveAs } from "file-saver";
import { notify } from "../utils/notification";
import { formatDateString } from "../utils/date";
import { terbilang } from "../utils/numberToWords";
import { Download, Printer, X, FileText, Loader2, Copy, Check, UserCheck, Trash2 } from "lucide-react";
import { paginateDocumentItems } from "../utils/documentPagination";

export default function QuotationPreview({ 
  quotation, 
  onClose,
  onDelete
}: { 
  quotation: Quotation; 
  onClose: () => void;
  onDelete?: (quotation: Quotation) => void;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showClientApproval, setShowClientApproval] = useState<boolean>(!!quotation.showClientApproval);

  const formattedDate = formatDateString(quotation.date);
  const formattedValidUntil = quotation.validUntil ? formatDateString(quotation.validUntil) : "14 Hari sejak diterbitkan";
  const terbilangText = terbilang(quotation.grandTotal) + " Rupiah";

  const pagination = paginateDocumentItems(quotation.items);

  const exportPdf = async () => {
    setIsExporting(true);
    try {
      const activeQuotation: Quotation = {
        ...quotation,
        showClientApproval,
      };
      const blob = await generateQuotationPdfBlob(activeQuotation);
      const cleanFileName = `Quotation_${quotation.quotationNumber.replace(/\//g, '_')}_${quotation.customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      saveAs(blob, cleanFileName);
    } catch (err) {
      console.error("Error generating quotation PDF:", err);
      notify.error("Gagal mengunduh PDF. Silakan coba lagi.", "Unduh Gagal");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const copySummaryForWA = () => {
    let itemsText = quotation.items.map((item, idx) => {
      return `${idx + 1}. *${item.description.replace(/\n/g, ' ')}*\n   Qty: ${item.qty} | Harga: ${formatRupiah(item.price)} | Subtotal: *${formatRupiah(item.total)}*`;
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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl sm:rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        
        {/* Top Control Bar (Hidden on Print) */}
        <div className="no-print px-4 sm:px-6 py-3.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Pratinjau Surat Penawaran Harga</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-sky-500/20 text-sky-300 rounded-md uppercase">Quotation</span>
                {pagination.isMultiPage && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 rounded-md">
                    {pagination.totalPages} Lembar
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-sky-400 font-semibold">{quotation.quotationNumber}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowClientApproval(!showClientApproval)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                showClientApproval 
                  ? "bg-cyan-950/90 border-cyan-500/80 text-cyan-300" 
                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400"
              }`}
              title="Aktifkan atau sembunyikan kolom pengesahan klien secara dinamis"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Approval Klien:</span>
              <span>{showClientApproval ? "ON" : "OFF"}</span>
            </button>

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
        <div className="p-3 sm:p-6 md:p-8 overflow-y-auto bg-slate-950/60 flex flex-col items-center space-y-6">
          {pagination.pages.map((page) => (
            <div key={page.pageIndex} className="w-full max-w-3xl">
              {pagination.isMultiPage && (
                <div className="no-print flex items-center justify-between text-xs font-semibold text-slate-400 mb-2 px-1">
                  <span className="flex items-center gap-1.5 text-sky-400 font-mono text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                    LEMBAR {page.pageNumber} DARI {page.totalPages}
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">{quotation.quotationNumber}</span>
                </div>
              )}

              <div className="print-sheet bg-white text-slate-900 p-8 sm:p-12 md:p-14 rounded-xl shadow-2xl w-full text-xs sm:text-[13px] relative font-sans leading-relaxed border border-slate-200">
                
                {/* Watermark Logo */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.035] z-0 overflow-hidden">
                  <img src="/logo-mateha.png" alt="Mateha Watermark" className="w-[450px] filter grayscale" />
                </div>

                {/* PAGE CONTENT */}
                <div className="relative z-10">
                  {page.isFirstPage ? (
                    <>
                      {/* KOP SURAT RESMI */}
                      <div>
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

                      {/* DOKUMEN HEADER / JUDUL SURAT */}
                      <div className="mb-6">
                        <div className="text-center mb-5">
                          <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
                            SURAT PENAWARAN HARGA
                          </h1>
                          <p className="text-xs font-mono font-bold text-sky-700 tracking-wider mt-0.5">
                            NO: {quotation.quotationNumber}
                          </p>
                        </div>

                        {/* Metadata Surat & Tanggal */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 border border-slate-200 rounded-xl p-4 text-xs">
                          <div className="space-y-1.5">
                            <div className="flex">
                              <span className="w-24 text-slate-500 font-semibold">Perihal</span>
                              <span className="font-bold text-slate-900">: {quotation.subject || "Penawaran Kerjasama Acara"}</span>
                            </div>
                            <div className="flex">
                              <span className="w-24 text-slate-500 font-semibold">Lampiran</span>
                              <span className="text-slate-700">: {pagination.totalPages > 1 ? `${pagination.totalPages} (Berkas) Penawaran` : '1 (Satu) Berkas Penawaran'}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5 sm:text-right">
                            <div>
                              <span className="text-slate-500 font-semibold">Tanggal: </span>
                              <strong className="text-slate-900">{formattedDate}</strong>
                            </div>
                            <div>
                              <span className="text-slate-500 font-semibold">Masa Berlaku: </span>
                              <strong className="text-sky-700">{formattedValidUntil}</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* TUJUAN SURAT (KEPADA YTH) */}
                      <div className="mb-5 text-xs">
                        <p className="text-slate-500 font-bold uppercase tracking-wider text-[11px] mb-1">Kepada Yth:</p>
                        <div className="pl-0 text-slate-800 space-y-0.5">
                          <p className="font-extrabold text-base text-slate-950">{quotation.customerName}</p>
                          {quotation.customerContact && (
                            <p className="text-slate-600">
                              <strong className="text-slate-700">Up / PIC:</strong> {quotation.customerContact}
                            </p>
                          )}
                          {quotation.customerPhone && (
                            <p className="text-slate-600">
                              <strong className="text-slate-700">Telepon / WhatsApp:</strong> {quotation.customerPhone}
                            </p>
                          )}
                          <p className="text-slate-500 italic">Di Tempat</p>
                        </div>
                      </div>

                      {/* KALIMAT PENGANTAR */}
                      <div className="mb-4 text-xs sm:text-[13px] text-slate-700 leading-relaxed text-justify">
                        <p>
                          Dengan hormat, sehubungan dengan rencana kegiatan yang akan diselenggarakan, bersama surat ini kami dari <strong>Mateha Production</strong> mengajukan penawaran harga pengadaan layanan dan peralatan teknis dengan rincian spesifikasi sebagai berikut:
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* KOP LANJUTAN UNTUK SHEET 2 DST */}
                      <div className="mb-4">
                        <div className="flex justify-between items-center pb-2">
                          <div>
                            <img src="/logo-mateha.png" alt="Mateha Logo" className="w-36 object-contain" />
                          </div>
                          <div className="text-right text-[11px] text-slate-500">
                            <p className="font-bold text-slate-900">MATEHA PRODUCTION</p>
                            <p className="text-[10px]">Hotline WA: +62 811-1244-7701</p>
                          </div>
                        </div>
                        <div className="border-t-2 border-slate-900 mt-1 mb-4 pt-0.5 border-b border-slate-300"></div>

                        {/* Reference Banner */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                          <div>
                            <span className="font-bold text-slate-900 uppercase">SURAT PENAWARAN HARGA (LANJUTAN)</span>
                            <span className="text-sky-700 font-mono font-bold ml-2">NO: {quotation.quotationNumber}</span>
                          </div>
                          <div className="text-slate-600">
                            Kepada Yth: <strong className="text-slate-900">{quotation.customerName}</strong>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* TABEL RINCIAN PENAWARAN HALAMAN INI */}
                  <div className="mb-5 overflow-x-auto">
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
                        {page.items.map(({ item, originalIndex }) => (
                          <tr key={originalIndex} className={originalIndex % 2 === 1 ? "bg-slate-50/70" : "bg-white"}>
                            <td className="py-2 px-3 border border-slate-200 text-center font-semibold text-slate-600 align-top">
                              {originalIndex + 1}
                            </td>
                            <td className="py-2 px-3 border border-slate-200 text-slate-900 leading-relaxed align-top">
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
                            <td className="py-2 px-3 border border-slate-200 text-center font-semibold text-slate-700 align-top">
                              {item.qty}
                            </td>
                            <td className="py-2 px-3 border border-slate-200 text-right text-slate-700 font-mono align-top">
                              {formatRupiah(item.price)}
                            </td>
                            <td className="py-2 px-3 border border-slate-200 text-right font-bold text-slate-950 font-mono align-top">
                              {formatRupiah(item.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>

                      {page.isLastPage && (
                        <tfoot>
                          <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-xs text-slate-800">
                            <td colSpan={3} className="py-2 px-3 border border-slate-300 text-right uppercase tracking-wider">
                              Subtotal
                            </td>
                            <td colSpan={2} className="py-2 px-3 border border-slate-300 text-right font-mono font-bold text-slate-900">
                              {formatRupiah(quotation.grandTotal)}
                            </td>
                          </tr>
                          <tr className="bg-slate-900 text-white font-extrabold text-sm">
                            <td colSpan={3} className="py-2.5 px-3 border border-slate-900 text-right uppercase tracking-wider">
                              Total Penawaran
                            </td>
                            <td colSpan={2} className="py-2.5 px-3 border border-slate-900 text-right font-mono text-cyan-300 text-base">
                              {formatRupiah(quotation.grandTotal)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {!page.isLastPage && (
                    <div className="bg-slate-100 border border-dashed border-slate-300 rounded-xl p-3 text-center text-slate-600 font-semibold text-xs my-4">
                      [ ➔ Rincian Layanan & Lembar Pengesahan Bersambung ke Lembar {page.pageNumber + 1} dari {page.totalPages} ]
                    </div>
                  )}

                  {page.isLastPage && (
                    <>
                      {/* TERBILANG BOX */}
                      <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                        <span className="text-slate-500 font-semibold">Terbilang : </span>
                        <span className="italic font-bold text-slate-900"># {terbilangText} #</span>
                      </div>

                      {/* SYARAT KETENTUAN & REKENING PEMBAYARAN */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 text-xs print-avoid-break">
                        {/* Syarat & Ketentuan */}
                        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-3.5">
                          <p className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
                            Syarat & Ketentuan Penawaran:
                          </p>
                          <div className="text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
                            <p>1. Harga sudah termasuk biaya instalasi dan operator teknisi selama acara.</p>
                            <p>2. Konfirmasi pemesanan dilakukan dengan DP minimal 50%, pelunasan saat acara.</p>
                            {quotation.termsAndConditions && (
                              <p className="text-slate-800 font-medium pt-1 border-t border-slate-200">
                                Catatan: {quotation.termsAndConditions}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Rekening Pembayaran */}
                        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-3.5">
                          <p className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
                            Rekening Pembayaran Resmi:
                          </p>
                          {quotation.selectedBanks && quotation.selectedBanks.length > 0 ? (
                            <div className="space-y-2">
                              {quotation.selectedBanks.map(bank => (
                                <div key={bank.id} className="text-xs bg-white p-2 rounded-lg border border-slate-200">
                                  <p className="font-bold text-sky-800">{bank.name}</p>
                                  <p className="font-mono font-extrabold text-slate-900 text-sm tracking-wide">{bank.accountNumber}</p>
                                  <p className="text-[10px] text-slate-500 font-medium">a.n. {bank.accountHolder}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 italic py-2">
                              Nomor rekening pembayaran akan disertakan dalam konfirmasi final atau faktur invoice.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* KALIMAT PENUTUP & TANDA TANGAN */}
                      <div className="pt-2 text-xs print-avoid-break">
                        <p className="text-slate-700 leading-relaxed mb-6">
                          Demikian surat penawaran harga ini kami sampaikan. Besar harapan kami untuk dapat bekerjasama dalam menyukseskan acara Anda. Atas perhatian dan kepercayaannya, kami ucapkan terima kasih.
                        </p>

                        {showClientApproval ? (
                          <div className="flex justify-between items-end gap-6 pt-1">
                            {/* KOLOM APPROVAL KLIEN */}
                            <div className="text-center w-56 sm:w-64">
                              <p className="text-xs text-slate-600 mb-1">Disetujui & Diterima Oleh,</p>
                              <p className="text-xs font-bold text-slate-900 mb-2">Pihak Klien / Pemesan</p>
                              <div className="h-24" />
                              <p className="font-extrabold text-slate-950 text-sm underline underline-offset-2">
                                {quotation.clientApprovalName || quotation.customerContact || "( ................................... )"}
                              </p>
                              <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                                {quotation.clientApprovalTitle || quotation.customerName || "Klien / Pemesan"}
                              </p>
                            </div>

                            {/* KOLOM TANDA TANGAN MATEHA */}
                            <div className="text-center w-56 sm:w-64">
                              <p className="text-xs text-slate-600 mb-1">Bandung, {formattedDate}</p>
                              <p className="text-xs font-bold text-slate-900 mb-2">Hormat Kami,</p>
                              <div className="relative h-24 flex items-center justify-center">
                                <img src="/logo-ttd.png" alt="Tanda Tangan CEO" className="w-48 max-h-24 object-contain mx-auto scale-125" />
                              </div>
                              <p className="font-extrabold text-slate-950 text-sm underline underline-offset-2">
                                Dhifa Aksa Hermawan
                              </p>
                              <p className="text-[11px] text-slate-600 font-medium mt-0.5">CEO Mateha Production</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-end">
                            <div className="text-slate-400 text-[10px] space-y-0.5">
                              <p className="font-mono">Dokumen Resmi Mateha Production</p>
                              <p>Dicetak pada: {new Date().toLocaleDateString('id-ID')}</p>
                            </div>

                            <div className="text-center w-60">
                              <p className="text-xs text-slate-600 mb-1">Bandung, {formattedDate}</p>
                              <p className="text-xs font-semibold text-slate-800 mb-2">Hormat Kami,</p>
                              <div className="relative h-24 flex items-center justify-center">
                                <img src="/logo-ttd.png" alt="Tanda Tangan CEO" className="w-48 max-h-24 object-contain mx-auto scale-125" />
                              </div>
                              <p className="font-extrabold text-slate-950 text-sm underline underline-offset-2">
                                Dhifa Aksa Hermawan
                              </p>
                              <p className="text-[11px] text-slate-600 font-medium mt-0.5">CEO Mateha Production</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* DOCUMENT FOOTER */}
                  <div className="border-t border-slate-200 mt-6 pt-2.5 flex justify-between items-center text-[10px] text-slate-400 font-mono">
                    <span>Dokumen Resmi Mateha Production • Lembar {page.pageNumber} dari {page.totalPages}</span>
                    <span>No: {quotation.quotationNumber}</span>
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
