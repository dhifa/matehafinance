import React from "react";
import "@fontsource-variable/inter/wght.css";
import {
  COLORS,
  COMPANY,
  FONT_FAMILY,
  FOOTER_HEIGHT,
  PAGE_HEIGHT,
  PAGE_PADDING_BOTTOM,
  PAGE_PADDING_TOP,
  PAGE_PADDING_X,
  PAGE_WIDTH,
} from "./docTheme";

type Style = React.CSSProperties;

export const baseTextStyle: Style = {
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  lineHeight: 1.5,
  color: COLORS.text,
  textAlign: "left",
  letterSpacing: 0,
};

export const capsLabel: Style = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLORS.muted,
};

// ---------------------------------------------------------------------------
// Page frame
// ---------------------------------------------------------------------------

export function DocumentPage({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      className="doc-page"
      style={{
        ...baseTextStyle,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        position: "relative",
        overflow: "hidden",
        background: COLORS.white,
        boxSizing: "border-box",
      }}
    >
      {/* Brand accent strip */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: COLORS.accent }} />
      <div style={{ position: "absolute", top: 6, left: 0, width: 180, height: 2, background: COLORS.ink }} />

      <div
        style={{
          position: "absolute",
          top: PAGE_PADDING_TOP,
          left: PAGE_PADDING_X,
          right: PAGE_PADDING_X,
        }}
      >
        {children}
      </div>

      <div
        style={{
          position: "absolute",
          left: PAGE_PADDING_X,
          right: PAGE_PADDING_X,
          bottom: PAGE_PADDING_BOTTOM,
          height: FOOTER_HEIGHT,
        }}
      >
        {footer}
      </div>
    </div>
  );
}

export function DocumentFooter({
  pageNumber,
  totalPages,
  reference,
}: {
  pageNumber: number;
  totalPages: number;
  reference: string;
}) {
  const continues = pageNumber < totalPages;
  return (
    <div
      style={{
        borderTop: `1px solid ${COLORS.line}`,
        paddingTop: 10,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        fontSize: 8.5,
        color: COLORS.subtle,
        lineHeight: 1.5,
      }}
    >
      <div>
        <div style={{ fontWeight: 700, color: COLORS.muted }}>{COMPANY.name}</div>
        <div>
          WA {COMPANY.phone} · {COMPANY.email}
        </div>
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap", paddingLeft: 16 }}>
        <div style={{ fontWeight: 700, color: COLORS.muted }}>{reference}</div>
        <div>
          Halaman {pageNumber} dari {totalPages}
          {continues ? " · bersambung" : ""}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

export function Letterhead() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: 14,
        borderBottom: `1px solid ${COLORS.line}`,
      }}
    >
      <div>
        <img src={COMPANY.logo} alt="Mateha Production" style={{ height: 50, width: 150, display: "block" }} />
        <div style={{ ...capsLabel, fontSize: 8, marginTop: 4, color: COLORS.subtle }}>{COMPANY.tagline}</div>
      </div>
      <div style={{ textAlign: "right", fontSize: 9.5, lineHeight: 1.55, color: COLORS.muted }}>
        <div style={{ fontWeight: 800, color: COLORS.ink, fontSize: 11, letterSpacing: "0.04em" }}>{COMPANY.name}</div>
        <div>{COMPANY.addressLine1}</div>
        <div>{COMPANY.addressLine2}</div>
        <div style={{ color: COLORS.accent, fontWeight: 600 }}>
          WA {COMPANY.phone} · {COMPANY.email}
        </div>
      </div>
    </div>
  );
}

export interface MetaRow {
  label: string;
  value: React.ReactNode;
  emphasis?: "accent" | "warn";
}

