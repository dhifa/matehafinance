import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Invoice, Quotation, Kwitansi, formatRupiah } from '../types';
import { terbilang } from './numberToWords';
import { INDONESIAN_MONTHS, formatDateString } from './date';
import { paginateDocumentItems } from './documentPagination';

const cachedBase64: Record<string, string> = {};

const loadBase64Image = async (src: string): Promise<string> => {
  if (cachedBase64[src]) return cachedBase64[src];
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        cachedBase64[src] = base64;
        resolve(base64);
      };
      reader.onerror = () => resolve(src);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return src;
  }
};

const renderDescriptionPdf = (description: string) => {
  if (!description) return '';
  return description
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        return `<div style="padding-left: 10px; margin-bottom: 2px; color: #475569;">• ${trimmed.substring(1).trim()}</div>`;
      }
      return `<div style="margin-bottom: 2px; font-weight: 600; color: #0f172a;">${line}</div>`;
    })
    .join('');
};

/**
 * Universal robust renderer from HTML container to jsPDF Blob using html2canvas.
 * When .pdf-page elements exist, each page is rendered to its own dedicated A4 page,
 * ensuring table rows and signatures are NEVER sliced across sheets.
 */
const renderContainerToPdfBlob = async (container: HTMLElement): Promise<Blob> => {
  document.body.appendChild(container);

  // Allow layout and image decoding
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    const pageElements = Array.from(container.querySelectorAll<HTMLElement>('.pdf-page'));

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

    if (pageElements.length > 0) {
      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];
        if (i > 0) {
          pdf.addPage();
        }
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: 794,
          windowWidth: 794,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      return pdf.output('blob');
    }

    // Fallback for containers without .pdf-page
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    if (imgHeight <= pdfHeight) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
    }

    return pdf.output('blob');
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
};

