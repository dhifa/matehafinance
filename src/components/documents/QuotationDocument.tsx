import React from "react";
import { Quotation, formatRupiah } from "../../types";
import { formatDateString } from "../../utils/date";
import { terbilang } from "../../utils/numberToWords";
import { COLORS, COMPANY } from "./docTheme";
import {
  BankList,
  ContinuationHeader,
  DocumentFooter,
  ItemRow,
  ItemsTableHeader,
  Letterhead,
  NumberedList,
  PartyGrid,
  SectionTitle,
  SignatureSection,
  TitleBlock,
  TotalsWithTerbilang,
  TwoColumnInfo,
} from "./DocumentPrimitives";
import PaginatedDocument, { FlowUnit } from "./PaginatedDocument";

export const QUOTATION_DEFAULT_TERMS = [
  "Harga sudah termasuk biaya instalasi dan operator teknisi selama acara.",
  "Konfirmasi pemesanan dilakukan dengan DP minimal 50%, pelunasan saat acara.",
];

export default function QuotationDocument({
  quotation,
  onPageCount,
  onReady,
}: {
  quotation: Quotation;
  onPageCount?: (count: number) => void;
  onReady?: () => void;
}) {
  const formattedDate = formatDateString(quotation.date);
  const formattedValidUntil = quotation.validUntil ? formatDateString(quotation.validUntil) : "14 hari sejak diterbitkan";

  const firstHeader = (
    <>
      <Letterhead />
      <TitleBlock
        title="PENAWARAN HARGA"
        subtitle="Quotation"
        meta={[
          { label: "No. Penawaran", value: quotation.quotationNumber, emphasis: "accent" },
          { label: "Tanggal", value: formattedDate },
          { label: "Berlaku Hingga", value: formattedValidUntil },
        ]}
      />
      <PartyGrid
        columns={[
          {
            label: "Kepada Yth.",
            content: (
              <>
                <div style={{ fontWeight: 800, fontSize: 12.5, color: COLORS.ink }}>{quotation.customerName}</div>
                {quotation.customerContact && <div>Up. {quotation.customerContact}</div>}
                {quotation.customerPhone && <div>Telp/WA: {quotation.customerPhone}</div>}
                <div style={{ color: COLORS.muted, fontStyle: "italic" }}>di Tempat</div>
              </>
            ),
          },
          {
            label: "Perihal",
            content: (
              <>
                <div style={{ fontWeight: 700, color: COLORS.ink }}>{quotation.subject || "Penawaran Kerja Sama Acara"}</div>
                <div style={{ color: COLORS.muted }}>Lampiran: 1 berkas penawaran</div>
              </>
            ),
          },
        ]}
      />
      <div style={{ fontSize: 10.5, lineHeight: 1.6, paddingBottom: 14, textAlign: "justify" }}>
        Dengan hormat,
        <br />
        Sehubungan dengan rencana kegiatan yang akan diselenggarakan, bersama surat ini kami dari{" "}
        <strong style={{ color: COLORS.ink }}>Mateha Production</strong> mengajukan penawaran harga pengadaan layanan dan
        peralatan teknis dengan rincian sebagai berikut:
      </div>
    </>
  );

  const units: FlowUnit[] = [
    ...quotation.items.map((item, i) => ({
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
      node: (
        <TotalsWithTerbilang
          terbilang={`${terbilang(quotation.grandTotal)} Rupiah`}
          lines={[
            { label: "Subtotal", value: formatRupiah(quotation.grandTotal) },
            { label: "Total Penawaran", value: formatRupiah(quotation.grandTotal), variant: "grand" },
          ]}
        />
      ),
    },
    {
      key: "terms",
      kind: "block",
      node: (
        <TwoColumnInfo
          left={
            <>
              <SectionTitle>Syarat & Ketentuan</SectionTitle>
              <NumberedList
                items={[...QUOTATION_DEFAULT_TERMS, ...(quotation.termsAndConditions ? [`Catatan: ${quotation.termsAndConditions}`] : [])]}
              />
            </>
          }
          right={
            <>
              <SectionTitle>Rekening Pembayaran</SectionTitle>
              <BankList banks={quotation.selectedBanks || []} emptyText="Nomor rekening akan dikonfirmasikan pada invoice resmi." />
            </>
          }
        />
      ),
    },
    {
      key: "closing",
      kind: "block",
      node: (
        <div style={{ fontSize: 10.5, lineHeight: 1.6, paddingTop: 18, textAlign: "justify" }}>
          Demikian surat penawaran harga ini kami sampaikan. Besar harapan kami untuk dapat bekerja sama dalam menyukseskan
          acara Anda. Atas perhatian dan kepercayaannya, kami ucapkan terima kasih.
        </div>
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
            quotation.showClientApproval
              ? {
                  name: quotation.clientApprovalName || quotation.customerContact || "( ................................ )",
                  title: quotation.clientApprovalTitle || quotation.customerName || "Klien / Pemesan",
                }
              : null
          }
          leftNote={`Penawaran berlaku hingga ${formattedValidUntil}. Hubungi kami di WA ${COMPANY.phone} untuk konfirmasi.`}
        />
      ),
    },
  ];

  return (
    <PaginatedDocument
      firstHeader={firstHeader}
      continuationHeader={
        <ContinuationHeader title="PENAWARAN HARGA" reference={quotation.quotationNumber} party={quotation.customerName} />
      }
      tableHeader={<ItemsTableHeader />}
      units={units}
      renderFooter={(page, total) => <DocumentFooter pageNumber={page} totalPages={total} reference={quotation.quotationNumber} />}
      layoutKey={JSON.stringify(quotation)}
      onPageCount={onPageCount}
      onReady={onReady}
    />
  );
}