export function TitleBlock({
  title,
  subtitle,
  badge,
  meta,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  meta: MetaRow[];
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingTop: 18,
        paddingBottom: 16,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.ink, letterSpacing: "0.02em", lineHeight: 1.1 }}>
            {title}
          </div>
          {badge && (
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: COLORS.warn,
                background: COLORS.warnSoft,
                border: `1px solid ${COLORS.warnLine}`,
                borderRadius: 999,
                padding: "3px 9px",
                lineHeight: 1.2,
              }}
            >
              {badge}
            </div>
          )}
        </div>
        {subtitle && <div style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 5 }}>{subtitle}</div>}
      </div>

      <table style={{ borderCollapse: "collapse", fontSize: 10 }}>
        <tbody>
          {meta.map((row) => (
            <tr key={row.label}>
              <td style={{ color: COLORS.muted, padding: "1.5px 14px 1.5px 0", textAlign: "right", whiteSpace: "nowrap" }}>
                {row.label}
              </td>
              <td
                style={{
                  fontWeight: 700,
                  padding: "1.5px 0",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  color:
                    row.emphasis === "accent" ? COLORS.accent : row.emphasis === "warn" ? "#be123c" : COLORS.ink,
                }}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PartyGrid({ columns }: { columns: { label: string; content: React.ReactNode }[] }) {
  return (
    <div style={{ display: "flex", gap: 14, paddingBottom: 18 }}>
      {columns.map((col) => (
        <div
          key={col.label}
          style={{
            flex: 1,
            background: COLORS.soft,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 8,
            padding: "11px 14px",
          }}
        >
          <div style={{ ...capsLabel, color: COLORS.accent, marginBottom: 5 }}>{col.label}</div>
          <div style={{ fontSize: 10.5, lineHeight: 1.55 }}>{col.content}</div>
        </div>
      ))}
    </div>
  );
}

export function ContinuationHeader({ title, reference, party }: { title: string; reference: string; party: string }) {
  return (
    <div style={{ paddingBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 12,
          borderBottom: `1px solid ${COLORS.line}`,
        }}
      >
        <img src={COMPANY.logo} alt="Mateha Production" style={{ height: 36, width: 108, display: "block" }} />
        <div style={{ textAlign: "right", fontSize: 9.5, color: COLORS.muted, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 800, color: COLORS.ink, fontSize: 11 }}>{title} (lanjutan)</div>
          <div>
            No. <strong style={{ color: COLORS.accent }}>{reference}</strong> · {party}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Items table (div grid so each row can be measured and paginated on its own)
// ---------------------------------------------------------------------------

const ITEM_COLUMNS = "34px 1fr 50px 118px 128px";
const ITEM_COLUMNS_WITH_DAYS = "34px 1fr 44px 44px 112px 124px";

/** The "Hari" column is shown only when at least one item spans more than one day. */
export function itemsHaveDays(items: { days?: number }[]): boolean {
  return items.some((item) => (Number(item.days) || 1) > 1);
}

const cellBase: Style = { padding: "9px 10px", boxSizing: "border-box" };

export function ItemsTableHeader({ showDays = false }: { showDays?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: showDays ? ITEM_COLUMNS_WITH_DAYS : ITEM_COLUMNS,
        background: COLORS.ink,
        color: COLORS.white,
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        borderRadius: "6px 6px 0 0",
      }}
    >
      <div style={{ ...cellBase, textAlign: "center" }}>No</div>
      <div style={cellBase}>Deskripsi Layanan / Item</div>
      <div style={{ ...cellBase, textAlign: "center" }}>Qty</div>
      {showDays && <div style={{ ...cellBase, textAlign: "center" }}>Hari</div>}
      <div style={{ ...cellBase, textAlign: "right" }}>Harga Satuan</div>
      <div style={{ ...cellBase, textAlign: "right" }}>Jumlah</div>
    </div>
  );
}

export function ItemDescription({ text }: { text: string }) {
  const lines = (text || "").split("\n").filter((l) => l.trim().length > 0);
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("-") || trimmed.startsWith("•")) {
          return (
            <div key={i} style={{ display: "flex", gap: 6, paddingLeft: 2, color: COLORS.muted, fontSize: 10 }}>
              <span style={{ color: COLORS.accent, fontWeight: 700 }}>•</span>
              <span>{trimmed.substring(1).trim()}</span>
            </div>
          );
        }
        return (
          <div key={i} style={{ fontWeight: 600, color: COLORS.ink }}>
            {line}
          </div>
        );
      })}
    </>
  );
}