export const generateQuotationPdfBlob = async (quotation: Quotation): Promise<Blob> => {
  const logoMateha = await loadBase64Image('/logo-mateha.png');
  const logoTtd = await loadBase64Image('/logo-ttd.png');

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '999999';
  container.style.pointerEvents = 'none';
  container.style.boxSizing = 'border-box';
  container.style.color = '#0f172a';
  container.style.fontFamily = "Arial, Helvetica, sans-serif";

  const formattedDate = formatDateString(quotation.date);
  const formattedValidUntil = quotation.validUntil ? formatDateString(quotation.validUntil) : '14 Hari sejak diterbitkan';
  const terbilangAmount = terbilang(quotation.grandTotal) + ' Rupiah';

  const pagination = paginateDocumentItems(quotation.items);

  const pagesHtml = pagination.pages.map((page) => {
    return `
      <div class="pdf-page" style="width: 794px; min-height: 1120px; max-height: 1120px; padding: 36px 44px; background: #ffffff; position: relative; box-sizing: border-box; font-size: 11.5px; line-height: 1.45; color: #1e293b; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
        <!-- Watermark -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0.035; z-index: 0;">
          <img src="${logoMateha}" style="width: 440px; filter: grayscale(100%);" />
        </div>

        <!-- TOP SECTION -->
        <div style="position: relative; z-index: 10;">
          ${page.isFirstPage ? `
            <!-- KOP SURAT RESMI HALAMAN 1 -->
            <div style="margin-bottom: 14px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: middle; width: 45%;">
                    <img src="${logoMateha}" alt="Logo Mateha" style="width: 170px; margin-bottom: 4px; display: block;" />
                    <p style="font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; margin: 0; letter-spacing: 0.5px;">Event Production & Multimedia Specialist</p>
                  </td>
                  <td style="vertical-align: middle; width: 55%; text-align: right; font-size: 11px; color: #475569; line-height: 1.35;">
                    <p style="font-weight: 900; color: #0f172a; font-size: 13px; margin: 0 0 2px 0;">MATEHA PRODUCTION</p>
                    <p style="margin: 0;">Komplek BTN No.6A, Sekejati, Kec. Buahbatu</p>
                    <p style="margin: 0;">Kota Bandung, Jawa Barat 40286</p>
                    <p style="margin: 2px 0 0 0; color: #0284c7; font-weight: 700;">WA: +62 811-1244-7701 | matehaproduction@gmail.com</p>
                  </td>
                </tr>
              </table>
              <div style="border-top: 2px solid #0f172a; margin-top: 8px; margin-bottom: 12px; border-bottom: 1px solid #94a3b8; padding-top: 2px;"></div>
            </div>

            <!-- JUDUL SURAT -->
            <div style="text-align: center; margin-bottom: 12px;">
              <h1 style="font-size: 19px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">SURAT PENAWARAN HARGA</h1>
              <p style="color: #0284c7; font-size: 12px; font-weight: 800; margin: 2px 0 0 0; font-family: monospace;">NO: ${quotation.quotationNumber}</p>
            </div>
            
            <!-- METADATA SURAT & TANGGAL -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <tr>
                  <td style="width: 55%; vertical-align: top; line-height: 1.5;">
                    <table style="border-collapse: collapse;">
                      <tr>
                        <td style="color: #64748b; font-weight: 600; width: 70px;">Perihal</td>
                        <td style="color: #0f172a; font-weight: 800;">: ${quotation.subject || "Penawaran Kerjasama Acara"}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-weight: 600;">Lampiran</td>
                        <td style="color: #334155;">: ${pagination.totalPages > 1 ? `${pagination.totalPages} (Berkas) Penawaran` : '1 (Satu) Berkas Penawaran'}</td>
                      </tr>
                    </table>
                  </td>
                  <td style="width: 45%; vertical-align: top; text-align: right; line-height: 1.5;">
                    <p style="margin: 0;"><span style="color: #64748b;">Tanggal:</span> <strong style="color: #0f172a;">${formattedDate}</strong></p>
                    <p style="margin: 0;"><span style="color: #64748b;">Masa Berlaku:</span> <strong style="color: #0284c7;">${formattedValidUntil}</strong></p>
                  </td>
                </tr>
              </table>
            </div>

            <!-- KEPADA YTH -->
            <div style="margin-bottom: 12px; font-size: 11px; line-height: 1.4;">
              <p style="color: #64748b; font-weight: 800; text-transform: uppercase; font-size: 9.5px; margin: 0 0 2px 0; letter-spacing: 0.5px;">Kepada Yth:</p>
              <p style="font-weight: 900; font-size: 13.5px; color: #0f172a; margin: 0;">${quotation.customerName}</p>
              ${quotation.customerContact ? `<p style="margin: 1px 0 0 0; color: #475569;"><strong>Up / PIC:</strong> ${quotation.customerContact}</p>` : ''}
              ${quotation.customerPhone ? `<p style="margin: 1px 0 0 0; color: #475569;"><strong>Kontak / WA:</strong> ${quotation.customerPhone}</p>` : ''}
              <p style="margin: 1px 0 0 0; color: #64748b; font-style: italic;">Di Tempat</p>
            </div>

            <!-- KALIMAT PENGANTAR -->
            <div style="margin-bottom: 10px; font-size: 11px; color: #334155; line-height: 1.5; text-align: justify;">
              Dengan hormat, sehubungan dengan rencana kegiatan yang akan diselenggarakan, bersama surat ini kami dari <strong>Mateha Production</strong> mengajukan penawaran harga pengadaan layanan dan peralatan teknis dengan rincian spesifikasi sebagai berikut:
            </div>
          ` : `
            <!-- KOP LANJUTAN UNTUK LEMBAR 2 DST -->
            <div style="margin-bottom: 12px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: middle; width: 50%;">
                    <img src="${logoMateha}" alt="Logo Mateha" style="width: 140px; display: block;" />
                  </td>
                  <td style="vertical-align: middle; width: 50%; text-align: right; font-size: 10.5px; color: #64748b;">
                    <p style="margin: 0; font-weight: 800; color: #0f172a; font-size: 11px;">MATEHA PRODUCTION</p>
                    <p style="margin: 0; font-size: 9.5px;">Hotline WA: +62 811-1244-7701 | matehaproduction@gmail.com</p>
                  </td>
                </tr>
              </table>
              <div style="border-top: 1.5px solid #0f172a; margin-top: 6px; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-top: 2px;"></div>
            </div>

            <!-- CONTINUATION REFERENCE BANNER -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
              <div>
                <strong style="color: #0f172a; text-transform: uppercase;">SURAT PENAWARAN HARGA (LANJUTAN)</strong>
                <span style="color: #64748b; margin-left: 8px;">No: <strong style="color: #0284c7; font-family: monospace;">${quotation.quotationNumber}</strong></span>
              </div>
              <div style="color: #475569;">
                Klien: <strong style="color: #0f172a;">${quotation.customerName}</strong>
              </div>
            </div>
          `}

          <!-- TABEL RINCIAN ITEM HALAMAN INI -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
            <thead>
              <tr style="background-color: #0f172a; color: #ffffff;">
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: center; text-transform: uppercase; width: 30px; border: 1px solid #0f172a;">No</th>
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: left; text-transform: uppercase; border: 1px solid #0f172a;">Deskripsi Layanan / Item</th>
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: center; text-transform: uppercase; width: 45px; border: 1px solid #0f172a;">Qty</th>
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: right; text-transform: uppercase; width: 110px; border: 1px solid #0f172a;">Harga Satuan</th>
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: right; text-transform: uppercase; width: 120px; border: 1px solid #0f172a;">Sub Total</th>
              </tr>
            </thead>
            <tbody>
              ${page.items.map(({ item, originalIndex }) => `
                <tr style="background-color: ${originalIndex % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 6px 10px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; vertical-align: top; color: #64748b;">${originalIndex + 1}</td>
                  <td style="padding: 6px 10px; font-size: 10.5px; border: 1px solid #cbd5e1; vertical-align: top; line-height: 1.35;">${renderDescriptionPdf(item.description)}</td>
                  <td style="padding: 6px 10px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; vertical-align: top; font-weight: 700; color: #334155;">${item.qty}</td>
                  <td style="padding: 6px 10px; font-size: 10.5px; text-align: right; border: 1px solid #cbd5e1; vertical-align: top; font-family: monospace; color: #334155;">${formatRupiah(item.price)}</td>
                  <td style="padding: 6px 10px; font-size: 10.5px; text-align: right; border: 1px solid #cbd5e1; vertical-align: top; font-weight: 800; color: #0f172a; font-family: monospace;">${formatRupiah(item.total)}</td>
                </tr>
              `).join('')}

              ${page.isLastPage ? `
                <tr style="background-color: #f1f5f9; font-weight: 800;">
                  <td colspan="3" style="padding: 6px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #475569;">Subtotal</td>
                  <td colspan="2" style="padding: 6px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; font-family: monospace; color: #0f172a;">${formatRupiah(quotation.grandTotal)}</td>
                </tr>
                <tr style="background-color: #0f172a; color: #ffffff; font-weight: 900;">
                  <td colspan="3" style="padding: 7px 10px; text-align: right; border: 1px solid #0f172a; font-size: 10.5px; text-transform: uppercase;">Total Penawaran</td>
                  <td colspan="2" style="padding: 7px 10px; text-align: right; border: 1px solid #0f172a; font-size: 12.5px; font-family: monospace; color: #38bdf8;">${formatRupiah(quotation.grandTotal)}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          ${!page.isLastPage ? `
            <!-- INDICATOR BERSAMBUNG KE LEMBAR BERIKUTNYA -->
            <div style="background: #f1f5f9; border: 1px dashed #94a3b8; border-radius: 6px; padding: 7px 12px; text-align: center; color: #334155; font-weight: 700; font-size: 10.5px; margin-top: 8px;">
              [ ➔ Rincian Layanan & Pengesahan Bersambung ke Lembar ${page.pageNumber + 1} dari ${page.totalPages} ]
            </div>
          ` : `
            <!-- TERBILANG -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; font-size: 10.5px;">
              <span style="color: #64748b; font-weight: 600;">Terbilang : </span>
              <strong style="color: #0f172a; font-style: italic;"># ${terbilangAmount} #</strong>
            </div>

            <!-- SYARAT & REKENING PEMBAYARAN -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px;">
              <tr>
                <td style="width: 52%; vertical-align: top; padding-right: 10px;">
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 9px;">
                    <p style="font-weight: 800; color: #0f172a; margin: 0 0 3px 0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">Syarat & Ketentuan Penawaran:</p>
                    <div style="color: #475569; line-height: 1.35;">
                      <p style="margin: 0 0 2px 0;">1. Harga sudah termasuk biaya instalasi dan operator teknisi selama acara.</p>
                      <p style="margin: 0 0 2px 0;">2. Konfirmasi pemesanan dilakukan dengan DP minimal 50%, pelunasan saat acara.</p>
                      ${quotation.termsAndConditions ? `<p style="margin: 2px 0 0 0; color: #1e293b; font-weight: 600; border-top: 1px dashed #cbd5e1; padding-top: 2px;">Catatan: ${quotation.termsAndConditions}</p>` : ''}
                    </div>
                  </div>
                </td>
                <td style="width: 48%; vertical-align: top;">
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 9px;">
                    <p style="font-weight: 800; color: #0f172a; margin: 0 0 3px 0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">Rekening Pembayaran Resmi:</p>
                    ${quotation.selectedBanks && quotation.selectedBanks.length > 0 ? quotation.selectedBanks.map(bank => `
                      <div style="margin-bottom: 2px; padding-bottom: 2px; border-bottom: 1px dashed #cbd5e1;">
                        <span style="font-weight: 700; color: #0284c7;">${bank.name}</span>: 
                        <strong style="font-family: monospace; font-size: 10.5px; color: #0f172a;">${bank.accountNumber}</strong>
                        <span style="color: #64748b; font-size: 9px;"> (a.n. ${bank.accountHolder})</span>
                      </div>
                    `).join('') : '<p style="margin: 0; color: #64748b; font-style: italic;">Nomor rekening akan dikonfirmasikan pada invoice resmi.</p>'}
                  </div>
                </td>
              </tr>
            </table>

            <!-- PENUTUP -->
            <div style="margin-bottom: 6px; font-size: 10.5px; color: #334155; line-height: 1.4;">
              Demikian surat penawaran harga ini kami sampaikan. Besar harapan kami untuk dapat bekerjasama dalam menyukseskan acara Anda. Atas perhatian dan kepercayaannya, kami ucapkan terima kasih.
            </div>
          `}

          <!-- TANDA TANGAN (langsung di bawah konten, sama seperti pratinjau) -->
          ${page.isLastPage ? `<div style="padding-top: 8px;">
            ${quotation.showClientApproval ? `
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px;">
                <tr>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-right: 20px;">
                    <p style="margin: 0 0 2px 0; color: #475569; font-size: 10.5px; line-height: 1.3;">Disetujui & Diterima Oleh,</p>
                  </td>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-left: 20px;">
                    <p style="margin: 0 0 2px 0; color: #475569; font-size: 10.5px; line-height: 1.3;">Bandung, ${formattedDate}</p>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-right: 20px;">
                    <p style="margin: 0 0 4px 0; font-weight: 700; color: #0f172a; font-size: 11px; line-height: 1.3;">Pihak Klien / Pemesan</p>
                  </td>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-left: 20px;">
                    <p style="margin: 0 0 4px 0; font-weight: 700; color: #0f172a; font-size: 11px; line-height: 1.3;">Hormat Kami,</p>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; height: 96px; vertical-align: middle; text-align: center; padding-right: 20px;">
                    <div style="height: 96px;"></div>
                  </td>
                  <td style="width: 50%; height: 96px; vertical-align: middle; text-align: center; padding-left: 20px;">
                    <div style="height: 96px; display: flex; align-items: center; justify-content: center;">
                      <img src="${logoTtd}" alt="TTD" style="height: 96px; max-height: 96px; width: auto; max-width: 220px; object-fit: contain; margin: 0 auto; display: block;" />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; vertical-align: bottom; text-align: center; padding-right: 20px;">
                    <p style="font-weight: 900; color: #0f172a; margin: 0; font-size: 11.5px; line-height: 1.3; text-decoration: underline;">
                      ${quotation.clientApprovalName || quotation.customerContact || '( ................................... )'}
                    </p>
                  </td>
                  <td style="width: 50%; vertical-align: bottom; text-align: center; padding-left: 20px;">
                    <p style="font-weight: 900; color: #0f172a; margin: 0; font-size: 11.5px; line-height: 1.3; text-decoration: underline;">Dhifa Aksa Hermawan</p>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-right: 20px;">
                    <p style="color: #64748b; margin: 2px 0 0 0; font-size: 9.5px; line-height: 1.3; font-weight: 600;">
                      ${quotation.clientApprovalTitle || quotation.customerName || 'Klien / Pemesan'}
                    </p>
                  </td>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-left: 20px;">
                    <p style="color: #64748b; margin: 2px 0 0 0; font-size: 9.5px; line-height: 1.3; font-weight: 600;">CEO Mateha Production</p>
                  </td>
                </tr>
              </table>
            ` : `
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px;">
                <tr>
                  <td style="width: 60%; vertical-align: bottom; color: #94a3b8; font-size: 9px; font-family: monospace;">
                    Dokumen Resmi Mateha Production<br/>
                    Bandung - Jawa Barat
                  </td>
                  <td style="width: 40%; vertical-align: bottom; text-align: center;">
                    <p style="margin: 0 0 2px 0; color: #475569; font-size: 10.5px;">Bandung, ${formattedDate}</p>
                    <p style="margin: 0 0 3px 0; font-weight: 700; color: #0f172a; font-size: 11px;">Hormat Kami,</p>
                    <div style="height: 96px; display: flex; align-items: center; justify-content: center;">
                      <img src="${logoTtd}" alt="TTD" style="height: 96px; max-height: 96px; width: auto; max-width: 220px; object-fit: contain; margin: 0 auto; display: block;" />
                    </div>
                    <p style="font-weight: 900; color: #0f172a; margin: 0; font-size: 11.5px; text-decoration: underline;">Dhifa Aksa Hermawan</p>
                    <p style="color: #64748b; margin: 1px 0 0 0; font-size: 9.5px; font-weight: 600;">CEO Mateha Production</p>
                  </td>
                </tr>
              </table>
            `}
          </div>` : ''}
        </div>

        <!-- BOTTOM SECTION (PINNED TO BOTTOM) -->
        <div style="position: relative; z-index: 10; padding-top: 6px;">
          <!-- FOOTER DOKUMEN -->
          <div style="border-top: 1px solid #e2e8f0; padding-top: 4px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; font-family: monospace;">
            <span>Dokumen Resmi Mateha Production • Lembar ${page.pageNumber} dari ${page.totalPages}</span>
            <span>No: ${quotation.quotationNumber}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = pagesHtml;
  return renderContainerToPdfBlob(container);
};

export const generateInvoicePdfBlob = async (invoice: Invoice): Promise<Blob> => {
  const logoMateha = await loadBase64Image('/logo-mateha.png');
  const logoTtd = await loadBase64Image('/logo-ttd.png');

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '999999';
  container.style.pointerEvents = 'none';
  container.style.boxSizing = 'border-box';
  container.style.color = '#0f172a';
  container.style.fontFamily = "Arial, Helvetica, sans-serif";

  const formattedDate = formatDateString(invoice.date);
  const formattedDueDate = invoice.dueDate ? formatDateString(invoice.dueDate) : '-';
  const terbilangAmount = terbilang(invoice.grandTotal) + ' Rupiah';

  const pagination = paginateDocumentItems(invoice.items);

  const pagesHtml = pagination.pages.map((page) => {
    return `
      <div class="pdf-page" style="width: 794px; min-height: 1120px; max-height: 1120px; padding: 36px 44px; background: #ffffff; position: relative; box-sizing: border-box; font-size: 11.5px; line-height: 1.45; color: #1e293b; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
        <!-- Watermark -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0.035; z-index: 0;">
          <img src="${logoMateha}" style="width: 440px; filter: grayscale(100%);" />
        </div>

        <!-- TOP SECTION -->
        <div style="position: relative; z-index: 10;">
          ${page.isFirstPage ? `
            <!-- KOP SURAT RESMI HALAMAN 1 -->
            <div style="margin-bottom: 14px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: middle; width: 45%;">
                    <img src="${logoMateha}" alt="Logo Mateha" style="width: 170px; margin-bottom: 4px; display: block;" />
                    <p style="font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; margin: 0; letter-spacing: 0.5px;">Event Production & Multimedia Specialist</p>
                  </td>
                  <td style="vertical-align: middle; width: 55%; text-align: right; font-size: 11px; color: #475569; line-height: 1.35;">
                    <p style="font-weight: 900; color: #0f172a; font-size: 13px; margin: 0 0 2px 0;">MATEHA PRODUCTION</p>
                    <p style="margin: 0;">Komplek BTN No.6A, Sekejati, Kec. Buahbatu</p>
                    <p style="margin: 0;">Kota Bandung, Jawa Barat 40286</p>
                    <p style="margin: 2px 0 0 0; color: #0284c7; font-weight: 700;">WA: +62 811-1244-7701 | matehaproduction@gmail.com</p>
                  </td>
                </tr>
              </table>
              <div style="border-top: 2px solid #0f172a; margin-top: 8px; margin-bottom: 12px; border-bottom: 1px solid #94a3b8; padding-top: 2px;"></div>
            </div>

            <!-- JUDUL SURAT -->
            <div style="text-align: center; margin-bottom: 12px;">
              <h1 style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">${invoice.isDp ? `FAKTUR INVOICE (UANG MUKA / DP ${invoice.dpPercent ? `${invoice.dpPercent}%` : ''})` : 'INVOICE TAGIHAN'}</h1>
              <p style="color: #0284c7; font-size: 12px; font-weight: 800; margin: 2px 0 0 0; font-family: monospace;">NO: ${invoice.invoiceNumber}</p>
            </div>
            
            <!-- METADATA & RECIPIENT -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <tr>
                  <td style="width: 55%; vertical-align: top; line-height: 1.45;">
                    <p style="color: #64748b; font-weight: 800; text-transform: uppercase; font-size: 9.5px; margin: 0 0 2px 0;">Ditagihkan Kepada:</p>
                    <p style="font-weight: 900; font-size: 13.5px; color: #0f172a; margin: 0 0 2px 0;">${invoice.customerName}</p>
                    ${invoice.customerContact ? `<p style="margin: 0; color: #475569;"><strong>PIC:</strong> ${invoice.customerContact}</p>` : ''}
                    ${invoice.customerPhone ? `<p style="margin: 0; color: #475569;"><strong>Telp:</strong> ${invoice.customerPhone}</p>` : ''}
                  </td>
                  <td style="width: 45%; vertical-align: top; text-align: right; line-height: 1.5;">
                    <p style="margin: 0;"><span style="color: #64748b;">Tanggal Invoice:</span> <strong style="color: #0f172a;">${formattedDate}</strong></p>
                    ${invoice.dueDate ? `<p style="margin: 0;"><span style="color: #64748b;">Jatuh Tempo:</span> <strong style="color: #e11d48;">${formattedDueDate}</strong></p>` : ''}
                    ${invoice.subject ? `<p style="margin: 2px 0 0 0;"><span style="color: #64748b;">Perihal:</span> <strong style="color: #0284c7;">${invoice.subject}</strong></p>` : ''}
                  </td>
                </tr>
              </table>
            </div>
          ` : `
            <!-- KOP LANJUTAN UNTUK LEMBAR 2 DST -->
            <div style="margin-bottom: 12px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="vertical-align: middle; width: 50%;">
                    <img src="${logoMateha}" alt="Logo Mateha" style="width: 140px; display: block;" />
                  </td>
                  <td style="vertical-align: middle; width: 50%; text-align: right; font-size: 10.5px; color: #64748b;">
                    <p style="margin: 0; font-weight: 800; color: #0f172a; font-size: 11px;">MATEHA PRODUCTION</p>
                    <p style="margin: 0; font-size: 9.5px;">Hotline WA: +62 811-1244-7701 | matehaproduction@gmail.com</p>
                  </td>
                </tr>
              </table>
              <div style="border-top: 1.5px solid #0f172a; margin-top: 6px; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-top: 2px;"></div>
            </div>

            <!-- CONTINUATION REFERENCE BANNER -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
              <div>
                <strong style="color: #0f172a; text-transform: uppercase;">${invoice.isDp ? 'INVOICE UANG MUKA / DP (LANJUTAN)' : 'INVOICE TAGIHAN (LANJUTAN)'}</strong>
                <span style="color: #64748b; margin-left: 8px;">No: <strong style="color: #0284c7; font-family: monospace;">${invoice.invoiceNumber}</strong></span>
              </div>
              <div style="color: #475569;">
                Klien: <strong style="color: #0f172a;">${invoice.customerName}</strong>
              </div>
            </div>
          `}

          <!-- TABEL ITEM HALAMAN INI -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
            <thead>
              <tr style="background-color: #0f172a; color: #ffffff;">
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: center; text-transform: uppercase; width: 30px; border: 1px solid #0f172a;">No</th>
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: left; text-transform: uppercase; border: 1px solid #0f172a;">Deskripsi Layanan / Item</th>
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: center; text-transform: uppercase; width: 45px; border: 1px solid #0f172a;">Qty</th>
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: right; text-transform: uppercase; width: 110px; border: 1px solid #0f172a;">Harga Satuan</th>
                <th style="padding: 7px 10px; font-size: 9.5px; font-weight: 800; text-align: right; text-transform: uppercase; width: 120px; border: 1px solid #0f172a;">Sub Total</th>
              </tr>
            </thead>
            <tbody>
              ${page.items.map(({ item, originalIndex }) => `
                <tr style="background-color: ${originalIndex % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 6px 10px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; vertical-align: top; color: #64748b;">${originalIndex + 1}</td>
                  <td style="padding: 6px 10px; font-size: 10.5px; border: 1px solid #cbd5e1; vertical-align: top; line-height: 1.35;">${renderDescriptionPdf(item.description)}</td>
                  <td style="padding: 6px 10px; font-size: 10.5px; text-align: center; border: 1px solid #cbd5e1; vertical-align: top; font-weight: 700; color: #334155;">${item.qty}</td>
                  <td style="padding: 6px 10px; font-size: 10.5px; text-align: right; border: 1px solid #cbd5e1; vertical-align: top; font-family: monospace; color: #334155;">${formatRupiah(item.price)}</td>
                  <td style="padding: 6px 10px; font-size: 10.5px; text-align: right; border: 1px solid #cbd5e1; vertical-align: top; font-weight: 800; color: #0f172a; font-family: monospace;">${formatRupiah(item.total)}</td>
                </tr>
              `).join('')}

              ${page.isLastPage ? `
                ${invoice.isDp ? `
                  <tr style="background-color: #f8fafc; font-weight: 700;">
                    <td colspan="3" style="padding: 5px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #475569;">Total Nilai Kontrak / Proyek</td>
                    <td colspan="2" style="padding: 5px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 10.5px; font-family: monospace; color: #1e293b;">${formatRupiah(invoice.totalAmount || invoice.items.reduce((s, itm) => s + itm.total, 0))}</td>
                  </tr>
                  <tr style="background-color: #fef3c7; font-weight: 700;">
                    <td colspan="3" style="padding: 5px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #92400e;">Uang Muka (DP ${invoice.dpPercent ? `${invoice.dpPercent}%` : ''})</td>
                    <td colspan="2" style="padding: 5px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 10.5px; font-family: monospace; color: #92400e; font-weight: 800;">${formatRupiah(invoice.grandTotal)}</td>
                  </tr>
                  <tr style="background-color: #0f172a; color: #ffffff; font-weight: 900;">
                    <td colspan="3" style="padding: 7px 10px; text-align: right; border: 1px solid #0f172a; font-size: 10.5px; text-transform: uppercase;">Total Tagihan Faktur Ini (DP)</td>
                    <td colspan="2" style="padding: 7px 10px; text-align: right; border: 1px solid #0f172a; font-size: 12.5px; font-family: monospace; color: #38bdf8;">${formatRupiah(invoice.grandTotal)}</td>
                  </tr>
                  <tr style="background-color: #f1f5f9; font-weight: 600;">
                    <td colspan="3" style="padding: 4px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 9.5px; text-transform: uppercase; color: #64748b;">Sisa Tagihan (Pelunasan Nanti)</td>
                    <td colspan="2" style="padding: 4px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 10px; font-family: monospace; color: #475569;">${formatRupiah(invoice.remainingAmount ?? Math.max(0, (invoice.totalAmount || invoice.items.reduce((s, itm) => s + itm.total, 0)) - invoice.grandTotal))}</td>
                  </tr>
                ` : `
                  <tr style="background-color: #f1f5f9; font-weight: 800;">
                    <td colspan="3" style="padding: 6px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #475569;">Subtotal</td>
                    <td colspan="2" style="padding: 6px 10px; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; font-family: monospace; color: #0f172a;">${formatRupiah(invoice.grandTotal)}</td>
                  </tr>
                  <tr style="background-color: #0f172a; color: #ffffff; font-weight: 900;">
                    <td colspan="3" style="padding: 7px 10px; text-align: right; border: 1px solid #0f172a; font-size: 10.5px; text-transform: uppercase;">Total Tagihan</td>
                    <td colspan="2" style="padding: 7px 10px; text-align: right; border: 1px solid #0f172a; font-size: 12.5px; font-family: monospace; color: #38bdf8;">${formatRupiah(invoice.grandTotal)}</td>
                  </tr>
                `}
              ` : ''}
            </tbody>
          </table>

          ${!page.isLastPage ? `
            <!-- INDICATOR BERSAMBUNG KE LEMBAR BERIKUTNYA -->
            <div style="background: #f1f5f9; border: 1px dashed #94a3b8; border-radius: 6px; padding: 7px 12px; text-align: center; color: #334155; font-weight: 700; font-size: 10.5px; margin-top: 8px;">
              [ ➔ Rincian Tagihan & Lembar Pembayaran Bersambung ke Lembar ${page.pageNumber + 1} dari ${page.totalPages} ]
            </div>
          ` : `
            ${invoice.isDp ? `
              <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 5px 9px; margin-bottom: 8px; font-size: 10px; color: #92400e;">
                <strong>Catatan Uang Muka (DP):</strong> Faktur ini merupakan penagihan DP ${invoice.dpPercent ? `sebesar ${invoice.dpPercent}%` : ''} (${formatRupiah(invoice.grandTotal)}). Sisa tagihan kontrak sebesar <strong>${formatRupiah(invoice.remainingAmount ?? Math.max(0, (invoice.totalAmount || 0) - invoice.grandTotal))}</strong> akan ditagihkan pada invoice pelunasan berikutnya.
              </div>
            ` : ''}

            <!-- TERBILANG -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; font-size: 10.5px;">
              <span style="color: #64748b; font-weight: 600;">Terbilang : </span>
              <strong style="color: #0f172a; font-style: italic;"># ${terbilangAmount} #</strong>
            </div>

            <!-- BANK & SYARAT -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px;">
              <tr>
                <td style="width: 52%; vertical-align: top; padding-right: 10px;">
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 9px;">
                    <p style="font-weight: 800; color: #0f172a; margin: 0 0 3px 0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">Rekening Pembayaran Resmi:</p>
                    ${invoice.selectedBanks && invoice.selectedBanks.length > 0 ? invoice.selectedBanks.map(bank => `
                      <div style="margin-bottom: 2px; padding-bottom: 2px; border-bottom: 1px dashed #cbd5e1;">
                        <span style="font-weight: 700; color: #0284c7;">${bank.name}</span>: 
                        <strong style="font-family: monospace; font-size: 10.5px; color: #0f172a;">${bank.accountNumber}</strong>
                        <span style="color: #64748b; font-size: 9px;"> (a.n. ${bank.accountHolder})</span>
                      </div>
                    `).join('') : '<p style="margin: 0; color: #64748b; font-style: italic;">Transfer bank dapat dikonfirmasi ke admin.</p>'}
                  </div>
                </td>
                <td style="width: 48%; vertical-align: top;">
                  <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 9px;">
                    <p style="font-weight: 800; color: #92400e; margin: 0 0 3px 0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; border-bottom: 1px solid #fde68a; padding-bottom: 2px;">Syarat & Ketentuan Pembayaran:</p>
                    <p style="margin: 0; color: #78350f; font-size: 9.5px; line-height: 1.35;">1. Bukti transfer mohon dikirimkan ke admin untuk verifikasi pembayaran.</p>
                    ${invoice.termsAndConditions ? `<p style="margin: 2px 0 0 0; color: #78350f; font-size: 9.5px; line-height: 1.35; font-weight: 600; border-top: 1px solid #fde68a; padding-top: 2px;">${invoice.termsAndConditions}</p>` : ''}
                  </div>
                </td>
              </tr>
            </table>
          `}

          <!-- TANDA TANGAN (langsung di bawah konten, sama seperti pratinjau) -->
          ${page.isLastPage ? `<div style="padding-top: 8px;">
            ${invoice.showClientApproval ? `
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px;">
                <tr>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-right: 20px;">
                    <p style="margin: 0 0 2px 0; color: #475569; font-size: 10.5px; line-height: 1.3;">Disetujui & Diterima Oleh,</p>
                  </td>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-left: 20px;">
                    <p style="margin: 0 0 2px 0; color: #475569; font-size: 10.5px; line-height: 1.3;">Bandung, ${formattedDate}</p>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-right: 20px;">
                    <p style="margin: 0 0 4px 0; font-weight: 700; color: #0f172a; font-size: 11px; line-height: 1.3;">Pihak Klien / Pemesan</p>
                  </td>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-left: 20px;">
                    <p style="margin: 0 0 4px 0; font-weight: 700; color: #0f172a; font-size: 11px; line-height: 1.3;">Hormat Kami,</p>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; height: 96px; vertical-align: middle; text-align: center; padding-right: 20px;">
                    <div style="height: 96px;"></div>
                  </td>
                  <td style="width: 50%; height: 96px; vertical-align: middle; text-align: center; padding-left: 20px;">
                    <div style="height: 96px; display: flex; align-items: center; justify-content: center;">
                      <img src="${logoTtd}" alt="TTD" style="height: 96px; max-height: 96px; width: auto; max-width: 220px; object-fit: contain; margin: 0 auto; display: block;" />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; vertical-align: bottom; text-align: center; padding-right: 20px;">
                    <p style="font-weight: 900; color: #0f172a; margin: 0; font-size: 11.5px; line-height: 1.3; text-decoration: underline;">
                      ${invoice.clientApprovalName || invoice.customerContact || '( ................................... )'}
                    </p>
                  </td>
                  <td style="width: 50%; vertical-align: bottom; text-align: center; padding-left: 20px;">
                    <p style="font-weight: 900; color: #0f172a; margin: 0; font-size: 11.5px; text-decoration: underline;">Dhifa Aksa Hermawan</p>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-right: 20px;">
                    <p style="color: #64748b; margin: 2px 0 0 0; font-size: 9.5px; line-height: 1.3; font-weight: 600;">
                      ${invoice.clientApprovalTitle || invoice.customerName || 'Klien / Pemesan'}
                    </p>
                  </td>
                  <td style="width: 50%; vertical-align: top; text-align: center; padding-left: 20px;">
                    <p style="color: #64748b; margin: 2px 0 0 0; font-size: 9.5px; line-height: 1.3; font-weight: 600;">CEO Mateha Production</p>
                  </td>
                </tr>
              </table>
            ` : `
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px;">
                <tr>
                  <td style="width: 60%; vertical-align: bottom; color: #94a3b8; font-size: 9px; font-family: monospace;">
                    Dokumen Resmi Mateha Production<br/>
                    Bandung - Jawa Barat
                  </td>
                  <td style="width: 40%; vertical-align: bottom; text-align: center;">
                    <p style="margin: 0 0 2px 0; color: #475569; font-size: 10.5px;">Bandung, ${formattedDate}</p>
                    <p style="margin: 0 0 3px 0; font-weight: 700; color: #0f172a; font-size: 11px;">Hormat Kami,</p>
                    <div style="height: 96px; display: flex; align-items: center; justify-content: center;">
                      <img src="${logoTtd}" alt="TTD" style="height: 96px; max-height: 96px; width: auto; max-width: 220px; object-fit: contain; margin: 0 auto; display: block;" />
                    </div>
                    <p style="font-weight: 900; color: #0f172a; margin: 0; font-size: 11.5px; text-decoration: underline;">Dhifa Aksa Hermawan</p>
                    <p style="color: #64748b; margin: 1px 0 0 0; font-size: 9.5px; font-weight: 600;">CEO Mateha Production</p>
                  </td>
                </tr>
              </table>
            `}
          </div>` : ''}
        </div>

        <!-- BOTTOM SECTION (PINNED TO BOTTOM) -->
        <div style="position: relative; z-index: 10; padding-top: 6px;">
          <!-- FOOTER DOKUMEN -->
          <div style="border-top: 1px solid #e2e8f0; padding-top: 4px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; font-family: monospace;">
            <span>Dokumen Resmi Mateha Production • Lembar ${page.pageNumber} dari ${page.totalPages}</span>
            <span>No: ${invoice.invoiceNumber}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = pagesHtml;
  return renderContainerToPdfBlob(container);
};

export const generateKwitansiItemPdfBlob = async (kwitansi: Kwitansi): Promise<Blob> => {
  const logoMateha = await loadBase64Image('/logo-mateha.png');
  const logoTtd = await loadBase64Image('/logo-ttd.png');

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '999999';
  container.style.pointerEvents = 'none';
  container.style.boxSizing = 'border-box';
  container.style.color = '#0f172a';
  container.style.fontFamily = "Arial, Helvetica, sans-serif";

  const dateObj = kwitansi.date ? new Date(kwitansi.date) : new Date(kwitansi.createdAt || Date.now());
  const formattedDate = !isNaN(dateObj.getTime())
    ? `${dateObj.getDate()} ${INDONESIAN_MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`
    : new Date().toLocaleDateString('id-ID');
  const kwitansiNumber = kwitansi.kwitansiNumber;
  const terbilangAmount = (kwitansi.terbilangText || terbilang(kwitansi.amount)) + ' Rupiah';
  const receiverName = kwitansi.receiverName || 'Dhifa Aksa Hermawan';
  const receiverTitle = kwitansi.receiverTitle || 'CEO Mateha Production';

  container.innerHTML = `
    <div class="pdf-page" style="width: 794px; min-height: 1120px; max-height: 1120px; padding: 44px 50px; background: #ffffff; position: relative; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
      <!-- Watermark -->
      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0.04; z-index: 0;">
        <img src="${logoMateha}" style="width: 440px; filter: grayscale(100%);" />
      </div>

      <!-- TOP SECTION -->
      <div style="position: relative; z-index: 10;">
        <!-- Header -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 26px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <img src="${logoMateha}" style="width: 175px; margin-bottom: 6px; display: block;" />
            <p style="font-size: 11px; color: #64748b; margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Event Production & Multimedia Specialist</p>
          </div>
          <div style="text-align: right;">
            <h1 style="font-size: 30px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: -0.5px;">KWITANSI</h1>
            <p style="font-size: 13.5px; font-weight: 800; color: #0284c7; margin: 4px 0 0 0; font-family: monospace;">${kwitansiNumber}</p>
          </div>
        </div>

        <!-- Receipt Details Table -->
        <div style="text-align: left; margin-bottom: 28px; font-size: 13px; line-height: 1.8;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="width: 180px; padding: 12px 0; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 11.5px;">Telah Terima Dari</td>
              <td style="padding: 12px 0; font-weight: 800; color: #0f172a; font-size: 15.5px;">: ${kwitansi.customerName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="width: 180px; padding: 12px 0; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 11.5px;">Jumlah Uang</td>
              <td style="padding: 12px 0; font-weight: 900; color: #0284c7; font-size: 21px; font-family: monospace;">: ${formatRupiah(kwitansi.amount)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="width: 180px; padding: 12px 0; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 11.5px;">Terbilang</td>
              <td style="padding: 12px 0; font-style: italic; font-weight: 600; color: #334155; font-size: 13.5px;">: # ${terbilangAmount} #</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="width: 180px; padding: 12px 0; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 11.5px;">Untuk Pembayaran</td>
              <td style="padding: 12px 0; color: #1e293b; font-weight: 600; font-size: 14px; line-height: 1.5;">: ${kwitansi.paymentFor}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="width: 180px; padding: 12px 0; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 11.5px;">Metode Pembayaran</td>
              <td style="padding: 12px 0; color: #334155; font-weight: 600;">: ${kwitansi.paymentMethod || 'Transfer Bank'}</td>
            </tr>
          </table>
        </div>

        <!-- Lunas Badge -->
        <div style="border: 2px dashed #059669; background-color: #ecfdf5; padding: 14px 20px; margin-bottom: 28px; color: #065f46; font-weight: 800; font-size: 13px; display: flex; justify-content: space-between; border-radius: 8px;">
          <span>STATUS: LUNAS / VERIFIED PAYMENT</span>
          <span>${formattedDate}</span>
        </div>
      </div>

      <!-- BOTTOM SECTION -->
      <div style="position: relative; z-index: 10; padding-top: 10px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
          <tr>
            <td style="vertical-align: bottom; font-size: 11px; color: #64748b; line-height: 1.45;">
              <p style="font-weight: 900; color: #0f172a; margin: 0 0 2px 0; font-size: 12.5px;">MATEHA PRODUCTION</p>
              <p style="margin: 0;">Komplek BTN No.6A, Sekejati, Kec. Buahbatu</p>
              <p style="margin: 0;">Kota Bandung, Jawa Barat 40286</p>
              <p style="margin: 2px 0 0 0; color: #0284c7; font-weight: 700; font-size: 11px;">+62 811-1244-7701 | matehaproduction@gmail.com</p>
            </td>
            <td style="vertical-align: bottom; text-align: center; width: 230px;">
              <p style="font-size: 12px; color: #475569; margin: 0 0 2px 0;">Bandung, ${formattedDate}</p>
              <p style="font-size: 12px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">Yang Menerima,</p>
              <img src="${logoTtd}" style="width: 165px; max-height: 75px; object-fit: contain; margin: 0 auto 4px auto; display: block;" />
              <p style="font-weight: 800; text-decoration: underline; font-size: 13px; color: #0f172a; margin: 2px 0 0 0;">${receiverName}</p>
              <p style="font-size: 11px; color: #64748b; margin: 0; font-weight: 600;">${receiverTitle}</p>
            </td>
          </tr>
        </table>

        <!-- FOOTER DOKUMEN -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 4px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; font-family: monospace;">
          <span>Dokumen Resmi Mateha Production • Bukti Pembayaran Sah</span>
          <span>No: ${kwitansiNumber}</span>
        </div>
      </div>
    </div>
  `;

  return renderContainerToPdfBlob(container);
};

export const generateKwitansiPdfBlob = async (invoice: Invoice): Promise<Blob> => {
  const kwitansiItem: Kwitansi = {
    id: invoice.id,
    kwitansiNumber: invoice.invoiceNumber.replace('INV', 'KWT'),
    customerName: invoice.customerName,
    amount: invoice.grandTotal,
    terbilangText: terbilang(invoice.grandTotal),
    paymentFor: invoice.subject || `Pelunasan Invoice ${invoice.invoiceNumber}`,
    paymentMethod: 'Transfer Bank',
    date: invoice.date || new Date().toISOString().split('T')[0],
    receiverName: 'Dhifa Aksa Hermawan',
    receiverTitle: 'CEO Mateha Production',
    createdAt: invoice.createdAt,
  };
  return generateKwitansiItemPdfBlob(kwitansiItem);
};

export interface StaffPayslipPdfData {
  staffUsername: string;
  staffDisplayName: string;
  staffRole?: string;
  staffJob?: string;
  monthName: string;
  year: number;
  earnings: Array<{ description: string; amount: number; type?: string }>;
  deductions: Array<{ description: string; amount: number }>;
  totalEarnings: number;
  totalDeductions: number;
  takeHomePay: number;
  attendedEvents?: Array<{ name: string; date: string; location: string; daysCount: number }>;
  isPublished?: boolean;
}

export const buildStaffPayslipHtml = async (data: StaffPayslipPdfData): Promise<string> => {
  const logoMateha = await loadBase64Image('/logo-mateha.png');
  const logoTtd = await loadBase64Image('/logo-ttd.png');

  const earningsRows = data.earnings.length === 0
    ? `<tr><td colspan="2" style="padding: 8px 12px; text-align: center; color: #94a3b8; font-style: italic;">Tidak ada catatan pendapatan pada periode ini.</td></tr>`
    : data.earnings.map(e => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 10px; color: #1e293b; font-size: 11px;">
            ${e.description}
            ${e.type === 'reimbursement' ? '<span style="margin-left: 6px; font-size: 8.5px; background-color: #dcfce7; color: #166534; padding: 2px 4px; border-radius: 4px; font-weight: 700; font-family: monospace;">POINT B</span>' : ''}
          </td>
          <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a; font-size: 11px;">${formatRupiah(e.amount)}</td>
        </tr>
      `).join('');

  const deductionsRows = data.deductions.length === 0
    ? `<tr><td colspan="2" style="padding: 8px 12px; text-align: center; color: #94a3b8; font-style: italic;">Tidak ada potongan pada periode ini.</td></tr>`
    : data.deductions.map(d => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 10px; color: #1e293b; font-size: 11px;">${d.description}</td>
          <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; color: #be123c; font-size: 11px;">-${formatRupiah(d.amount)}</td>
        </tr>
      `).join('');

  const eventRows = (data.attendedEvents && data.attendedEvents.length > 0)
    ? data.attendedEvents.map(evt => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 10px; font-weight: 700; text-transform: uppercase; font-size: 10.5px; color: #0f172a;">${evt.name}</td>
          <td style="padding: 6px 10px; color: #475569; font-size: 10.5px;">${evt.date || '-'} • ${evt.location || '-'}</td>
          <td style="padding: 6px 10px; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a; font-size: 10.5px;">${evt.daysCount || 1} Hari</td>
        </tr>
      `).join('')
    : `<tr><td colspan="3" style="padding: 8px 12px; text-align: center; color: #94a3b8; font-style: italic;">Belum ada catatan keterlibatan event di sistem untuk bulan ini.</td></tr>`;

  return `
    <div style="padding: 36px 44px; background: #ffffff; position: relative; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11.5px; line-height: 1.45; color: #1e293b; width: 794px; min-height: 1050px; margin: 0 auto;">
      <!-- Header Kop -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="display: flex; align-items: center;">
          <img src="${logoMateha}" alt="Mateha" style="width: 140px; display: block; margin-right: 12px;" />
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13px; font-weight: 900; letter-spacing: 0.5px; color: #0f172a; text-transform: uppercase;">
            ${data.isPublished ? 'SLIP GAJI RESMI' : 'ESTIMASI SLIP GAJI (DRAFT)'}
          </div>
          <div style="font-size: 11px; color: #475569; font-family: monospace; font-weight: 700;">
            PERIODE ${data.monthName.toUpperCase()} ${data.year}
          </div>
        </div>
      </div>

      <!-- Staff Profile Meta -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 50%; vertical-align: top;">
              <span style="font-size: 9.5px; text-transform: uppercase; color: #64748b; font-family: monospace; display: block; font-weight: 700;">Nama Personil / Anggota</span>
              <span style="font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase;">${data.staffDisplayName || data.staffUsername}</span>
              <span style="font-size: 10px; color: #64748b; display: block;">@${data.staffUsername}</span>
            </td>
            <td style="width: 50%; text-align: right; vertical-align: top;">
              <span style="font-size: 9.5px; text-transform: uppercase; color: #64748b; font-family: monospace; display: block; font-weight: 700;">Jabatan / Peran Aktif</span>
              <span style="font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase;">${data.staffJob || data.staffRole || 'Staff Lapangan'}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Tables: Earnings & Deductions -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
        <tr>
          <!-- Column A: Pendapatan -->
          <td style="width: 50%; vertical-align: top; padding-right: 8px;">
            <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; font-weight: 800; font-size: 10.5px; text-transform: uppercase; color: #1e293b; margin-bottom: 4px;">
              A. Pendapatan (Honor Fee & RMBS)
            </div>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; font-size: 11px;">
              <tbody>
                ${earningsRows}
                <tr style="background-color: #f8fafc; border-top: 1.5px solid #cbd5e1; font-weight: 800;">
                  <td style="padding: 7px 10px; text-transform: uppercase; font-size: 10.5px;">Total Pendapatan</td>
                  <td style="padding: 7px 10px; text-align: right; font-family: monospace; color: #0891b2; font-size: 11.5px;">${formatRupiah(data.totalEarnings)}</td>
                </tr>
              </tbody>
            </table>
          </td>

          <!-- Column B: Potongan -->
          <td style="width: 50%; vertical-align: top; padding-left: 8px;">
            <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; font-weight: 800; font-size: 10.5px; text-transform: uppercase; color: #1e293b; margin-bottom: 4px;">
              B. Potongan (Kasbon & Koreksi)
            </div>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; font-size: 11px;">
              <tbody>
                ${deductionsRows}
                <tr style="background-color: #f8fafc; border-top: 1.5px solid #cbd5e1; font-weight: 800;">
                  <td style="padding: 7px 10px; text-transform: uppercase; font-size: 10.5px;">Total Potongan</td>
                  <td style="padding: 7px 10px; text-align: right; font-family: monospace; color: #be123c; font-size: 11.5px;">-${formatRupiah(data.totalDeductions)}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </table>

      <!-- Take Home Pay Box -->
      <div style="background-color: #ecfeff; border: 2px solid #0891b2; border-radius: 8px; padding: 12px 18px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">TAKE HOME PAY (GAJI BERSIH)</span>
        <span style="font-size: 18px; font-family: monospace; font-weight: 900; color: #0e7490;">${formatRupiah(data.takeHomePay)}</span>
      </div>

      <!-- Event Summary Table -->
      <div style="margin-bottom: 24px;">
        <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 6px;">
          Rincian Penugasan & Keterlibatan Event
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background-color: #f8fafc; font-size: 10px; text-transform: uppercase; color: #475569; font-weight: 700; border-bottom: 1px solid #cbd5e1;">
              <th style="padding: 6px 10px; text-align: left; width: 45%;">Nama Event</th>
              <th style="padding: 6px 10px; text-align: left; width: 40%;">Waktu & Lokasi</th>
              <th style="padding: 6px 10px; text-align: center; width: 15%;">Durasi</th>
            </tr>
          </thead>
          <tbody>
            ${eventRows}
          </tbody>
        </table>
      </div>

      <!-- Signatures Footer -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        <tr>
          <td style="width: 50%; text-align: center; vertical-align: top;">
            <p style="font-size: 10px; color: #64748b; margin: 0 0 4px 0; font-weight: 700; text-transform: uppercase;">YANG MEMBAYARKAN,</p>
            ${data.isPublished ? `<img src="${logoTtd}" alt="TTD" style="width: 120px; margin: 4px auto; display: block;" />` : `<div style="height: 50px; display: flex; align-items: center; justify-content: center; font-size: 9.5px; color: #b45309; font-style: italic;">[Menunggu Pengesahan Admin]</div>`}
            <p style="font-weight: 900; text-transform: uppercase; font-size: 11px; color: #0f172a; margin: 4px 0 0 0;">DHIFA AKSA HERMAWAN</p>
            <p style="font-size: 9px; color: #64748b; margin: 0;">MATEHA PRODUCTION</p>
          </td>
          <td style="width: 50%; text-align: center; vertical-align: top;">
            <p style="font-size: 10px; color: #64748b; margin: 0 0 4px 0; font-weight: 700; text-transform: uppercase;">PENERIMA,</p>
            <div style="height: 54px;"></div>
            <p style="font-weight: 900; text-transform: uppercase; font-size: 11px; color: #0f172a; margin: 4px 0 0 0;">${data.staffDisplayName || data.staffUsername}</p>
            <p style="font-size: 9px; color: #64748b; margin: 0;">STAFF BERSANGKUTAN</p>
          </td>
        </tr>
      </table>
    </div>
  `;
};

export const generateStaffPayslipPdfBlob = async (data: StaffPayslipPdfData): Promise<Blob> => {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '999999';
  container.style.pointerEvents = 'none';
  container.style.boxSizing = 'border-box';
  container.style.color = '#0f172a';
  container.style.fontFamily = "Arial, Helvetica, sans-serif";

  container.innerHTML = await buildStaffPayslipHtml(data);
  return renderContainerToPdfBlob(container);
};

export const printStaffPayslipDirectly = async (data: StaffPayslipPdfData): Promise<boolean> => {
  const payslipHtml = await buildStaffPayslipHtml(data);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>SLIP GAJI - ${data.staffDisplayName || data.staffUsername} - ${data.monthName} ${data.year}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
            color: #1e293b;
            background: #ffffff;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @media print {
            body { padding: 0; background: #fff; }
          }
        </style>
      </head>
      <body>
        ${payslipHtml}
        <script>
          window.onload = function() {
            window.focus();
            window.print();
            setTimeout(function() { window.close(); }, 800);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
  return true;
};

