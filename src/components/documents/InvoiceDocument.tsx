import React from "react";
import { Invoice, formatRupiah } from "../../types";
import { formatDateString } from "../../utils/date";
import { terbilang } from "../../utils/numberToWords";
import { COLORS } from "./docTheme";
import {
  BankList,
  ContinuationHeader,
  DocumentFooter,
  ItemRow,
  ItemsTableHeader,
  Letterhead,
  NoticeBox,
  NumberedList,
  PartyGrid,
  SectionTitle,
  SignatureSection,
  TitleBlock,
  TotalLine,
  TotalsWithTerbilang,
  TwoColumnInfo,
} from "./DocumentPrimitives";
import PaginatedDocument, { FlowUnit } from "./PaginatedDocument";

export const INVOICE_DEFAULT_TERMS = ["Bukti transfer mohon dikirimkan ke admin untuk verifikasi pembayaran."];

export function getInvoiceTotals(invoice: Invoice) {
  const contractTotal = invoice.totalAmount || invoice.items.reduce((s, itm) => s + itm.total, 0);
  const remaining = invoice.remainingAmount ?? Math.max(0, contractTotal - invoice.grandTotal);
  return { contractTotal, remaining };
}

export default function InvoiceDocument({
  invoice,
  onPageCount,
  onReady,
}: {
  invoice: Invoice;
  onPageCount?: (count: number) => void;
  onReady?: () => void;
}) {
  const formattedDate = formatDateString(invoice.date);
  const dpLabel = invoice.dpPercent ? `DP ${invoice.dpPercent}%` : "DP";
  const { contractTotal, remaining } = getInvoiceTotals(invoice);

  const meta = [
    { label: "No. Invoice", value: invoice.invoiceNumber, emphasis: "accent" as const },
    { label: "Tanggal", value: formattedDate },
    ...(invoice.dueDate ? [{ label: "Jatuh Tempo", value: formatDateString(invoice.dueDate), emphasis: "warn" as const }] : []),
  ];

  const firstHeader = (
    <>
      <Letterhead />
      <TitleBlock
        title="INVOICE"
        subtitle={invoice.isDp ? "Tagihan Uang Muka (Down Payment)" : "Tagihan Pembayaran"}
        badge={invoice.isDp ? dpLabel : undefined}
        meta={meta}
      />
      <PartyGrid
        columns={[
          {
            label: "Ditagihkan Kepada",
            content: (
              <>
                <div style={{ fontWeight: 800, fontSize: 12.5, color: COLORS.ink }}>{invoice.customerName}</div>
                {invoice.customerContact && <div>PIC: {invoice.customerContact}</div>}
                {invoice.customerPhone && <div>Telp: {invoice.customerPhone}</div>}
              </>
            ),
          },
          {
            label: "Perihal",
            content: (
              <div style={{ fontWeight: 700, color: COLORS.ink }}>{invoice.subject || "Tagihan Layanan Event"}</div>
            ),
          },
        ]}
      />
    </>
  );

  const totalLines: TotalLine[] = invoice.isDp
    ? [
        { label: "Total Nilai Kontrak", value: formatRupiah(contractTotal) },
        { label: `Uang Muka (${dpLabel})`, value: formatRupiah(invoice.grandTotal), variant: "highlight" },
        { label: "Total Tagihan", value: formatRupiah(invoice.grandTotal), variant: "grand" },
        { label: "Sisa tagihan (pelunasan)", value: formatRupiah(remaining), variant: "muted" },
      ]
    : [
        { label: "Subtotal", value: formatRupiah(invoice.grandTotal) },
        { label: "Total Tagihan", value: formatRupiah(invoice.grandTotal), variant: "grand" },
      ];

  const terms = [...INVOICE_DEFAULT_TERMS, ...(invoice.termsAndConditions ? [invoice.termsAndConditions] : [])];

  const units: FlowUnit[] = [
    ...invoice.items.map((item, i) => ({
      key: `row-${i}`,
      kind: "row" as const,
      node: (
        <ItemRow
          index={i}
          description={item.description}
          qty={item.qty}
          price={formatRupiah(item.price)}
          total={formatRupiah(item.total)}
        />
      ),
    })),
    {
      key: "totals",
      kind: "block",
      keepWithPrevious: true,
      node: <TotalsWithTerbilang terbilang={`${terbilang(invoice.grandTotal)} Rupiah`} lines={totalLines} />,
    },
    ...(invoice.isDp
      ? [
          {
            key: "dp-note",
            kind: "block" as const,
            node: (
              <NoticeBox>
                Faktur ini merupakan penagihan <strong>uang muka ({dpLabel})</strong> sebesar{" "}
                <strong>{formatRupiah(invoice.grandTotal)}</strong>. Sisa tagihan sebesar{" "}
                <strong>{formatRupiah(remaining)}</strong> akan ditagihkan pada invoice pelunasan berikutnya.
              </NoticeBox>
            ),
          },
        ]
      : []),
    {
      key: "payment",
      kind: "block",
      node: (
        <TwoColumnInfo
          left={
            <>
              <SectionTitle>Rekening Pembayaran</SectionTitle>
              <BankList banks={invoice.selectedBanks || []} emptyText="Informasi rekening pembayaran dapat dikonfirmasi ke admin." />
            </>
          }
          right={
            <>
              <SectionTitle>Syarat & Ketentuan Pembayaran</SectionTitle>
              <NumberedList items={terms} />
            </>
          }
        />
      ),
    },
    {
      key: "signature",
      kind: "block",
      keepWithPrevious: true,
      node: (
        <SignatureSection
          date={formattedDate}
          clientApproval={
            invoice.showClientApproval
              ? {
                  name: invoice.clientApprovalName || invoice.customerContact || "( ................................ )",
                  title: invoice.clientApprovalTitle || invoice.customerName || "Klien / Pemesan",
                }
              : null
          }
          leftNote="Terima kasih atas kepercayaan Anda. Mohon cantumkan nomor invoice pada keterangan transfer."
        />
      ),
    },
  ];

  return (
    <PaginatedDocument
      firstHeader={firstHeader}
      continuationHeader={<ContinuationHeader title="INVOICE" reference={invoice.invoiceNumber} party={invoice.customerName} />}
      tableHeader={<ItemsTableHeader />}
      units={units}
      renderFooter={(page, total) => <DocumentFooter pageNumber={page} totalPages={total} reference={invoice.invoiceNumber} />}
      layoutKey={JSON.stringify(invoice)}
      onPageCount={onPageCount}
      onReady={onReady}
    />
  );
}