export function ItemRow({
  index,
  description,
  qty,
  days,
  price,
  total,
}: {
  index: number;
  description: string;
  qty: number;
  /** Pass only when the table shows the "Hari" column. */
  days?: number;
  price: string;
  total: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: days !== undefined ? ITEM_COLUMNS_WITH_DAYS : ITEM_COLUMNS,
        fontSize: 10.5,
        background: index % 2 === 1 ? COLORS.soft : COLORS.white,
        borderBottom: `1px solid ${COLORS.line}`,
        borderLeft: `1px solid ${COLORS.line}`,
        borderRight: `1px solid ${COLORS.line}`,
        wordBreak: "break-word",
      }}
    >
      <div style={{ ...cellBase, textAlign: "center", color: COLORS.muted }}>{index + 1}</div>
      <div style={cellBase}>
        <ItemDescription text={description} />
      </div>
      <div style={{ ...cellBase, textAlign: "center", fontWeight: 600 }}>{qty}</div>
      {days !== undefined && <div style={{ ...cellBase, textAlign: "center", fontWeight: 600 }}>{days}</div>}
      <div style={{ ...cellBase, textAlign: "right", whiteSpace: "nowrap" }}>{price}</div>
      <div style={{ ...cellBase, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: COLORS.ink }}>
        {total}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary blocks
// ---------------------------------------------------------------------------

export interface TotalLine {
  label: string;
  value: string;
  variant?: "normal" | "highlight" | "grand" | "muted";
}

export function TotalsWithTerbilang({ terbilang, lines }: { terbilang: string; lines: TotalLine[] }) {
  return (
    <div style={{ display: "flex", gap: 18, paddingTop: 14, alignItems: "flex-start" }}>
      <div
        style={{
          flex: 1,
          borderLeft: `3px solid ${COLORS.accent}`,
          background: COLORS.soft,
          padding: "9px 12px",
          borderRadius: "0 6px 6px 0",
        }}
      >
        <div style={{ ...capsLabel, marginBottom: 3 }}>Terbilang</div>
        <div style={{ fontStyle: "italic", fontWeight: 600, color: COLORS.ink, fontSize: 10.5 }}>{terbilang}</div>
      </div>

      <div style={{ width: 286, flexShrink: 0 }}>
        {lines.map((line) => {
          const isGrand = line.variant === "grand";
          const isHighlight = line.variant === "highlight";
          const isMuted = line.variant === "muted";
          return (
            <div
              key={line.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: isGrand ? "9px 12px" : "6px 12px",
                background: isGrand ? COLORS.ink : isHighlight ? COLORS.warnSoft : "transparent",
                color: isGrand ? COLORS.white : isHighlight ? COLORS.warn : isMuted ? COLORS.muted : COLORS.text,
                borderBottom: isGrand ? "none" : `1px solid ${COLORS.line}`,
                borderRadius: isGrand ? 6 : 0,
                marginTop: isGrand ? 4 : 0,
                fontSize: isGrand ? 12 : isMuted ? 9.5 : 10.5,
                fontWeight: isGrand ? 800 : isHighlight ? 700 : 500,
              }}
            >
              <span style={{ textTransform: isGrand ? "uppercase" : "none", letterSpacing: isGrand ? "0.04em" : 0 }}>
                {line.label}
              </span>
              <span style={{ whiteSpace: "nowrap", fontWeight: isGrand ? 800 : 700 }}>{line.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SectionTitle({ children, color = COLORS.accent }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        ...capsLabel,
        color,
        paddingBottom: 5,
        marginBottom: 7,
        borderBottom: `1px solid ${COLORS.line}`,
      }}
    >
      {children}
    </div>
  );
}

export function BankList({ banks, emptyText }: { banks: { id: string; name: string; accountNumber: string; accountHolder: string }[]; emptyText: string }) {
  if (!banks || banks.length === 0) {
    return <div style={{ fontSize: 10, color: COLORS.muted, fontStyle: "italic" }}>{emptyText}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {banks.map((bank) => (
        <div key={bank.id} style={{ fontSize: 10, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, color: COLORS.accent }}>{bank.name}</div>
          <div style={{ fontWeight: 800, color: COLORS.ink, fontSize: 12, letterSpacing: "0.04em" }}>{bank.accountNumber}</div>
          <div style={{ color: COLORS.muted, fontSize: 9.5 }}>a.n. {bank.accountHolder}</div>
        </div>
      ))}
    </div>
  );
}

export function TwoColumnInfo({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 24, paddingTop: 18 }}>
      <div style={{ flex: 1 }}>{left}</div>
      <div style={{ flex: 1 }}>{right}</div>
    </div>
  );
}

export function NumberedList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, lineHeight: 1.5 }}>
      {items.map((text, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <span style={{ color: COLORS.muted, minWidth: 12 }}>{i + 1}.</span>
          <span style={{ whiteSpace: "pre-line" }}>{text}</span>
        </div>
      ))}
    </div>
  );
}

