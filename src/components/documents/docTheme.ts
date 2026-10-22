/**
 * Shared design tokens for printable documents (Invoice, Quotation, Kwitansi).
 *
 * Documents use inline styles only (no Tailwind classes), so the same markup
 * renders identically in the live preview and in the off-screen PDF export,
 * independent of the app's dark UI styles.
 */

// A4 at 96 DPI: 210mm x 297mm
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const PAGE_PADDING_X = 56;
export const PAGE_PADDING_TOP = 48;
export const PAGE_PADDING_BOTTOM = 32;
export const FOOTER_HEIGHT = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - PAGE_PADDING_X * 2;
// Vertical space available for page content between the top padding and the footer
export const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM - FOOTER_HEIGHT;

export const COLORS = {
  ink: "#0f172a",
  text: "#334155",
  muted: "#64748b",
  subtle: "#94a3b8",
  line: "#e2e8f0",
  lineStrong: "#cbd5e1",
  soft: "#f8fafc",
  accent: "#0e7490",
  accentSoft: "#ecfeff",
  accentLine: "#a5f3fc",
  warn: "#b45309",
  warnSoft: "#fffbeb",
  warnLine: "#fde68a",
  success: "#047857",
  successSoft: "#ecfdf5",
  successLine: "#6ee7b7",
  white: "#ffffff",
};

// Self-hosted (see DocumentPrimitives.tsx) so documents render identically offline
export const FONT_FAMILY = "'Inter Variable', 'Segoe UI', Arial, Helvetica, sans-serif";

export const COMPANY = {
  name: "MATEHA PRODUCTION",
  tagline: "Event Production & Multimedia Specialist",
  addressLine1: "Komplek BTN No.6A, Sekejati, Kec. Buahbatu",
  addressLine2: "Kota Bandung, Jawa Barat 40286",
  phone: "+62 811-1244-7701",
  email: "matehaproduction@gmail.com",
  city: "Bandung",
  signerName: "Dhifa Aksa Hermawan",
  signerTitle: "CEO Mateha Production",
  logo: "/logo-mateha.png",
  signature: "/logo-ttd.png",
};
