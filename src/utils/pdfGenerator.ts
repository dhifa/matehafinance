import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Invoice, Quotation, Kwitansi, formatRupiah } from '../types';
import { terbilang } from './numberToWords';
import { INDONESIAN_MONTHS, formatDateString } from './date';

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

// Invoice, Quotation and Kwitansi PDFs are rendered from the same React components
// as the live preview; see ./documentPdf.tsx.
export {
  generateInvoicePdfBlob,
  generateQuotationPdfBlob,
  generateKwitansiItemPdfBlob,
  generateKwitansiPdfBlob,
} from './documentPdf';

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

