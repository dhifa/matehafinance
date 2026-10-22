import React, { useEffect } from "react";
import { Invoice, Kwitansi, formatRupiah } from "../../types";
import { formatDateString } from "../../utils/date";
import { terbilang } from "../../utils/numberToWords";
import { COLORS, COMPANY } from "./docTheme";
import { DocumentFooter, DocumentPage, Letterhead, SignatureSection, TitleBlock, capsLabel } from "./DocumentPrimitives";
import { loadDocumentFonts } from "./PaginatedDocument";

export function kwitansiFromInvoice(invoice: Invoice): Kwitansi {
  return {
    id: invoice.id,
    kwitansiNumber: invoice.invoiceNumber.replace("INV", "KWT"),
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    amount: invoice.grandTotal,
    paymentFor: invoice.subject || `Pembayaran Invoice ${invoice.invoiceNumber}`,
    date: invoice.date,
    paymentMethod: "Transfer Bank",
    receiverName: COMPANY.signerName,
    receiverTitle: COMPANY.signerTitle,
    createdAt: invoice.createdAt,
  };
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", padding: "11px 0", borderBottom: `1px solid ${COLORS.line}` }}>
      <div style={{ ...capsLabel, width: 170, flexShrink: 0, paddingTop: 2 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 12, color: COLORS.ink }}>{children}</div>
    </div>
  );
}

export default function KwitansiDocument({ kwitansi, onReady }: { kwitansi: Kwitansi; onReady?: () => void }) {
  const formattedDate = formatDateString(kwitansi.date);

  useEffect(() => {
    let alive = true;
    loadDocumentFonts().then(() => alive && onReady?.());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DocumentPage footer={<DocumentFooter pageNumber={1} totalPages={1} reference={kwitansi.kwitansiNumber} />}>
      <Letterhead />
      <TitleBlock
        title="KWITANSI"
        subtitle="Bukti Penerimaan Pembayaran"
        meta={[
          { label: "No. Kwitansi", value: kwitansi.kwitansiNumber, emphasis: "accent" },
          { label: "Tanggal", value: formattedDate },
          ...(kwitansi.invoiceNumber ? [{ label: "Ref. Invoice", value: kwitansi.invoiceNumber }] : []),
        ]}
      />

      <div style={{ borderTop: `2px solid ${COLORS.ink}` }}>
        <DetailRow label="Telah terima dari">
          <span style={{ fontWeight: 800, fontSize: 14 }}>{kwitansi.customerName}</span>
        </DetailRow>
        <DetailRow label="Uang sejumlah">
          <span style={{ fontStyle: "italic", fontWeight: 600 }}># {terbilang(kwitansi.amount)} Rupiah #</span>
        </DetailRow>
        <DetailRow label="Untuk pembayaran">
          <span style={{ whiteSpace: "pre-line", lineHeight: 1.55 }}>{kwitansi.paymentFor}</span>
        </DetailRow>
        <DetailRow label="Metode pembayaran">{kwitansi.paymentMethod || "Transfer Bank"}</DetailRow>
        {kwitansi.notes && (
          <DetailRow label="Catatan">
            <span style={{ whiteSpace: "pre-line", color: COLORS.text, fontSize: 11 }}>{kwitansi.notes}</span>
          </DetailRow>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 16, paddingTop: 24 }}>
        <div
          style={{
            flex: 1,
            background: COLORS.soft,
            border: `1px solid ${COLORS.line}`,
            borderLeft: `4px solid ${COLORS.accent}`,
            borderRadius: 8,
            padding: "14px 18px",
          }}
        >
          <div style={capsLabel}>Jumlah Diterima</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.ink, letterSpacing: "0.01em", lineHeight: 1.25 }}>
            {formatRupiah(kwitansi.amount)}
          </div>
        </div>
        <div
          style={{
            width: 170,
            border: `2px solid ${COLORS.success}`,
            borderRadius: 8,
            color: COLORS.success,
            background: COLORS.successSoft,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.18em" }}>LUNAS</div>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em" }}>{formattedDate}</div>
        </div>
      </div>

      <SignatureSection
        date={formattedDate}
        companyRole="Yang menerima,"
        companySignerName={kwitansi.receiverName || COMPANY.signerName}
        companySignerTitle={kwitansi.receiverTitle || COMPANY.signerTitle}
        leftNote="Kwitansi ini merupakan bukti pembayaran yang sah dan diterbitkan oleh Mateha Production."
      />
    </DocumentPage>
  );
}
