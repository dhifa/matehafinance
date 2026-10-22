import React from "react";
import { createRoot } from "react-dom/client";
import { getFontEmbedCSS, toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";
import { Invoice, Kwitansi, Quotation } from "../types";
import InvoiceDocument from "../components/documents/InvoiceDocument";
import QuotationDocument from "../components/documents/QuotationDocument";
import KwitansiDocument, { kwitansiFromInvoice } from "../components/documents/KwitansiDocument";
import { PAGE_WIDTH } from "../components/documents/docTheme";

type ReadyRender = (onReady: () => void) => React.ReactElement;

const waitForImages = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
    )
  );
};

/**
 * Renders a document component off-screen (the exact same component used by the
 * live preview), then rasterizes every .doc-page into its own A4 page.
 */
async function renderDocumentToPdf(render: ReadyRender, title: string): Promise<Blob> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    left: "-20000px",
    width: `${PAGE_WIDTH}px`,
    pointerEvents: "none",
    background: "#ffffff",
  });
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Dokumen tidak selesai dirender.")), 15000);
      root.render(
        render(() => {
          window.clearTimeout(timer);
          resolve();
        })
      );
    });
    // Let React commit the final paginated layout
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await waitForImages(host);

    const pages = Array.from(host.querySelectorAll<HTMLElement>(".doc-page"));
    if (pages.length === 0) throw new Error("Tidak ada halaman dokumen untuk diekspor.");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.setProperties({ title, author: "Mateha Production", creator: "Mateha Production" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // html-to-image lets the browser itself paint each page (SVG foreignObject),
    // so the PDF matches the on-screen preview pixel for pixel.
    const fontEmbedCSS = await getFontEmbedCSS(pages[0]);
    for (let i = 0; i < pages.length; i++) {
      const canvas = await toCanvas(pages[i], {
        pixelRatio: 2.5,
        backgroundColor: "#ffffff",
        fontEmbedCSS,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
    }
    return pdf.output("blob");
  } finally {
    root.unmount();
    host.remove();
  }
}

export const generateInvoicePdfBlob = (invoice: Invoice): Promise<Blob> =>
  renderDocumentToPdf((onReady) => <InvoiceDocument invoice={invoice} onReady={onReady} />, `Invoice ${invoice.invoiceNumber}`);

export const generateQuotationPdfBlob = (quotation: Quotation): Promise<Blob> =>
  renderDocumentToPdf(
    (onReady) => <QuotationDocument quotation={quotation} onReady={onReady} />,
    `Penawaran ${quotation.quotationNumber}`
  );

export const generateKwitansiItemPdfBlob = (kwitansi: Kwitansi): Promise<Blob> =>
  renderDocumentToPdf((onReady) => <KwitansiDocument kwitansi={kwitansi} onReady={onReady} />, `Kwitansi ${kwitansi.kwitansiNumber}`);

export const generateKwitansiPdfBlob = (invoice: Invoice): Promise<Blob> => generateKwitansiItemPdfBlob(kwitansiFromInvoice(invoice));

export const pdfFileName = (prefix: string, number: string, party?: string) =>
  [prefix, number.replace(/\//g, "_"), party ? party.replace(/[^a-zA-Z0-9]+/g, "_") : ""].filter(Boolean).join("_") + ".pdf";

/**
 * Prints a generated PDF through a hidden iframe so the printout is identical to
 * the downloaded file. Falls back to opening the PDF in a new tab.
 */
export function printPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, "_blank");
    }
    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  };
  document.body.appendChild(iframe);
}