export function NoticeBox({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "accent" }) {
  const palette =
    tone === "warn"
      ? { bg: COLORS.warnSoft, border: COLORS.warnLine, color: "#92400e" }
      : { bg: COLORS.accentSoft, border: COLORS.accentLine, color: COLORS.accent };
  return (
    <div style={{ paddingTop: 14 }}>
      <div
        style={{
          background: palette.bg,
          border: `1px solid ${palette.border}`,
          color: palette.color,
          borderRadius: 6,
          padding: "8px 12px",
          fontSize: 10,
          lineHeight: 1.5,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

const SIGN_SPACE = 100;
// The signature artwork only fills ~2/3 of its square PNG, so draw it larger
// than the signing space and let it overlap the signature line slightly.
const SIGN_IMAGE_SIZE = 150;

function SignatureColumn({
  caption,
  role,
  name,
  title,
  withSignatureImage,
}: {
  caption: string;
  role: string;
  name: string;
  title: string;
  withSignatureImage?: boolean;
}) {
  return (
    <div style={{ width: 230, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: COLORS.muted }}>{caption}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.ink }}>{role}</div>
      <div style={{ height: SIGN_SPACE, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {withSignatureImage && (
          <img
            src={COMPANY.signature}
            alt="Tanda tangan"
            style={{ height: SIGN_IMAGE_SIZE, width: SIGN_IMAGE_SIZE, objectFit: "contain", display: "block", flexShrink: 0, position: "relative", top: -8 }}
          />
        )}
      </div>
      <div
        style={{
          borderTop: `1px solid ${COLORS.ink}`,
          margin: "0 18px",
          paddingTop: 5,
          fontSize: 11,
          fontWeight: 800,
          color: COLORS.ink,
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 9.5, color: COLORS.muted }}>{title}</div>
    </div>
  );
}

export function SignatureSection({
  date,
  companyRole = "Hormat kami,",
  companySignerName = COMPANY.signerName,
  companySignerTitle = COMPANY.signerTitle,
  clientApproval,
  leftNote,
}: {
  date: string;
  companyRole?: string;
  companySignerName?: string;
  companySignerTitle?: string;
  clientApproval?: { name: string; title: string } | null;
  leftNote?: React.ReactNode;
}) {
  const company = (
    <SignatureColumn
      caption={`${COMPANY.city}, ${date}`}
      role={companyRole}
      name={companySignerName}
      title={companySignerTitle}
      withSignatureImage
    />
  );

  return (
    <div style={{ paddingTop: 20 }}>
      {clientApproval ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <SignatureColumn
            caption="Disetujui & diterima oleh,"
            role="Pihak Klien / Pemesan"
            name={clientApproval.name}
            title={clientApproval.title}
          />
          {company}
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 9, color: COLORS.subtle, maxWidth: 300, lineHeight: 1.5 }}>{leftNote}</div>
          {company}
        </div>
      )}
    </div>
  );
}
