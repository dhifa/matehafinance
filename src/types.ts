export type TabType =
  | "sheets"
  | "dashboard"
  | "finance"
  | "invoice"
  | "quotation"
  | "kwitansi"
  | "clients"
  | "payslips"
  | "staff-payslips"
  | "users";

export interface BudgetItem {
  id: string;
  num: number | string;
  description: string;
  qty: number;
  expense: number;
  notes: string;
  receiptImage?: string;
}

export interface Bank {
  id: string;
  name: string;
  accountNumber: string;
  accountHolder: string;
  isDefault: boolean;
  createdAt?: string;
}

export interface Client {
  id: string;
  name: string;
  company?: string;
  pic?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface QuotationItem {
  id: string;
  description: string;
  qty: number;
  price: number;
  total: number;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  customerName: string;
  customerPhone?: string;
  customerContact?: string;
  date: string;
  validUntil: string;
  subject: string; // Perihal
  items: QuotationItem[];
  grandTotal: number;
  status: "draft" | "sent" | "accepted" | "rejected";
  createdAt: string;
  selectedBanks: Bank[];
  termsAndConditions: string;
  notes?: string;
  // Approval Client
  showClientApproval?: boolean;
  clientApprovalName?: string;
  clientApprovalTitle?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  qty: number;
  price: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  customerContact?: string;
  subject?: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  grandTotal: number;
  status: "draft" | "sent" | "paid";
  createdAt: string;
  selectedBanks: Bank[];
  termsAndConditions: string;
  notes?: string;
  // Approval Client
  showClientApproval?: boolean;
  clientApprovalName?: string;
  clientApprovalTitle?: string;
}

export interface SharingRatio {
  mateha: number; // e.g. 25 for 25%
  staff: number;  // e.g. 70 for 70%
  investor: number; // e.g. 5 for 5%
}

export interface ProjectBudget {
  income: BudgetItem[];
  accommodation: BudgetItem[];
  sharingRatio: SharingRatio;
  feeDistribution: BudgetItem[];
  picBonusRatio: number; // e.g. 5 for 5%
  picBonusStaff?: string;
}

export interface EventProject {
  id: string;
  name: string;
  date: string;
  dates?: string[]; // Array of selected dates in YYYY-MM-DD format
  location: string;
  rab: ProjectBudget;
  realisasi: ProjectBudget;
  createdAt: string;
  ownerId?: string;
  isPublic?: boolean;
  isPointBClosed?: boolean;
  paymentStatus?: "belum" | "dp" | "lunas";
  dpAmount?: number;
}

// Global financial status of Mateha
export interface CashFlowGlobal {
  totalRevenue: number;
  totalAccommodationCosts: number;
  totalStaffFees: number;
  totalNetProfit: number;
}

export interface MatehaAccount {
  id: "kantong1" | "kantong2"; // kantong1: Transaksi, kantong2: Saving
  name: string;
  balance: number;
}

export interface MatehaTransaction {
  id: string;
  timestamp: string; // ISO string
  type: "income" | "expense" | "transfer";
  description: string;
  amount: number;
  fromAccountId?: "kantong1" | "kantong2";
  toAccountId?: "kantong1" | "kantong2";
}

export interface SyncedProject {
  id: string;
  syncedAmount: number;
}

export const DEFAULT_SHARING_RATIO: SharingRatio = {
  mateha: 25,
  staff: 70,
  investor: 5,
};

export const DEFAULT_PIC_BONUS_RATIO = 5;

// Helper to format currency
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Initial Mock Data taken directly from user's uploaded spreadsheet screenshot
export const INITIAL_PROJECTS: EventProject[] = [
  {
    id: "project-1",
    name: "Seminar FGD Kemenperin",
    date: "13 November 2025",
    location: "Sheraton",
    createdAt: "2025-11-01T00:00:00Z",
    rab: {
      income: [
        { id: "rab-in-1", num: 1, description: "Meeting hybrid 2 camera", qty: 1, expense: 4000000, notes: "" },
        { id: "rab-in-2", num: 2, description: "zoom 300p FHD", qty: 3, expense: 200000, notes: "" },
        { id: "rab-in-3", num: 3, description: "Sound system", qty: 1, expense: 2000000, notes: "" },
        { id: "rab-in-4", num: 5, description: "Matador", qty: 2, expense: 400000, notes: "" },
        { id: "rab-in-5", num: 6, description: "Mini garden", qty: 1, expense: 1000000, notes: "" },
        { id: "rab-in-6", num: 7, description: "Backdrop", qty: 1, expense: 3250000, notes: "" }
      ],
      accommodation: [
        { id: "rab-ac-1", num: 1, description: "Bensin", qty: 1, expense: 100000, notes: "" },
        { id: "rab-ac-2", num: 2, description: "Makan malam (7 may)", qty: 4, expense: 20000, notes: "" },
        { id: "rab-ac-3", num: 3, description: "Makan pagi(8 may)", qty: 4, expense: 15000, notes: "" },
        { id: "rab-ac-4", num: 4, description: "Makan siang(8 may)", qty: 4, expense: 20000, notes: "" },
        { id: "rab-ac-5", num: 5, description: "Makan malam (8 may)", qty: 4, expense: 20000, notes: "" },
        { id: "rab-ac-6", num: 6, description: "Parkir", qty: 2, expense: 25000, notes: "" },
        { id: "rab-ac-7", num: 7, description: "Emergency Fund", qty: 1, expense: 500000, notes: "" },
        { id: "rab-ac-8", num: 8, description: "Sound system", qty: 1, expense: 1750000, notes: "" },
        { id: "rab-ac-9", num: 9, description: "Matador", qty: 2, expense: 350000, notes: "" },
        { id: "rab-ac-10", num: 10, description: "Backdrop dan mini garden", qty: 1, expense: 3500000, notes: "" },
        { id: "rab-ac-11", num: 11, description: "zoom", qty: 2, expense: 125000, notes: "" }
      ],
      sharingRatio: { ...DEFAULT_SHARING_RATIO },
      picBonusRatio: DEFAULT_PIC_BONUS_RATIO,
      feeDistribution: [
        { id: "rab-fd-1", num: 1, description: "zoom op", qty: 1, expense: 400000, notes: "ai" },
        { id: "rab-fd-2", num: 2, description: "operator loading", qty: 1, expense: 100000, notes: "dhifo" },
        { id: "rab-fd-3", num: 3, description: "operator", qty: 1, expense: 400000, notes: "nuha" },
        { id: "rab-fd-4", num: 4, description: "Cameraman", qty: 2, expense: 400000, notes: "jimmy, kobil" },
        { id: "rab-fd-5", num: 5, description: "PIC EVENT", qty: 1, expense: 500000, notes: "dhifa" }
      ]
    },
    realisasi: {
      income: [
        { id: "rel-in-1", num: 1, description: "Meeting hybrid 2 camera", qty: 1, expense: 4000000, notes: "" },
        { id: "rel-in-2", num: 2, description: "zoom 300p FHD", qty: 3, expense: 200000, notes: "" },
        { id: "rel-in-3", num: 3, description: "Sound system", qty: 1, expense: 2000000, notes: "" },
        { id: "rel-in-4", num: 5, description: "Matador", qty: 2, expense: 400000, notes: "" },
        { id: "rel-in-5", num: 6, description: "Mini garden", qty: 1, expense: 1000000, notes: "" },
        { id: "rel-in-6", num: 7, description: "Backdrop", qty: 1, expense: 3250000, notes: "" }
      ],
      accommodation: [
        { id: "rel-ac-1", num: 1, description: "Bensin dan tol", qty: 1, expense: 100000, notes: "mth" },
        { id: "rel-ac-2", num: 2, description: "Sound system", qty: 1, expense: 1500000, notes: "mth" },
        { id: "rel-ac-3", num: 3, description: "Matador", qty: 2, expense: 350000, notes: "mth" },
        { id: "rel-ac-4", num: 4, description: "Backdrop dan mini garden", qty: 1, expense: 3500000, notes: "mth" },
        { id: "rel-ac-5", num: 5, description: "zoom", qty: 3, expense: 125000, notes: "mateha 1. dhifa 2" },
        { id: "rel-ac-6", num: 6, description: "gorengan", qty: 1, expense: 10000, notes: "abil" },
        { id: "rel-ac-7", num: 7, description: "suka rasa", qty: 1, expense: 115000, notes: "ai" },
        { id: "rel-ac-8", num: 8, description: "suka rasa", qty: 1, expense: 128000, notes: "ai" },
        { id: "rel-ac-9", num: 10, description: "orbit", qty: 1, expense: 66000, notes: "dhifa" }
      ],
      sharingRatio: { ...DEFAULT_SHARING_RATIO },
      picBonusRatio: DEFAULT_PIC_BONUS_RATIO,
      feeDistribution: [
        { id: "rel-fd-1", num: 1, description: "zoom op", qty: 1, expense: 400000, notes: "ai" },
        { id: "rel-fd-2", num: 2, description: "operator loading", qty: 1, expense: 100000, notes: "dhifo" },
        { id: "rel-fd-3", num: 3, description: "operator", qty: 1, expense: 400000, notes: "nuha" },
        { id: "rel-fd-4", num: 4, description: "Cameraman", qty: 2, expense: 400000, notes: "jimmy, kobil" },
        { id: "rel-fd-5", num: 5, description: "PIC EVENT", qty: 1, expense: 500000, notes: "dhifa" }
      ]
    }
  },
  {
    id: "project-2",
    name: "Live Broadcast Gathering Astra",
    date: "12 Desember 2025",
    location: "Shangri-La Jakarta",
    createdAt: "2025-12-01T00:00:00Z",
    rab: {
      income: [
        { id: "rab-in2-1", num: 1, description: "Broadcasting Setup Complete", qty: 1, expense: 15000000, notes: "4 cameras" },
        { id: "rab-in2-2", num: 2, description: "Led Screen P2.9 4x3m", qty: 1, expense: 8000000, notes: "" },
        { id: "rab-in2-3", num: 3, description: "Sound System 5000W", qty: 1, expense: 3500000, notes: "" }
      ],
      accommodation: [
        { id: "rab-ac2-1", num: 1, description: "Transportasi & Elf Box", qty: 2, expense: 500000, notes: "" },
        { id: "rab-ac2-2", num: 2, description: "Konsumsi Crew (3 hari)", qty: 15, expense: 75000, notes: "" },
        { id: "rab-ac2-3", num: 3, description: "Sewa LED Ground Support", qty: 1, expense: 1500000, notes: "" },
        { id: "rab-ac2-4", num: 4, description: "Liaison Officer / Permit", qty: 1, expense: 500000, notes: "" }
      ],
      sharingRatio: { ...DEFAULT_SHARING_RATIO },
      picBonusRatio: DEFAULT_PIC_BONUS_RATIO,
      feeDistribution: [
        { id: "rab-fd2-1", num: 1, description: "Show Director / TD", qty: 1, expense: 1500000, notes: "dhifa" },
        { id: "rab-fd2-2", num: 2, description: "System Engineer", qty: 1, expense: 800000, notes: "dhifo" },
        { id: "rab-fd2-3", num: 3, description: "Cameraman Professional", qty: 3, expense: 500000, notes: "nuha, kobil, jimmy" },
        { id: "rab-fd2-4", num: 4, description: "Audio Engineer", qty: 1, expense: 600000, notes: "ai" }
      ]
    },
    realisasi: {
      income: [
        { id: "rel-in2-1", num: 1, description: "Broadcasting Setup Complete", qty: 1, expense: 15000000, notes: "4 cameras" },
        { id: "rel-in2-2", num: 2, description: "Led Screen P2.9 4x3m", qty: 1, expense: 8000000, notes: "" },
        { id: "rel-in2-3", num: 3, description: "Sound System 5000W", qty: 1, expense: 3200000, notes: "Diskon vendor" }
      ],
      accommodation: [
        { id: "rel-ac2-1", num: 1, description: "Transportasi & Elf Box", qty: 2, expense: 500000, notes: "mth" },
        { id: "rel-ac2-2", num: 2, description: "Konsumsi Crew (3 hari)", qty: 15, expense: 80000, notes: "mth" },
        { id: "rel-ac2-3", num: 3, description: "Sewa LED Ground Support", qty: 1, expense: 1500000, notes: "mth" },
        { id: "rel-ac2-4", num: 4, description: "Liaison Officer / Permit", qty: 1, expense: 400000, notes: "nego" },
        { id: "rel-ac2-5", num: 5, description: "Parkir Tambahan", qty: 1, expense: 120000, notes: "mth" }
      ],
      sharingRatio: { ...DEFAULT_SHARING_RATIO },
      picBonusRatio: DEFAULT_PIC_BONUS_RATIO,
      feeDistribution: [
        { id: "rel-fd2-1", num: 1, description: "Show Director / TD", qty: 1, expense: 1500000, notes: "dhifa" },
        { id: "rel-fd2-2", num: 2, description: "System Engineer", qty: 1, expense: 800000, notes: "dhifo" },
        { id: "rel-fd2-3", num: 3, description: "Cameraman Professional", qty: 3, expense: 500000, notes: "nuha, kobil, jimmy" },
        { id: "rel-fd2-4", num: 4, description: "Audio Engineer", qty: 1, expense: 600000, notes: "ai" }
      ]
    }
  }
];

export interface PublishedPayslip {
  id: string; // "username-year-month"
  staffUsername: string;
  staffDisplayName: string;
  staffJob: string;
  month: number; // 0-11
  year: number;
  published: boolean;
  customEarnings: { id: string; description: string; amount: number }[];
  customDeductions: { id: string; description: string; amount: number }[];
  eventSummary?: { name: string; date: string; daysCount: number; location: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomRole {
  id: string;
  name: string; // e.g. "Staff", "Admin", "Finance", "Supervisor", "Logistik"
  description?: string;
  isSystem?: boolean; // system default roles like admin, staff, finance
  color?: string;
  allowedTabs?: TabType[]; // Features / Nav tabs allowed for this role
}

export interface KasbonRequest {
  id: string;
  staffUid: string;
  staffUsername: string;
  staffDisplayName?: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  adminNote?: string;
  periodMonth?: number;
  periodYear?: number;
  honorFeeBaseline?: number;
  bankName?: string; // Bank (BCA, Mandiri, BRI, dll) atau E-Wallet (DANA, GoPay, OVO, ShopeePay, dll)
  accountNumber?: string; // Nomor rekening / no HP akun e-wallet
  accountHolderName?: string; // Nama pemilik rekening / Atas Nama
}

export type KasbonPlafondType = "percent" | "auto" | "fixed" | "unlimited";

export interface UserProfile {
  uid: string;
  username: string;
  displayName?: string;
  password?: string;
  role: string; // "admin" | "staff" | "finance" or custom role name
  status?: "aktif" | "nonaktif";
  accessLevel?: string; // e.g. "Akses Penuh", "Input RAB & Slip", "Khusus Finance", etc.
  jobTitle?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  createdAt?: string;
  // Kasbon Plafond Configuration
  kasbonPlafondType?: KasbonPlafondType; // "percent" | "auto" | "fixed" | "unlimited" (default is "percent")
  kasbonPercentLimit?: number; // Persentase dari total THP bruto (Gaji + Reimbursement), default 50%
  kasbonFixedLimit?: number; // Nominal tetap jika kasbonPlafondType === "fixed" (misal Rp 2.000.000)
}

export interface Kwitansi {
  id: string;
  kwitansiNumber: string;
  invoiceId?: string;
  invoiceNumber?: string;
  customerName: string;
  amount: number;
  terbilangText?: string;
  paymentFor: string;
  date: string;
  paymentMethod?: string;
  receiverName?: string;
  receiverTitle?: string;
  createdAt: string;
  notes?: string;
}

export interface StaffRolePreset {
  id: string;
  roleName: string;
  defaultNames: string;
  defaultExpense?: number;
}

