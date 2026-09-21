import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, doc, setDoc, addDoc, query, where, updateDoc } from "firebase/firestore";
import { db, sanitizeForFirestore } from "../utils/firebase";
import { EventProject, UserProfile, formatRupiah, PublishedPayslip, KasbonRequest, BudgetItem } from "../types";
import { calculateProjectBudget } from "../utils/math";
import { 
  FileText, 
  Download, 
  Printer, 
  Check, 
  Plus, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  DollarSign, 
  Coins, 
  Wallet, 
  Calendar,
  Send,
  Eye,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  Receipt,
  Upload,
  Image as ImageIcon,
  Search,
  Filter,
  ArrowUpRight,
  X,
  FileSpreadsheet,
  Maximize2,
  Building2,
  CreditCard,
  Copy
} from "lucide-react";
import logo from "/favicon.png";
import ttd from "../../assets/ttd.png";
import { parseIndonesianDateText } from "../utils/date";
import { saveAs } from "file-saver";
import { generateStaffPayslipPdfBlob, printStaffPayslipDirectly, StaffPayslipPdfData } from "../utils/pdfGenerator";

export const PAYMENT_ACCOUNT_OPTIONS = [
  "BCA",
  "Bank Mandiri",
  "BRI",
  "BNI",
  "BSI (Bank Syariah Indonesia)",
  "CIMB Niaga",
  "Permata Bank",
  "Bank Danamon",
  "Bank Jago",
  "SeaBank",
  "DANA",
  "GoPay",
  "OVO",
  "ShopeePay",
  "LinkAja",
  "Lainnya / Bank Lain"
];

interface StaffPayslipViewProps {
  projects: EventProject[];
  currentUserProfile: UserProfile;
  onNotify: (text: string, type?: "success" | "info" | "error") => void;
}

const INDONESIAN_MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export interface ReimbursementRecord {
  id: string;
  projectId: string;
  projectName: string;
  projectDate: string;
  projectLocation: string;
  itemIndex: number;
  itemId: string;
  num: string | number;
  description: string;
  qty: number;
  expense: number;
  total: number;
  notes: string;
  receiptImage?: string;
  isCurrentPeriod: boolean;
}

export default function StaffPayslipView({
  projects,
  currentUserProfile,
  onNotify
}: StaffPayslipViewProps) {
  const isAdmin = currentUserProfile.role === "admin";
  const today = new Date();

  // Period filters
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());

  // Sub-tabs: 1. Pendapatan bulan ini, 2. Reimburse (Point B Realisasi), 3. Kasbon
  const [activeSubTab, setActiveSubTab] = useState<"pendapatan" | "reimburse" | "kasbon">("pendapatan");

  // Kasbon request form state
  const [kasbonAmount, setKasbonAmount] = useState<string>("");
  const [kasbonReason, setKasbonReason] = useState<string>("");
  const [kasbonBankName, setKasbonBankName] = useState<string>(currentUserProfile?.bankName || "BCA");
  const [kasbonCustomBank, setKasbonCustomBank] = useState<string>("");
  const [kasbonAccountNumber, setKasbonAccountNumber] = useState<string>(currentUserProfile?.accountNumber || "");
  const [kasbonAccountHolder, setKasbonAccountHolder] = useState<string>(currentUserProfile?.accountHolderName || currentUserProfile?.displayName || "");
  const [saveBankToProfile, setSaveBankToProfile] = useState<boolean>(true);
  const [copiedKasbonId, setCopiedKasbonId] = useState<string | null>(null);
  const [submittingKasbon, setSubmittingKasbon] = useState(false);

  // Sync profile bank info if loaded
  useEffect(() => {
    if (currentUserProfile) {
      if (currentUserProfile.bankName) {
        if (PAYMENT_ACCOUNT_OPTIONS.includes(currentUserProfile.bankName)) {
          setKasbonBankName(currentUserProfile.bankName);
        } else {
          setKasbonBankName("Lainnya / Bank Lain");
          setKasbonCustomBank(currentUserProfile.bankName);
        }
      }
      if (currentUserProfile.accountNumber) setKasbonAccountNumber(currentUserProfile.accountNumber);
      if (currentUserProfile.accountHolderName || currentUserProfile.displayName) {
        setKasbonAccountHolder(currentUserProfile.accountHolderName || currentUserProfile.displayName || "");
      }
    }
  }, [currentUserProfile]);

  // Kasbon requests list
  const [kasbonList, setKasbonList] = useState<KasbonRequest[]>(() => {
    try {
      const cached = localStorage.getItem("mateha_cached_kasbon");
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [loadingKasbon, setLoadingKasbon] = useState(false);

  // Published payslips collection state
  const [publishedPayslips, setPublishedPayslips] = useState<Record<string, PublishedPayslip>>(() => {
    try {
      const cached = localStorage.getItem("mateha_cached_payslips");
      if (cached) return JSON.parse(cached);
    } catch {}
    return {};
  });
  const [loadingPayslips, setLoadingPayslips] = useState(false);

  // Reimburse Tab states
  const [reimburseFilterScope, setReimburseFilterScope] = useState<"current" | "all">("current");
  const [reimburseSearchQuery, setReimburseSearchQuery] = useState<string>("");
  const [viewingReceiptModal, setViewingReceiptModal] = useState<{
    image: string;
    title: string;
    description: string;
    amount: number;
    eventName: string;
  } | null>(null);

  // Add new Reimburse Modal state
  const [isAddReimburseOpen, setIsAddReimburseOpen] = useState(false);
  const [newReimburseProjectId, setNewReimburseProjectId] = useState<string>("");
  const [newReimburseDesc, setNewReimburseDesc] = useState<string>("");
  const [newReimburseQty, setNewReimburseQty] = useState<number>(1);
  const [newReimburseExpense, setNewReimburseExpense] = useState<string>("");
  const [newReimburseReceiptImage, setNewReimburseReceiptImage] = useState<string | null>(null);
  const [submittingNewReimburse, setSubmittingNewReimburse] = useState(false);

  // List of active projects that have Point B / Reimburse open (not closed by admin in Lembar Kerja Point B)
  const openReimburseProjects = useMemo(() => {
    return projects.filter((p) => !p.isPointBClosed);
  }, [projects]);

  // Keep newReimburseProjectId valid if the selected project gets closed by admin
  useEffect(() => {
    if (newReimburseProjectId && !openReimburseProjects.some((p) => p.id === newReimburseProjectId)) {
      setNewReimburseProjectId("");
    }
  }, [openReimburseProjects, newReimburseProjectId]);

  // In-row upload receipt state
  const [uploadingReceiptItemId, setUploadingReceiptItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetItemForUpload, setTargetItemForUpload] = useState<{
    projectId: string;
    itemId: string;
    itemIndex: number;
  } | null>(null);

  // Print ref & Export states
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);

  // 1. Subscribe to published payslips
  useEffect(() => {
    setLoadingPayslips(true);
    let q: any;
    if (isAdmin) {
      q = collection(db, "payslips");
    } else if (currentUserProfile?.username) {
      q = query(collection(db, "payslips"), where("staffUsername", "==", currentUserProfile.username));
    } else {
      setLoadingPayslips(false);
      return;
    }

    const unsub = onSnapshot(
      q,
      (snap: any) => {
        const dict: Record<string, PublishedPayslip> = {};
        snap.forEach((docSnap: any) => {
          dict[docSnap.id] = docSnap.data() as PublishedPayslip;
        });
        setPublishedPayslips(dict);
        try {
          localStorage.setItem("mateha_cached_payslips", JSON.stringify(dict));
        } catch {}
        setLoadingPayslips(false);
      },
      (err: any) => {
        const isQuota = err?.code === "resource-exhausted" || (err?.message || "").toLowerCase().includes("quota");
        if (isQuota) {
          console.warn("Firestore quota limit reached while loading payslips. Using local cache.");
        } else {
          console.warn("Error loading payslips:", err?.message || err);
        }
        setLoadingPayslips(false);
      }
    );
    return () => unsub();
  }, [isAdmin, currentUserProfile?.username]);

  // 2. Subscribe to kasbon requests
  useEffect(() => {
    setLoadingKasbon(true);
    let q: any;
    if (isAdmin) {
      q = collection(db, "kasbon_requests");
    } else if (currentUserProfile?.uid) {
      q = query(collection(db, "kasbon_requests"), where("staffUid", "==", currentUserProfile.uid));
    } else {
      setLoadingKasbon(false);
      return;
    }

    const unsub = onSnapshot(
      q,
      (snap: any) => {
        const list: KasbonRequest[] = [];
        snap.forEach((docSnap: any) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        // Sort newest first
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setKasbonList(list);
        try {
          localStorage.setItem("mateha_cached_kasbon", JSON.stringify(list));
        } catch {}
        setLoadingKasbon(false);
      },
      (err: any) => {
        const isQuota = err?.code === "resource-exhausted" || (err?.message || "").toLowerCase().includes("quota");
        if (isQuota) {
          console.warn("Firestore quota limit reached while loading kasbon requests. Using local cache.");
        } else {
          console.warn("Error loading kasbon requests:", err?.message || err);
        }
        setLoadingKasbon(false);
      }
    );
    return () => unsub();
  }, [isAdmin, currentUserProfile?.uid]);

  // Filter kasbon requests for current staff (or all if admin)
  const myKasbonRequests = useMemo(() => {
    if (isAdmin) return kasbonList;
    return kasbonList.filter((k) => k.staffUid === currentUserProfile.uid || k.staffUsername.toLowerCase() === currentUserProfile.username.toLowerCase());
  }, [kasbonList, currentUserProfile, isAdmin]);

  // Admin handles approve/reject kasbon
  const handleUpdateKasbonStatus = async (reqId: string, newStatus: "approved" | "rejected") => {
    if (!isAdmin) {
      onNotify("Hanya Administrator yang dapat memproses pengajuan kasbon!", "error");
      return;
    }
    try {
      await updateDoc(doc(db, "kasbon_requests", reqId), {
        status: newStatus,
        approvedAt: new Date().toISOString(),
        approvedBy: currentUserProfile.username
      });
      onNotify(`Pengajuan kasbon telah di-${newStatus === "approved" ? "setujui" : "tolak"}!`, "success");
    } catch (err: any) {
      console.error("Error updating kasbon status:", err);
      onNotify("Gagal memperbarui status kasbon: " + (err.message || "Periksa hak akses admin"), "error");
    }
  };

  // Helper date checker for projects in selected period
  const isProjInSelectedPeriod = (proj: EventProject) => {
    if (proj.dates && proj.dates.length > 0) {
      return proj.dates.some((d) => {
        const parts = d.split("-");
        const yr = parseInt(parts[0], 10);
        const mo = parseInt(parts[1], 10) - 1;
        return yr === selectedYear && mo === selectedMonth;
      });
    }

    const parsed = parseIndonesianDateText(proj.date);
    if (parsed.length > 0) {
      return parsed.some((d) => {
        const parts = d.split("-");
        const yr = parseInt(parts[0], 10);
        const mo = parseInt(parts[1], 10) - 1;
        return yr === selectedYear && mo === selectedMonth;
      });
    }

    if (proj.createdAt) {
      const d = new Date(proj.createdAt);
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    }

    return false;
  };

  // Staff username & matcher helper
  const staffUsername = currentUserProfile.username.toLowerCase().trim();
  const staffDisplayName = (currentUserProfile.displayName || "").toLowerCase().trim();

  const matchesStaffNotes = (notesString: string) => {
    if (!notesString) return false;
    const parts = notesString.toLowerCase().split(/[,/&]|\bdan\b/g);
    return parts.some((p) => {
      const trimmed = p.trim();
      return (
        trimmed === staffUsername ||
        (staffDisplayName && trimmed === staffDisplayName) ||
        trimmed.includes(staffUsername)
      );
    });
  };

  // =========================================================================
  // DATA DARI POINT B REALISASI (REIMBURSEMENTS)
  // =========================================================================
  const allReimbursementRecords = useMemo(() => {
    const list: ReimbursementRecord[] = [];

    projects.forEach((proj) => {
      if (!proj.id || !proj.name || proj.name.trim() === "") return;
      const budgetSource: any = proj.realisasi || {};

      // Point B: Operasional & Akomodasi (Reimbursements)
      if (budgetSource.accommodation && Array.isArray(budgetSource.accommodation)) {
        const inPeriod = isProjInSelectedPeriod(proj);
        budgetSource.accommodation.forEach((item: BudgetItem, idx: number) => {
          if (matchesStaffNotes(item.notes)) {
            const qty = Number(item.qty) || 1;
            const expense = Number(item.expense) || 0;
            list.push({
              id: `${proj.id}-ac-${idx}-${item.id || idx}`,
              projectId: proj.id,
              projectName: proj.name,
              projectDate: proj.date || "-",
              projectLocation: proj.location || "-",
              itemIndex: idx,
              itemId: item.id || `ac-${idx}`,
              num: item.num || idx + 1,
              description: item.description || "Pengeluaran Operasional",
              qty,
              expense,
              total: qty * expense,
              notes: item.notes || "",
              receiptImage: item.receiptImage,
              isCurrentPeriod: inPeriod
            });
          }
        });
      }
    });

    // Sort: newest project or current period first
    return list;
  }, [projects, staffUsername, staffDisplayName, selectedMonth, selectedYear]);

  // Filtered Reimbursements based on current UI scope & search query
  const displayedReimbursements = useMemo(() => {
    return allReimbursementRecords.filter((rec) => {
      if (reimburseFilterScope === "current" && !rec.isCurrentPeriod) {
        return false;
      }
      if (reimburseSearchQuery.trim()) {
        const q = reimburseSearchQuery.toLowerCase();
        const matchProj = rec.projectName.toLowerCase().includes(q);
        const matchDesc = rec.description.toLowerCase().includes(q);
        const matchLoc = rec.projectLocation.toLowerCase().includes(q);
        if (!matchProj && !matchDesc && !matchLoc) return false;
      }
      return true;
    });
  }, [allReimbursementRecords, reimburseFilterScope, reimburseSearchQuery]);

  // Aggregate stats for Reimburse
  const currentPeriodReimburseTotal = useMemo(() => {
    return allReimbursementRecords
      .filter((r) => r.isCurrentPeriod)
      .reduce((acc, curr) => acc + curr.total, 0);
  }, [allReimbursementRecords]);

  const allTimeReimburseTotal = useMemo(() => {
    return allReimbursementRecords.reduce((acc, curr) => acc + curr.total, 0);
  }, [allReimbursementRecords]);

  // =========================================================================
  // CALCULATED EARNINGS FOR PAYSLIP
  // =========================================================================
  const calculatedItems = useMemo(() => {
    const earnings: Array<{
      id: string;
      projectName: string;
      description: string;
      amount: number;
      type: "fee" | "driver" | "reimbursement";
    }> = [];

    const attendedEvents: Record<string, {
      name: string;
      date: string;
      location: string;
      daysCount: number;
    }> = {};

    projects.forEach((proj) => {
      if (!isProjInSelectedPeriod(proj)) return;
      if (!proj.id || !proj.name || proj.name.trim() === "") return;

      const budgetSource: any = proj.realisasi || {};
      let staffHasEarning = false;

      // 1. Fee Distribution (Point D Roster)
      if (budgetSource.feeDistribution) {
        budgetSource.feeDistribution.forEach((item: any, idx: number) => {
          if (matchesStaffNotes(item.notes)) {
            staffHasEarning = true;
            const isDriver = (item.description || "").toLowerCase().includes("driver") ||
                            (item.description || "").toLowerCase().includes("drv") ||
                            (item.description || "").toLowerCase().includes("sopir");

            earnings.push({
              id: `${proj.id}-fee-${idx}-${item.id}`,
              projectName: proj.name,
              description: isDriver ? `${item.description} *(DRV)` : item.description,
              amount: (Number(item.expense) || 0) * (Number(item.qty) || 1),
              type: isDriver ? "driver" : "fee"
            });
          }
        });
      }

      // 1b. PIC Bonus
      const calc = calculateProjectBudget(budgetSource);
      if (budgetSource.picBonusStaff && matchesStaffNotes(budgetSource.picBonusStaff)) {
        staffHasEarning = true;
        earnings.push({
          id: `${proj.id}-pic-bonus`,
          projectName: proj.name,
          description: `PIC Bonus`,
          amount: calc.picBonus,
          type: "fee"
        });
      }

      // 2. Accommodation (Reimbursement from Point B)
      if (budgetSource.accommodation) {
        budgetSource.accommodation.forEach((item: any, idx: number) => {
          if (matchesStaffNotes(item.notes)) {
            staffHasEarning = true;
            earnings.push({
              id: `${proj.id}-ac-${idx}-${item.id}`,
              projectName: proj.name,
              description: `${item.description} *(RMBS)`,
              amount: (Number(item.expense) || 0) * (Number(item.qty) || 1),
              type: "reimbursement"
            });
          }
        });
      }

      if (staffHasEarning) {
        const days = proj.dates && proj.dates.length > 0 ? proj.dates.length : 1;
        attendedEvents[proj.id] = {
          name: proj.name,
          date: proj.date,
          location: proj.location,
          daysCount: days
        };
      }
    });

    return {
      feeEarnings: earnings,
      attendedEvents: Object.values(attendedEvents)
    };
  }, [projects, staffUsername, staffDisplayName, selectedMonth, selectedYear]);

  // Look for published payslip from Admin
  const payslipKey = `${staffUsername}-${selectedYear}-${selectedMonth}`;
  const rawSavedPayslip = publishedPayslips[payslipKey] || null;
  const isPayslipPublished = !!(rawSavedPayslip && rawSavedPayslip.published);
  const savedPayslip = isPayslipPublished ? rawSavedPayslip : null;

  // Final Earnings combination
  const finalEarnings = useMemo(() => {
    const list = [...(calculatedItems.feeEarnings || []).map((item) => ({
      description: `${item.projectName} ${item.description?.includes("*") ? item.description : `- ${item.description}`}`,
      amount: item.amount,
      type: item.type
    }))];

    if (savedPayslip && savedPayslip.customEarnings) {
      savedPayslip.customEarnings.forEach((manual) => {
        list.push({
          description: manual.description,
          amount: manual.amount,
          type: "fee"
        });
      });
    }

    return list;
  }, [calculatedItems, savedPayslip]);

  // Final Deductions combination (including approved kasbon for this month)
  const finalDeductions = useMemo(() => {
    const list: Array<{ description: string; amount: number }> = [];

    if (savedPayslip && savedPayslip.customDeductions) {
      savedPayslip.customDeductions.forEach((manual) => {
        list.push({
          description: manual.description,
          amount: manual.amount
        });
      });
    }

    // Auto include approved kasbons for the period that haven't been manually listed
    myKasbonRequests.forEach((k) => {
      if (k.status === "approved" && k.createdAt) {
        const kDate = new Date(k.createdAt);
        if (kDate.getFullYear() === selectedYear && kDate.getMonth() === selectedMonth) {
          const already = list.some((d) => d.description.toLowerCase().includes("kasbon") && d.amount === k.amount);
          if (!already) {
            list.push({
              description: `Kasbon: ${k.reason}`,
              amount: k.amount
            });
          }
        }
      }
    });

    return list;
  }, [savedPayslip, myKasbonRequests, selectedMonth, selectedYear]);

  const totalEarnings = finalEarnings.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const totalDeductions = finalDeductions.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const takeHomePay = Math.max(0, totalEarnings - totalDeductions);

  // Sub-breakdown of earnings
  const feeOnlyEarnings = useMemo(() => {
    return finalEarnings.filter(item => item.type !== "reimbursement").reduce((acc, curr) => acc + curr.amount, 0);
  }, [finalEarnings]);

  const reimburseOnlyEarnings = useMemo(() => {
    return finalEarnings.filter(item => item.type === "reimbursement").reduce((acc, curr) => acc + curr.amount, 0);
  }, [finalEarnings]);

  // Active kasbon in this selected period (approved or pending, excluding rejected)
  const currentPeriodActiveKasbon = useMemo(() => {
    return myKasbonRequests
      .filter((k) => {
        if (k.status === "rejected") return false;
        if (k.periodMonth !== undefined && k.periodYear !== undefined) {
          return k.periodMonth === selectedMonth && k.periodYear === selectedYear;
        }
        if (!k.createdAt) return false;
        const d = new Date(k.createdAt);
        return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
      })
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [myKasbonRequests, selectedYear, selectedMonth]);

  // Plafond configuration from user profile
  const kasbonPlafondType = currentUserProfile.kasbonPlafondType || "percent";
  const kasbonPercentLimit = currentUserProfile.kasbonPercentLimit ?? 50;
  const kasbonFixedLimit = currentUserProfile.kasbonFixedLimit || 0;
  const totalGrossTHP = totalEarnings; // Total THP sebelum kasbon (Gaji/Honor + Reimbursement + Tambahan)

  // Maximum kasbon that can be requested based on policy
  const maxAllowedKasbon = useMemo(() => {
    if (kasbonPlafondType === "unlimited") {
      return Infinity;
    }
    if (kasbonPlafondType === "fixed") {
      return Math.max(0, kasbonFixedLimit - currentPeriodActiveKasbon);
    }
    if (kasbonPlafondType === "auto") {
      return Math.max(0, feeOnlyEarnings - currentPeriodActiveKasbon);
    }
    // Default "percent": % of Gross THP (Gaji + Reimbursement)
    const percentQuota = Math.floor(totalGrossTHP * (kasbonPercentLimit / 100));
    return Math.max(0, percentQuota - currentPeriodActiveKasbon);
  }, [kasbonPlafondType, kasbonFixedLimit, kasbonPercentLimit, totalGrossTHP, feeOnlyEarnings, currentPeriodActiveKasbon]);

  // Handle staff submitting kasbon request with constraint check
  const handleSubmitKasbon = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(kasbonAmount.replace(/\D/g, ""));
    if (!amountNum || amountNum <= 0) {
      onNotify("Nominal kasbon harus berupa angka positif!", "error");
      return;
    }
    if (kasbonPlafondType === "percent" && totalGrossTHP <= 0) {
      onNotify(`Pengajuan tidak dapat diproses: Anda belum memiliki catatan pendapatan (Gaji/Honor/Reimbursement) pada periode ${INDONESIAN_MONTH_NAMES[selectedMonth]} ${selectedYear}. Hubungi Admin jika membutuhkan penyesuaian batas kasbon.`, "error");
      return;
    }
    if (kasbonPlafondType === "auto" && feeOnlyEarnings <= 0) {
      onNotify(`Pengajuan tidak dapat diproses: Anda belum memiliki Honor Fee & Lapangan pada periode ${INDONESIAN_MONTH_NAMES[selectedMonth]} ${selectedYear}. Hubungi Admin jika membutuhkan penyesuaian batas kasbon.`, "error");
      return;
    }
    if (kasbonPlafondType === "fixed" && kasbonFixedLimit <= 0) {
      onNotify("Batas limit kasbon tetap Anda saat ini belum diatur oleh Admin (Rp 0). Hubungi Admin untuk mengatur limit kasbon Anda.", "error");
      return;
    }
    if (kasbonPlafondType !== "unlimited" && amountNum > maxAllowedKasbon) {
      const limitLabel =
        kasbonPlafondType === "fixed"
          ? "sisa batas limit tetap bulanan"
          : kasbonPlafondType === "auto"
          ? "sisa Honor Fee & Lapangan"
          : `sisa batas limit ${kasbonPercentLimit}% THP`;
      onNotify(`Nominal kasbon (${formatRupiah(amountNum)}) melebihi ${limitLabel} Anda (${formatRupiah(maxAllowedKasbon)})!`, "error");
      return;
    }
    if (!kasbonReason.trim()) {
      onNotify("Keperluan kasbon harus diisi!", "error");
      return;
    }

    const finalBankName = kasbonBankName === "Lainnya / Bank Lain" ? kasbonCustomBank.trim() : kasbonBankName;
    if (!finalBankName) {
      onNotify("Pilih atau isi Bank / E-Wallet tujuan pencairan!", "error");
      return;
    }
    if (!kasbonAccountNumber.trim()) {
      onNotify("Nomor rekening atau nomor HP e-wallet pencairan harus diisi!", "error");
      return;
    }
    if (!kasbonAccountHolder.trim()) {
      onNotify("Nama pemilik rekening / e-wallet (Atas Nama) harus diisi!", "error");
      return;
    }

    setSubmittingKasbon(true);
    try {
      const newReq: Omit<KasbonRequest, "id"> = {
        staffUid: currentUserProfile.uid,
        staffUsername: currentUserProfile.username,
        staffDisplayName: currentUserProfile.displayName || currentUserProfile.username.toUpperCase(),
        amount: amountNum,
        reason: kasbonReason.trim(),
        status: "pending",
        createdAt: new Date().toISOString(),
        periodMonth: selectedMonth,
        periodYear: selectedYear,
        honorFeeBaseline: kasbonPlafondType === "auto" ? feeOnlyEarnings : totalGrossTHP,
        bankName: finalBankName,
        accountNumber: kasbonAccountNumber.trim(),
        accountHolderName: kasbonAccountHolder.trim()
      };

      await addDoc(collection(db, "kasbon_requests"), newReq);

      // Save preference to user profile if checked
      if (saveBankToProfile && currentUserProfile.uid) {
        try {
          await updateDoc(doc(db, "users", currentUserProfile.uid), {
            bankName: finalBankName,
            accountNumber: kasbonAccountNumber.trim(),
            accountHolderName: kasbonAccountHolder.trim()
          });
        } catch (uErr) {
          console.warn("Could not save bank info to profile:", uErr);
        }
      }

      onNotify("Pengajuan kasbon berhasil dikirim! Menunggu persetujuan (ACC) admin.", "success");
      setKasbonAmount("");
      setKasbonReason("");
    } catch (err: any) {
      console.error("Error submitting kasbon:", err);
      onNotify("Gagal mengajukan kasbon: " + (err.message || "Periksa izin dan koneksi"), "error");
    } finally {
      setSubmittingKasbon(false);
    }
  };

  // Available years list
  const yearsList = useMemo(() => {
    const list = [];
    const base = new Date().getFullYear();
    for (let i = base - 2; i <= base + 5; i++) {
      list.push(i);
    }
    return list;
  }, []);

  // Payslip Data Payload for PDF & Print
  const currentPayslipData: StaffPayslipPdfData = useMemo(() => ({
    staffUsername: staffUsername,
    staffDisplayName: staffDisplayName || staffUsername.toUpperCase(),
    staffRole: currentUserProfile?.role,
    staffJob: currentUserProfile?.jobTitle,
    monthName: INDONESIAN_MONTH_NAMES[selectedMonth],
    year: selectedYear,
    earnings: finalEarnings,
    deductions: finalDeductions,
    totalEarnings,
    totalDeductions,
    takeHomePay,
    attendedEvents: calculatedItems.attendedEvents,
    isPublished: isPayslipPublished || isAdmin,
  }), [
    staffUsername,
    staffDisplayName,
    currentUserProfile,
    selectedMonth,
    selectedYear,
    finalEarnings,
    finalDeductions,
    totalEarnings,
    totalDeductions,
    takeHomePay,
    calculatedItems.attendedEvents,
    isPayslipPublished,
    isAdmin,
  ]);

  // Export High-Precision A4 PDF
  const handleDownloadPdf = async () => {
    if (!isPayslipPublished && !isAdmin) {
      onNotify("Slip gaji masih berstatus DRAFT dan belum dipublikasikan oleh Admin. Dokumen belum dapat diunduh.", "error");
      return;
    }
    setIsExportingPdf(true);
    try {
      const blob = await generateStaffPayslipPdfBlob(currentPayslipData);
      const filename = `Slip_Gaji_${staffUsername}_${INDONESIAN_MONTH_NAMES[selectedMonth]}_${selectedYear}.pdf`;
      saveAs(blob, filename);
      onNotify("Slip gaji resmi berhasil diunduh dalam format PDF!", "success");
    } catch (err: any) {
      console.error("Download PDF Error:", err);
      onNotify("Gagal mengunduh PDF slip gaji: " + err.message, "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Direct Browser Print with Injected Complete CSS
  const handlePrint = async () => {
    if (!isPayslipPublished && !isAdmin) {
      onNotify("Slip gaji masih berstatus DRAFT dan belum dipublikasikan oleh Admin. Pencetakan tidak diizinkan.", "error");
      return;
    }
    setIsDirectPrinting(true);
    try {
      const success = await printStaffPayslipDirectly(currentPayslipData);
      if (!success) {
        onNotify("Gagal membuka jendela cetak. Pastikan izin pop-up browser telah diizinkan.", "error");
      }
    } catch (err: any) {
      console.error("Print Error:", err);
      onNotify("Gagal memproses cetak slip gaji: " + err.message, "error");
    } finally {
      setIsDirectPrinting(false);
    }
  };

  // =========================================================================
  // ACTIONS: ADD NEW REIMBURSE TO POINT B REALISASI
  // =========================================================================
  const handleAddNewReimburse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReimburseProjectId) {
      onNotify("Pilih event yang bersangkutan terlebih dahulu!", "error");
      return;
    }
    if (!newReimburseDesc.trim()) {
      onNotify("Uraian pengeluaran reimburse harus diisi!", "error");
      return;
    }
    const expenseNum = Number(newReimburseExpense.replace(/\D/g, ""));
    if (!expenseNum || expenseNum <= 0) {
      onNotify("Biaya satuan harus berupa angka lebih dari 0!", "error");
      return;
    }

    const targetProj = projects.find((p) => p.id === newReimburseProjectId);
    if (!targetProj) {
      onNotify("Data proyek tidak ditemukan!", "error");
      return;
    }

    if (targetProj.isPointBClosed) {
      onNotify(`Pengajuan reimburse untuk event "${targetProj.name}" telah ditutup oleh Admin pada lembar kerja.`, "error");
      return;
    }

    setSubmittingNewReimburse(true);
    try {
      const currentCosts: BudgetItem[] = targetProj.realisasi?.accommodation || [];
      const nextNum = currentCosts.length > 0
        ? (parseInt(currentCosts[currentCosts.length - 1].num as string) || currentCosts.length) + 1
        : 1;

      const newItem: BudgetItem = {
        id: `rel-ac-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        num: nextNum,
        description: newReimburseDesc.trim(),
        qty: Number(newReimburseQty) || 1,
        expense: expenseNum,
        notes: currentUserProfile.username,
        receiptImage: newReimburseReceiptImage || undefined
      };

      const updatedProject: EventProject = {
        ...targetProj,
        realisasi: {
          ...targetProj.realisasi,
          accommodation: [...currentCosts, newItem]
        }
      };

      await setDoc(doc(db, "projects", targetProj.id), sanitizeForFirestore(updatedProject));
      onNotify(`Sukses! Pengeluaran reimburse ${formatRupiah(newItem.qty * newItem.expense)} berhasil ditambahkan ke Point B Realisasi event "${targetProj.name}".`, "success");
      
      // Reset form
      setNewReimburseDesc("");
      setNewReimburseQty(1);
      setNewReimburseExpense("");
      setNewReimburseReceiptImage(null);
      setIsAddReimburseOpen(false);
    } catch (err: any) {
      console.error("Gagal menambahkan reimburse Point B:", err);
      onNotify("Gagal menambahkan reimburse ke Point B: " + (err.message || "Periksa koneksi"), "error");
    } finally {
      setSubmittingNewReimburse(false);
    }
  };

  // Upload receipt image for existing item
  const handleTriggerUploadReceipt = (projectId: string, itemId: string, itemIndex: number) => {
    setTargetItemForUpload({ projectId, itemId, itemIndex });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetItemForUpload) return;

    if (!file.type.startsWith("image/")) {
      onNotify("Format file harus berupa gambar (JPG, PNG, WebP)!", "error");
      return;
    }

    // Limit to 4MB
    if (file.size > 4 * 1024 * 1024) {
      onNotify("Ukuran foto maksimal 4MB!", "error");
      return;
    }

    setUploadingReceiptItemId(targetItemForUpload.itemId);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const targetProj = projects.find((p) => p.id === targetItemForUpload.projectId);
        if (!targetProj) {
          onNotify("Proyek tidak ditemukan!", "error");
          setUploadingReceiptItemId(null);
          return;
        }

        const currentCosts: BudgetItem[] = [...(targetProj.realisasi?.accommodation || [])];
        const updatedCosts = currentCosts.map((it, idx) => {
          if (it.id === targetItemForUpload.itemId || idx === targetItemForUpload.itemIndex) {
            return { ...it, receiptImage: base64Data };
          }
          return it;
        });

        const updatedProject: EventProject = {
          ...targetProj,
          realisasi: {
            ...targetProj.realisasi,
            accommodation: updatedCosts
          }
        };

        await setDoc(doc(db, "projects", targetProj.id), sanitizeForFirestore(updatedProject));
        onNotify("Foto nota / struk berhasil dilampirkan ke Point B Realisasi!", "success");
        setUploadingReceiptItemId(null);
        setTargetItemForUpload(null);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("Error uploading receipt:", err);
      onNotify("Gagal mengunggah foto nota: " + (err.message || "Gagal memproses gambar"), "error");
      setUploadingReceiptItemId(null);
    }
  };

  return (
    <div className="space-y-6 text-left" id="staff-payslip-workspace">
      {/* Hidden file input for table receipt upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleReceiptFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* HEADER HERO */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[#0c0e12]/80 border border-slate-900 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold shadow-inner">
              <Coins className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              Staff Payslip & Keuangan Lapangan
            </h2>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
              {currentUserProfile.username}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Rekapitulasi slip gaji bulanan, rincian talangan reimburse dari Point B Realisasi, serta fasilitas kasbon terpadu.
          </p>
        </div>

        {/* 3 SUB-TABS: Pendapatan bulan ini, Reimburse (Point B Realisasi), Kasbon */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-900">
          {/* Tab 1: Pendapatan Bulan Ini */}
          <button
            onClick={() => setActiveSubTab("pendapatan")}
            id="tab-btn-pendapatan"
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === "pendapatan"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Pendapatan Bulan Ini</span>
          </button>

          {/* Tab 2: Reimburse (Point B Realisasi) */}
          <button
            onClick={() => setActiveSubTab("reimburse")}
            id="tab-btn-reimburse"
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === "reimburse"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Reimburse (Point B Realisasi)</span>
            {allReimbursementRecords.filter((r) => r.isCurrentPeriod).length > 0 && (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-300 font-extrabold ml-1">
                {allReimbursementRecords.filter((r) => r.isCurrentPeriod).length}
              </span>
            )}
          </button>

          {/* Tab 3: Kasbon */}
          <button
            onClick={() => setActiveSubTab("kasbon")}
            id="tab-btn-kasbon"
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === "kasbon"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Kasbon</span>
            {myKasbonRequests.filter((k) => k.status === "pending").length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1" />
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ==================== TAB 1: PENDAPATAN BULAN INI ======================== */}
      {/* ========================================================================= */}
      {activeSubTab === "pendapatan" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Take Home Pay (Bulan Ini)
              </span>
              <span className="text-xl font-extrabold font-mono text-cyan-400 block">
                {formatRupiah(takeHomePay)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1 font-sans">
                <span>Bersih diterima setelah potongan kasbon</span>
              </span>
              <div className="absolute right-3 top-3 text-cyan-500/10">
                <Coins className="w-12 h-12" />
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Honor Fee & Lapangan
              </span>
              <span className="text-xl font-extrabold font-mono text-slate-200 block">
                {formatRupiah(feeOnlyEarnings)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1 font-sans">
                <span>Point D Roster, Driver & PIC Bonus</span>
              </span>
              <div className="absolute right-3 top-3 text-slate-500/10">
                <FileText className="w-12 h-12" />
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400/90 block mb-1">
                Reimburse Terklaim (Point B)
              </span>
              <span className="text-xl font-extrabold font-mono text-emerald-400 block">
                {formatRupiah(reimburseOnlyEarnings)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1 font-sans">
                <span>Talangan Point B Realisasi masuk slip</span>
              </span>
              <div className="absolute right-3 top-3 text-emerald-500/10">
                <Receipt className="w-12 h-12" />
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400/90 block mb-1">
                Potongan Kasbon
              </span>
              <span className="text-xl font-extrabold font-mono text-rose-400 block">
                -{formatRupiah(totalDeductions)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1 font-sans">
                <span>{finalDeductions.length} potongan disetujui</span>
              </span>
              <div className="absolute right-3 top-3 text-rose-500/10">
                <Wallet className="w-12 h-12" />
              </div>
            </div>
          </div>

          {/* FILTER CONTROLS & PRINT BAR */}
          <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[9px] font-mono">Tahun</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500/50 cursor-pointer"
                >
                  {yearsList.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[9px] font-mono">Bulan</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500/50 cursor-pointer"
                >
                  {INDONESIAN_MONTH_NAMES.map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4">
                <span className="text-[11px] text-slate-400 font-mono">
                  Anggota: <strong className="text-white uppercase">{currentUserProfile.username}</strong>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab("reimburse")}
                className="flex items-center space-x-1.5 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-800/40 font-bold py-2 px-3 rounded-xl text-xs transition cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Rincian Reimburse (Point B)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={(!isPayslipPublished && !isAdmin) || isExportingPdf}
                title={!isPayslipPublished && !isAdmin ? "Slip gaji masih DRAFT dan belum dipublikasikan oleh Admin" : "Download PDF Resmi A4"}
                className={`flex items-center space-x-1.5 font-bold py-2 px-3.5 rounded-xl text-xs transition shadow-sm ${
                  !isPayslipPublished && !isAdmin
                    ? "bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed opacity-60"
                    : "bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 cursor-pointer"
                }`}
              >
                {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExportingPdf ? "Membuat PDF..." : "Export PDF"}</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={(!isPayslipPublished && !isAdmin) || isDirectPrinting}
                title={!isPayslipPublished && !isAdmin ? "Slip gaji resmi belum dipublikasikan oleh Admin" : "Cetak Dokumen Slip Gaji"}
                className={`flex items-center space-x-1.5 font-extrabold py-2 px-4 rounded-xl text-xs transition shadow-md ${
                  !isPayslipPublished && !isAdmin
                    ? "bg-slate-850 text-slate-500 cursor-not-allowed border border-slate-750"
                    : "bg-cyan-600 hover:bg-cyan-500 text-slate-950 cursor-pointer shadow-cyan-950/50"
                }`}
              >
                {isDirectPrinting ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Printer className="w-4 h-4" />}
                <span>
                  {!isPayslipPublished && !isAdmin
                    ? "Terkunci (Draft)"
                    : isDirectPrinting
                    ? "Membuka Cetak..."
                    : "Cetak Dokumen"}
                </span>
              </button>
            </div>
          </div>

          {/* STATUS BANNER */}
          <div className={`flex items-center justify-between border p-4 rounded-2xl ${
            isPayslipPublished 
              ? "bg-emerald-950/30 border-emerald-800/60 shadow-lg"
              : "bg-amber-950/30 border-amber-800/50"
          }`}>
            <div className="flex items-center space-x-3">
              {isPayslipPublished ? (
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-inner">
                  <Clock className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white block">
                    {isPayslipPublished 
                      ? "Slip Gaji Resmi — Terverifikasi & Telah Dipublikasikan Admin" 
                      : "Status: DRAFT / Estimasi Sementara (Belum Dipublikasikan)"}
                  </span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-extrabold ${
                    isPayslipPublished
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}>
                    {isPayslipPublished ? "Rilis Resmi" : "Draft / Belum Rilis"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {isPayslipPublished
                    ? `Slip gaji periode ${INDONESIAN_MONTH_NAMES[selectedMonth]} ${selectedYear} sudah difinalisasi oleh Admin dan siap diunduh.`
                    : `Data di bawah masih bersifat perkiraan berjalan. Slip gaji resmi dan tombol cetak PDF akan aktif setelah Admin menekan tombol "Publikasikan ke Akun Staf".`}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-mono">TAKE HOME PAY</span>
              <span className={`text-sm sm:text-base font-extrabold font-mono ${isPayslipPublished ? "text-emerald-400" : "text-amber-400"}`}>
                {formatRupiah(takeHomePay)}
              </span>
            </div>
          </div>

          {/* PRINT-READY PAYSLIP PREVIEW */}
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-300 relative">
            {!isPayslipPublished && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 select-none overflow-hidden opacity-10">
                <span className="text-7xl sm:text-9xl font-black text-slate-900 -rotate-25 uppercase tracking-widest">
                  DRAFT
                </span>
              </div>
            )}
            <div ref={printAreaRef} id="staff-payslip-print" className="bg-white text-slate-950 font-sans leading-normal p-6 sm:p-8 relative">
              {/* HEADER SLIP */}
              <div className="border-b-2 border-slate-950 pb-4 mb-4 flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10">
                    <img src={logo} alt="Mateha" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-950 tracking-tight uppercase">MATEHA PRODUCTION</h3>
                    <p className="text-[9px] text-slate-600 font-mono">SISTEM KEUANGAN & MANAJEMEN EVENT TERPADU</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end space-x-1.5">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-950 block">
                      {isPayslipPublished ? "SLIP GAJI RESMI" : "ESTIMASI SLIP GAJI (DRAFT)"}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-600 font-mono">
                    {INDONESIAN_MONTH_NAMES[selectedMonth].toUpperCase()} {selectedYear}
                  </span>
                </div>
              </div>

              {/* STAFF META */}
              <div className="grid grid-cols-2 gap-4 text-xs mb-4 pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Nama Personil / Anggota:</span>
                  <span className="font-extrabold text-slate-900 uppercase text-sm">
                    {currentUserProfile.username}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Peran Aktif:</span>
                  <span className="font-bold text-slate-800 uppercase text-xs">
                    {currentUserProfile.role || "Staff Lapangan"}
                  </span>
                </div>
              </div>

              {/* EARNINGS & DEDUCTIONS TABLES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-xs">
                {/* Pendapatan */}
                <div>
                  <h4 className="font-bold text-[10px] uppercase tracking-wider text-slate-700 bg-slate-100 p-1.5 border border-slate-300 mb-1">
                    A. Pendapatan (Fee Event & Reimbursement Point B)
                  </h4>
                  {finalEarnings.length === 0 ? (
                    <p className="p-3 text-[10px] text-slate-500 italic text-center border border-dashed border-slate-300">
                      Tidak ada catatan fee pada periode ini.
                    </p>
                  ) : (
                    <table className="w-full text-left border-collapse border border-slate-300 text-[10px]">
                      <tbody>
                        {finalEarnings.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-200">
                            <td className="p-1.5 text-slate-800 font-medium">
                              {item.description}
                              {item.type === "reimbursement" && (
                                <span className="ml-1.5 text-[8px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-mono font-bold">
                                  POINT B
                                </span>
                              )}
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold text-slate-900">{formatRupiah(item.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-bold border-t border-slate-300">
                          <td className="p-1.5 uppercase">Total Pendapatan</td>
                          <td className="p-1.5 text-right font-mono text-cyan-800">{formatRupiah(totalEarnings)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Potongan */}
                <div>
                  <h4 className="font-bold text-[10px] uppercase tracking-wider text-slate-700 bg-slate-100 p-1.5 border border-slate-300 mb-1">
                    B. Potongan (Kasbon & Koreksi)
                  </h4>
                  {finalDeductions.length === 0 ? (
                    <p className="p-3 text-[10px] text-slate-500 italic text-center border border-dashed border-slate-300">
                      Tidak ada potongan pada periode ini.
                    </p>
                  ) : (
                    <table className="w-full text-left border-collapse border border-slate-300 text-[10px]">
                      <tbody>
                        {finalDeductions.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-200">
                            <td className="p-1.5 text-slate-800 font-medium">{item.description}</td>
                            <td className="p-1.5 text-right font-mono font-bold text-rose-700">-{formatRupiah(item.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-bold border-t border-slate-300">
                          <td className="p-1.5 uppercase">Total Potongan</td>
                          <td className="p-1.5 text-right font-mono text-rose-800">-{formatRupiah(totalDeductions)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* TAKE HOME PAY TOTAL */}
              <div className="flex justify-between items-center bg-cyan-50 border-2 border-slate-900 p-3.5 rounded-xl mb-4">
                <span className="font-black text-sm uppercase tracking-wider text-slate-900">TAKE HOME PAY</span>
                <span className="text-xl font-extrabold font-mono text-cyan-800">{formatRupiah(takeHomePay)}</span>
              </div>

              {/* EVENT SUMMARY */}
              <div className="mb-6">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-300 pb-1 mb-1.5">
                  Rincian Penugasan & Keterlibatan Event
                </h4>
                {calculatedItems.attendedEvents.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic text-center py-2 bg-slate-50 border border-slate-200 rounded">
                    Belum ada catatan kehadiran event di sistem untuk bulan ini.
                  </p>
                ) : (
                  <table className="w-full text-left border border-slate-300 text-[10px] border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[9px]">
                        <th className="p-1.5 border border-slate-300">Nama Event</th>
                        <th className="p-1.5 border border-slate-300">Waktu & Lokasi</th>
                        <th className="p-1.5 border border-slate-300 text-center">Durasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculatedItems.attendedEvents.map((evt, idx) => (
                        <tr key={idx} className="border-b border-slate-200">
                          <td className="p-1.5 font-bold uppercase">{evt.name}</td>
                          <td className="p-1.5 text-slate-600">{evt.date} - {evt.location}</td>
                          <td className="p-1.5 text-center font-mono font-bold">{evt.daysCount} Hari</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* SIGNATURE */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 text-[10px]">
                <div className="text-center flex flex-col items-center">
                  <p className="text-slate-500 mb-1">YANG MEMBAYARKAN,</p>
                  {isPayslipPublished ? (
                    <img src={ttd} alt="TTD" className="w-32 h-auto object-contain my-1" />
                  ) : (
                    <div className="h-16 flex items-center justify-center text-[10px] text-amber-700 font-mono italic border border-dashed border-amber-300 bg-amber-50 px-3 my-1 rounded">
                      [Menunggu Pengesahan / Rilis Admin]
                    </div>
                  )}
                  <p className="font-extrabold uppercase text-slate-900">DHIFA AKSA HERMAWAN</p>
                  <p className="text-[8px] text-slate-500">MATEHA PRODUCTION</p>
                </div>
                <div className="text-center flex flex-col items-center justify-between">
                  <p className="text-slate-500">PENERIMA,</p>
                  <div className="mt-12">
                    <p className="font-extrabold uppercase text-slate-900">{currentUserProfile.username}</p>
                    <p className="text-[8px] text-slate-500">STAFF BERSANGKUTAN</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ============ TAB 2: REIMBURSE (DATA DARI POINT B REALISASI) ============= */}
      {/* ========================================================================= */}
      {activeSubTab === "reimburse" && (
        <div className="space-y-6 animate-in fade-in duration-200" id="staff-reimburse-tab">
          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block mb-1">
                Reimburse Periode Ini
              </span>
              <span className="text-xl font-extrabold font-mono text-emerald-400 block">
                {formatRupiah(currentPeriodReimburseTotal)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear}
              </span>
              <div className="absolute right-3 top-3 text-emerald-500/10">
                <Receipt className="w-12 h-12" />
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Total Riwayat Reimburse
              </span>
              <span className="text-xl font-extrabold font-mono text-slate-200 block">
                {formatRupiah(allTimeReimburseTotal)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Seluruh event yang pernah dicatat
              </span>
              <div className="absolute right-3 top-3 text-slate-500/10">
                <Coins className="w-12 h-12" />
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 block mb-1">
                Jumlah Pengeluaran Talangan
              </span>
              <span className="text-xl font-extrabold font-mono text-cyan-400 block">
                {displayedReimbursements.length} <span className="text-xs font-normal text-slate-400">Nota</span>
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Tercatat di Point B Realisasi
              </span>
              <div className="absolute right-3 top-3 text-cyan-500/10">
                <FileSpreadsheet className="w-12 h-12" />
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block mb-1">
                  Integrasi Slip Gaji
                </span>
                <span className="text-xs font-bold text-white block">
                  Otomatis Masuk Payroll
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block leading-tight">
                  Setiap item Point B otomatis diakumulasikan ke pendapatan slip gaji.
                </span>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => setIsAddReimburseOpen(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold py-1.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition cursor-pointer shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Ajukan Reimburse Baru</span>
                </button>
              </div>
            </div>
          </div>

          {/* FILTER & SEARCH TOOLBAR */}
          <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Scope filter */}
              <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setReimburseFilterScope("current")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    reimburseFilterScope === "current"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Periode {INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear}
                </button>
                <button
                  onClick={() => setReimburseFilterScope("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    reimburseFilterScope === "all"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Semua Periode ({allReimbursementRecords.length})
                </button>
              </div>

              {/* Month/Year selector if current scope */}
              {reimburseFilterScope === "current" && (
                <div className="flex items-center space-x-2">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-1.5 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer"
                  >
                    {INDONESIAN_MONTH_NAMES.map((m, idx) => (
                      <option key={idx} value={idx}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-1.5 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer"
                  >
                    {yearsList.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Search and Add Button */}
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari event atau uraian nota..."
                  value={reimburseSearchQuery}
                  onChange={(e) => setReimburseSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl py-1.5 pl-8 pr-3 text-xs text-slate-200 focus:outline-none"
                />
                {reimburseSearchQuery && (
                  <button
                    onClick={() => setReimburseSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setIsAddReimburseOpen(true)}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold py-2 px-3.5 rounded-xl text-xs transition cursor-pointer shrink-0 shadow-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Catat Reimburse</span>
              </button>
            </div>
          </div>

          {/* TABLE OF REIMBURSEMENTS (POINT B REALISASI) */}
          <div className="bg-[#0c0e12]/80 border border-slate-900 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-900 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-extrabold text-white flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  <span>Daftar Talangan & Pengeluaran (Point B Realisasi)</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Menampilkan data pengeluaran operasional di Point B Realisasi project yang mencantumkan nama Anda ({currentUserProfile.username}).
                </p>
              </div>

              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-800">
                {displayedReimbursements.length} Item
              </span>
            </div>

            {displayedReimbursements.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-900 flex items-center justify-center text-slate-600">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-400 text-sm">Belum ada data reimburse pada filter ini.</p>
                  <p className="text-[11px] text-slate-600 mt-1 max-w-md">
                    Pengeluaran di Point B Realisasi event yang Anda talangi akan otomatis muncul di sini saat dicatat dengan nama Anda di kolom PIC.
                  </p>
                </div>
                <div className="pt-2 flex items-center space-x-2">
                  <button
                    onClick={() => setReimburseFilterScope("all")}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Lihat Semua Periode
                  </button>
                  <button
                    onClick={() => setIsAddReimburseOpen(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-extrabold transition cursor-pointer"
                  >
                    + Catat Pengeluaran Baru
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-950/70 border-b border-slate-900 text-[10px] font-mono uppercase text-slate-400">
                      <th className="py-3 px-3 w-10 text-center">No</th>
                      <th className="py-3 px-3">Event & Waktu</th>
                      <th className="py-3 px-3">Uraian Kebutuhan (Point B)</th>
                      <th className="py-3 px-3 text-center">Qty</th>
                      <th className="py-3 px-3 text-right">Biaya Satuan</th>
                      <th className="py-3 px-3 text-right">Total Klaim</th>
                      <th className="py-3 px-3 text-center">Bukti Nota</th>
                      <th className="py-3 px-3">PIC Talangan</th>
                      <th className="py-3 px-3 text-center">Status Payroll</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60">
                    {displayedReimbursements.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-950/40 transition">
                        <td className="py-3 px-3 text-center font-mono text-slate-500 text-[10px]">
                          {idx + 1}
                        </td>

                        {/* Event & Date */}
                        <td className="py-3 px-3">
                          <span className="font-bold text-white block">
                            {item.projectName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {item.projectDate} {item.projectLocation !== "-" ? `• ${item.projectLocation}` : ""}
                          </span>
                        </td>

                        {/* Description */}
                        <td className="py-3 px-3 font-medium text-slate-200">
                          {item.description}
                        </td>

                        {/* Qty */}
                        <td className="py-3 px-3 text-center font-mono text-slate-300">
                          {item.qty}
                        </td>

                        {/* Expense */}
                        <td className="py-3 px-3 text-right font-mono text-slate-400 text-[11px]">
                          {formatRupiah(item.expense)}
                        </td>

                        {/* Total Reimbursement */}
                        <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-400 text-xs">
                          {formatRupiah(item.total)}
                        </td>

                        {/* Receipt image */}
                        <td className="py-3 px-3 text-center">
                          {item.receiptImage ? (
                            <button
                              onClick={() => setViewingReceiptModal({
                                image: item.receiptImage!,
                                title: `Nota: ${item.description}`,
                                description: item.description,
                                amount: item.total,
                                eventName: item.projectName
                              })}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold transition cursor-pointer group"
                              title="Klik untuk melihat bukti foto struk/nota"
                            >
                              <Eye className="w-3 h-3 group-hover:scale-110 transition" />
                              <span>Lihat Nota</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleTriggerUploadReceipt(item.projectId, item.itemId, item.itemIndex)}
                              disabled={uploadingReceiptItemId === item.itemId}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 text-[10px] font-medium transition cursor-pointer disabled:opacity-50"
                              title="Unggah foto nota pengeluaran ini"
                            >
                              {uploadingReceiptItemId === item.itemId ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                                  <span>Mengunggah...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3 h-3" />
                                  <span>+ Unggah Nota</span>
                                </>
                              )}
                            </button>
                          )}
                        </td>

                        {/* PIC Notes */}
                        <td className="py-3 px-3">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 uppercase font-bold">
                            {item.notes || currentUserProfile.username}
                          </span>
                        </td>

                        {/* Status Payroll */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Masuk Slip Gaji</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-950/90 border-t border-slate-800 font-bold text-xs">
                      <td colSpan={5} className="py-3 px-3 uppercase text-slate-400 font-mono text-[10px]">
                        Total Klaim Reimburse ({displayedReimbursements.length} Item)
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-400 font-extrabold text-sm">
                        {formatRupiah(displayedReimbursements.reduce((acc, curr) => acc + curr.total, 0))}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ========================== TAB 3: KASBON ================================ */}
      {/* ========================================================================= */}
      {activeSubTab === "kasbon" && (
        <div className="space-y-6 animate-in fade-in duration-200" id="staff-kasbon-tab">
          {/* PERIODE ACUAN BAR & SINKRONISASI HONOR FEE */}
          <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2 mr-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-extrabold text-white">Periode Acuan Kasbon:</span>
              </div>
              <div>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500/50 cursor-pointer"
                >
                  {INDONESIAN_MONTH_NAMES.map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500/50 cursor-pointer"
                >
                  {yearsList.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {feeOnlyEarnings > 0 ? (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Honor Fee & Lapangan: {formatRupiah(feeOnlyEarnings)}</span>
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono font-bold flex items-center space-x-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Belum Ada Honor Fee ({INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear})</span>
                </div>
              )}
            </div>
          </div>

          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Honor Fee & Lapangan ({INDONESIAN_MONTH_NAMES[selectedMonth].substring(0, 3)} {selectedYear})
              </span>
              <span className="text-xl font-extrabold font-mono text-cyan-400 block">
                {formatRupiah(feeOnlyEarnings)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Plafon maksimal kasbon dari Roster, Driver & PIC
              </span>
              <div className="absolute right-3 top-3 text-cyan-500/10">
                <Coins className="w-12 h-12" />
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block mb-1">
                Kasbon Berjalan (Periode Ini)
              </span>
              <span className="text-xl font-extrabold font-mono text-amber-400 block">
                {formatRupiah(currentPeriodActiveKasbon)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Sudah diajukan / memotong slip periode ini
              </span>
              <div className="absolute right-3 top-3 text-amber-500/10">
                <Wallet className="w-12 h-12" />
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Sisa Plafon Kasbon Tersedia
              </span>
              <span className={`text-xl font-extrabold font-mono block ${maxAllowedKasbon > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {formatRupiah(maxAllowedKasbon)}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {maxAllowedKasbon > 0
                  ? "Batas maksimal yang dapat diajukan"
                  : feeOnlyEarnings > 0
                  ? "Plafon periode ini habis terpakai"
                  : "Belum memiliki honor fee"}
              </span>
              <div className="absolute right-3 top-3 text-emerald-500/10">
                {maxAllowedKasbon > 0 ? <ShieldCheck className="w-12 h-12" /> : <ShieldAlert className="w-12 h-12" />}
              </div>
            </div>

            <div className="bg-[#0c0e12]/80 border border-slate-900 p-4 rounded-2xl shadow-lg relative overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Total Riwayat Kasbon
              </span>
              <span className="text-xl font-extrabold font-mono text-slate-200 block">
                {myKasbonRequests.length} <span className="text-xs font-normal text-slate-400">Pengajuan</span>
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {myKasbonRequests.filter((k) => k.status === "pending").length} menunggu persetujuan
              </span>
              <div className="absolute right-3 top-3 text-slate-500/10">
                <FileText className="w-12 h-12" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT: FORM PENGAJUAN KASBON */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[#0c0e12]/80 border border-slate-900 p-6 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center space-x-2 pb-3 border-b border-slate-900">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Form Pengajuan Kasbon</h3>
                    <p className="text-[10px] text-slate-400">
                      {kasbonPlafondType === "unlimited"
                        ? "Mode Plafond Bebas (Disetujui Langsung oleh Admin)"
                        : kasbonPlafondType === "fixed"
                        ? `Batas Limit Tetap Bulanan: ${formatRupiah(kasbonFixedLimit)}`
                        : kasbonPlafondType === "auto"
                        ? "Maksimal 100% dari Honor Fee & Lapangan"
                        : `Maksimal ${kasbonPercentLimit}% dari Total THP (${formatRupiah(totalGrossTHP)})`}
                    </p>
                  </div>
                </div>

                {/* Plafon Status Banner */}
                {kasbonPlafondType === "unlimited" ? (
                  <div className="bg-purple-950/20 border border-purple-500/30 p-3.5 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-purple-300 font-bold">
                        <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                        <span>Mode Plafond: Bebas / Unlimited</span>
                      </div>
                      <span className="text-[9px] font-mono bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 font-bold uppercase">
                        Akses Khusus
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 leading-relaxed">
                      Anda memiliki akses pengajuan kasbon fleksibel. Pengajuan akan dievaluasi dan disetujui langsung oleh Admin saat proses approval.
                    </p>
                  </div>
                ) : kasbonPlafondType === "fixed" ? (
                  kasbonFixedLimit <= 0 ? (
                    <div className="bg-rose-950/20 border border-rose-500/30 p-3.5 rounded-xl space-y-1.5 text-xs">
                      <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Limit Plafond Tetap Belum Diatur (Rp 0)</span>
                      </div>
                      <p className="text-[10.5px] text-slate-300 leading-relaxed">
                        Akun Anda diatur ke mode Limit Tetap oleh Admin, namun nominal batas limit saat ini masih <strong>Rp 0</strong>. Hubungi Admin untuk mengatur limit kasbon Anda.
                      </p>
                    </div>
                  ) : maxAllowedKasbon <= 0 ? (
                    <div className="bg-amber-950/20 border border-amber-500/30 p-3.5 rounded-xl space-y-1.5 text-xs">
                      <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Limit Kasbon Periode Ini Telah Habis</span>
                      </div>
                      <p className="text-[10.5px] text-slate-300 leading-relaxed">
                        Total kasbon aktif Anda ({formatRupiah(currentPeriodActiveKasbon)}) telah mencapai batas limit tetap bulanan ({formatRupiah(kasbonFixedLimit)}).
                      </p>
                    </div>
                  ) : (
                    <div className="bg-indigo-950/25 border border-indigo-500/30 p-3 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center space-x-1.5 text-[10px] text-indigo-300 uppercase font-mono mb-0.5">
                          <Wallet className="w-3 h-3 text-indigo-400" />
                          <span>Sisa Plafon Kasbon Tetap:</span>
                        </div>
                        <span className="text-sm font-mono font-extrabold text-indigo-300">{formatRupiah(maxAllowedKasbon)}</span>
                        <span className="text-[9.5px] text-slate-400 block mt-0.5">
                          Limit bulanan: {formatRupiah(kasbonFixedLimit)} (Terpakai: {formatRupiah(currentPeriodActiveKasbon)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setKasbonAmount(maxAllowedKasbon.toString())}
                        className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-bold transition cursor-pointer"
                      >
                        Gunakan Maksimal
                      </button>
                    </div>
                  )
                ) : kasbonPlafondType === "auto" ? (
                  feeOnlyEarnings <= 0 ? (
                    <div className="bg-rose-950/20 border border-rose-500/30 p-3.5 rounded-xl space-y-1.5 text-xs">
                      <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Plafon Kasbon Belum Tersedia</span>
                      </div>
                      <p className="text-[10.5px] text-slate-300 leading-relaxed">
                        Staf hanya dapat mengajukan kasbon jika telah memiliki catatan <strong>Honor Fee & Lapangan</strong> pada event periode berjalan (<strong>{INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear}</strong>).
                      </p>
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-rose-900/40">
                        Honor Fee & Lapangan Anda saat ini: <strong className="text-rose-400 font-mono">{formatRupiah(0)}</strong>
                      </div>
                    </div>
                  ) : maxAllowedKasbon <= 0 ? (
                    <div className="bg-amber-950/20 border border-amber-500/30 p-3.5 rounded-xl space-y-1.5 text-xs">
                      <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Plafon Kasbon Periode Ini Telah Habis</span>
                      </div>
                      <p className="text-[10.5px] text-slate-300 leading-relaxed">
                        Total kasbon aktif Anda ({formatRupiah(currentPeriodActiveKasbon)}) telah mencapai batas maksimal total Honor Fee & Lapangan ({formatRupiah(feeOnlyEarnings)}) untuk periode {INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear}.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-emerald-950/20 border border-emerald-500/25 p-3 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">Sisa Plafon Kasbon Tersedia:</span>
                        <span className="text-sm font-mono font-extrabold text-emerald-400">{formatRupiah(maxAllowedKasbon)}</span>
                        <span className="text-[9.5px] text-slate-400 block mt-0.5">
                          Basis Honor Event: {formatRupiah(feeOnlyEarnings)} (Terpakai: {formatRupiah(currentPeriodActiveKasbon)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setKasbonAmount(maxAllowedKasbon.toString())}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold transition cursor-pointer"
                      >
                        Gunakan Maksimal
                      </button>
                    </div>
                  )
                ) : totalGrossTHP <= 0 ? (
                  <div className="bg-rose-950/20 border border-rose-500/30 p-3.5 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Plafon Kasbon Belum Tersedia</span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 leading-relaxed">
                      Staf dapat mengajukan kasbon hingga <strong>{kasbonPercentLimit}% dari Total THP</strong> (Gaji/Honor + Reimbursement) setelah memiliki catatan pendapatan pada periode berjalan (<strong>{INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear}</strong>).
                    </p>
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-rose-900/40">
                      Total Pendapatan (THP Bruto) saat ini: <strong className="text-rose-400 font-mono">{formatRupiah(0)}</strong>
                    </div>
                  </div>
                ) : maxAllowedKasbon <= 0 ? (
                  <div className="bg-amber-950/20 border border-amber-500/30 p-3.5 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Plafon Kasbon Periode Ini Telah Habis</span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 leading-relaxed">
                      Total kasbon aktif Anda ({formatRupiah(currentPeriodActiveKasbon)}) telah mencapai batas maksimal <strong>{kasbonPercentLimit}% THP</strong> ({formatRupiah(Math.floor(totalGrossTHP * (kasbonPercentLimit / 100)))}) untuk periode {INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear}.
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-950/20 border border-amber-500/30 p-3 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center space-x-1.5 text-[10px] text-amber-300 uppercase font-mono mb-0.5">
                        <Wallet className="w-3 h-3 text-amber-400" />
                        <span>Sisa Plafon Kasbon ({kasbonPercentLimit}% THP):</span>
                      </div>
                      <span className="text-sm font-mono font-extrabold text-amber-300">{formatRupiah(maxAllowedKasbon)}</span>
                      <span className="text-[9.5px] text-slate-400 block mt-0.5">
                        Total THP Bruto: {formatRupiah(totalGrossTHP)} &bull; Kuota {kasbonPercentLimit}%: {formatRupiah(Math.floor(totalGrossTHP * (kasbonPercentLimit / 100)))} &bull; Terpakai: {formatRupiah(currentPeriodActiveKasbon)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setKasbonAmount(maxAllowedKasbon.toString())}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      Gunakan Maksimal
                    </button>
                  </div>
                )}

                <form onSubmit={handleSubmitKasbon} className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-slate-400 font-semibold text-xs uppercase tracking-wider text-[10px]">
                        Nominal Kasbon (Rp)
                      </label>
                      {kasbonPlafondType !== "unlimited" && maxAllowedKasbon > 0 && (
                        <span className="text-[10px] font-mono text-slate-400">
                          Maks: <strong className="text-amber-400">{formatRupiah(maxAllowedKasbon)}</strong>
                        </span>
                      )}
                      {kasbonPlafondType === "unlimited" && (
                        <span className="text-[10px] font-mono text-purple-300 font-bold">
                          Mode Unlimited
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 text-xs font-mono">
                        Rp
                      </span>
                      <input
                        type="number"
                        placeholder={
                          kasbonPlafondType === "unlimited"
                            ? "Contoh: 1000000"
                            : maxAllowedKasbon > 0
                            ? `Contoh: ${Math.min(500000, maxAllowedKasbon)}`
                            : "Plafon belum tersedia"
                        }
                        min="0"
                        max={kasbonPlafondType === "unlimited" ? undefined : (maxAllowedKasbon > 0 ? maxAllowedKasbon : undefined)}
                        step="any"
                        disabled={kasbonPlafondType === "unlimited" ? false : maxAllowedKasbon <= 0}
                        value={kasbonAmount}
                        onChange={(e) => setKasbonAmount(e.target.value)}
                        className={`w-full bg-[#080a0f] border rounded-xl py-2 pl-9 pr-3 text-xs text-slate-200 focus:outline-none font-mono disabled:opacity-50 disabled:cursor-not-allowed ${
                          kasbonPlafondType !== "unlimited" && Number(kasbonAmount) > maxAllowedKasbon
                            ? "border-rose-500 focus:border-rose-400 text-rose-300"
                            : "border-slate-800 focus:border-amber-500"
                        }`}
                        required
                      />
                    </div>

                    {/* Real-time validation feedback */}
                    {kasbonAmount && kasbonPlafondType !== "unlimited" && Number(kasbonAmount) > maxAllowedKasbon && (
                      <div className="mt-1.5 flex items-center space-x-1.5 text-[10px] text-rose-400 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Nominal melebihi {kasbonPlafondType === "fixed" ? "limit tetap bulanan" : "sisa Honor Fee & Lapangan"} ({formatRupiah(maxAllowedKasbon)})!
                        </span>
                      </div>
                    )}
                    {kasbonAmount && Number(kasbonAmount) > 0 && (kasbonPlafondType === "unlimited" || Number(kasbonAmount) <= maxAllowedKasbon) && (
                      <div className="mt-1.5 space-y-0.5">
                        <span className="text-[10px] text-amber-400 font-mono block">
                          Terbilang: {formatRupiah(Number(kasbonAmount))}
                        </span>
                        {kasbonPlafondType !== "unlimited" ? (
                          <span className="text-[10px] text-emerald-400/90 font-mono block">
                            ✓ Sisa plafon setelah kasbon: {formatRupiah(maxAllowedKasbon - Number(kasbonAmount))}
                          </span>
                        ) : (
                          <span className="text-[10px] text-purple-300 font-mono block">
                            ✓ Pengajuan kasbon fleksibel (akan dievaluasi saat approval)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wider text-[10px]">
                      Keperluan Kasbon
                    </label>
                    <textarea
                      rows={2}
                      disabled={kasbonPlafondType === "unlimited" ? false : maxAllowedKasbon <= 0}
                      placeholder="Contoh: Kebutuhan operasional bensin event luar kota / kebutuhan mendesak..."
                      value={kasbonReason}
                      onChange={(e) => setKasbonReason(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs text-slate-200 focus:outline-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                    />
                  </div>

                  {/* REKENING BANK / E-WALLET TUJUAN PENCAIRAN */}
                  <div className="bg-[#080a0f] border border-slate-800/80 p-3.5 rounded-xl space-y-3">
                    <div className="flex items-center space-x-2 text-slate-300 font-bold text-xs pb-2 border-b border-slate-850">
                      <CreditCard className="w-4 h-4 text-amber-400" />
                      <span>Rekening Bank / E-Wallet Pencairan</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
                          Bank / E-Wallet
                        </label>
                        <select
                          value={kasbonBankName}
                          onChange={(e) => setKasbonBankName(e.target.value)}
                          disabled={kasbonPlafondType === "unlimited" ? false : maxAllowedKasbon <= 0}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg py-1.5 px-2.5 text-xs text-slate-200 focus:outline-none disabled:opacity-50"
                          required
                        >
                          {PAYMENT_ACCOUNT_OPTIONS.map((opt) => (
                            <option key={opt} value={opt} className="bg-slate-900 text-slate-200">
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {kasbonBankName === "Lainnya / Bank Lain" && (
                        <div>
                          <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
                            Nama Bank / E-Wallet Lainnya
                          </label>
                          <input
                            type="text"
                            placeholder="Misal: Bank Jatim, Blu by BCA..."
                            value={kasbonCustomBank}
                            onChange={(e) => setKasbonCustomBank(e.target.value)}
                            disabled={kasbonPlafondType === "unlimited" ? false : maxAllowedKasbon <= 0}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg py-1.5 px-2.5 text-xs text-slate-200 focus:outline-none disabled:opacity-50"
                            required
                          />
                        </div>
                      )}

                      <div className={kasbonBankName === "Lainnya / Bank Lain" ? "sm:col-span-2" : ""}>
                        <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
                          Nomor Rekening / No. HP E-Wallet
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: 1234567890 / 08123456789"
                          value={kasbonAccountNumber}
                          onChange={(e) => setKasbonAccountNumber(e.target.value)}
                          disabled={maxAllowedKasbon <= 0}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg py-1.5 px-2.5 text-xs text-slate-200 font-mono focus:outline-none disabled:opacity-50"
                          required
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
                          Nama Pemilik Rekening (Atas Nama)
                        </label>
                        <input
                          type="text"
                          placeholder="Nama lengkap sesuai buku tabungan / akun e-wallet"
                          value={kasbonAccountHolder}
                          onChange={(e) => setKasbonAccountHolder(e.target.value)}
                          disabled={maxAllowedKasbon <= 0}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg py-1.5 px-2.5 text-xs text-slate-200 focus:outline-none disabled:opacity-50"
                          required
                        />
                      </div>
                    </div>

                    <label className="flex items-center space-x-2 text-[10.5px] text-slate-400 hover:text-slate-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={saveBankToProfile}
                        onChange={(e) => setSaveBankToProfile(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span>Simpan informasi rekening ini ke profil saya untuk pengajuan berikutnya</span>
                    </label>
                  </div>

                  <div className="bg-amber-950/20 border border-amber-500/15 p-3 rounded-xl flex items-start space-x-2 text-[10px] text-amber-300/80 leading-relaxed">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Ketentuan:</strong> Pengajuan kasbon staf dibatasi maksimal sebesar total <strong>Honor Fee & Lapangan</strong> pada event periode berjalan. Setelah disetujui Admin, kasbon akan memotong slip gaji Anda.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      submittingKasbon ||
                      maxAllowedKasbon <= 0 ||
                      !kasbonAmount ||
                      Number(kasbonAmount) <= 0 ||
                      Number(kasbonAmount) > maxAllowedKasbon ||
                      !kasbonReason.trim() ||
                      !kasbonAccountNumber.trim() ||
                      !kasbonAccountHolder.trim()
                    }
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                  >
                    {submittingKasbon ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Mengirim Pengajuan...</span>
                      </>
                    ) : maxAllowedKasbon <= 0 ? (
                      <span>Plafon Kasbon Tidak Tersedia</span>
                    ) : Number(kasbonAmount) > maxAllowedKasbon ? (
                      <span>Melebihi Honor Fee & Lapangan</span>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Kirim Pengajuan Kasbon</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* RIGHT: RIWAYAT PENGAJUAN KASBON & APPROVAL ADMIN */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-[#0c0e12]/80 border border-slate-900 p-6 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-900">
                  <div>
                    <h3 className="text-sm font-extrabold text-white">
                      {isAdmin ? "Pusat Persetujuan Kasbon Staff (Admin)" : "Riwayat Pengajuan Kasbon Anda"}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {isAdmin ? "Pantau pengajuan kasbon dari seluruh staff, setujui atau tolak permintaan." : "Daftar permohonan kasbon dan status verifikasi dari Admin"}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                    {myKasbonRequests.length} Pengajuan
                  </span>
                </div>

                {loadingKasbon ? (
                  <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-400 mb-2" />
                    <span>Memuat daftar kasbon...</span>
                  </div>
                ) : myKasbonRequests.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-900">
                    Belum ada riwayat pengajuan kasbon.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
                    {myKasbonRequests.map((k) => (
                      <div
                        key={k.id}
                        className="bg-slate-950/70 border border-slate-900 hover:border-slate-850 p-4 rounded-xl transition space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-white uppercase font-sans">
                                {k.staffUsername}
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono">
                                • {new Date(k.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <span className="text-sm font-mono font-extrabold text-amber-400 block mt-0.5">
                              {formatRupiah(k.amount)}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {k.periodMonth !== undefined && k.periodYear !== undefined && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                                  Periode: {INDONESIAN_MONTH_NAMES[k.periodMonth]} {k.periodYear}
                                </span>
                              )}
                              {k.honorFeeBaseline !== undefined && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40 text-cyan-300">
                                  Honor Acuan: {formatRupiah(k.honorFeeBaseline)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Status badge */}
                          <div>
                            {k.status === "pending" ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock className="w-3 h-3" />
                                <span>Menunggu</span>
                              </span>
                            ) : k.status === "approved" ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Disetujui</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <XCircle className="w-3 h-3" />
                                <span>Ditolak</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-slate-300 bg-[#080a0f] p-2.5 rounded-lg border border-slate-900/60 text-left">
                          <span className="text-[9px] text-slate-500 font-mono block uppercase">Keperluan:</span>
                          <p className="mt-0.5 leading-relaxed">{k.reason}</p>
                        </div>

                        {/* REKENING PENCAIRAN / E-WALLET */}
                        {k.bankName && (
                          <div className="bg-[#0b0f17] border border-cyan-950/70 p-2.5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-1.5 text-cyan-400 font-semibold text-[11px]">
                                <Building2 className="w-3.5 h-3.5" />
                                <span>{k.bankName}</span>
                                {k.accountHolderName && (
                                  <span className="text-slate-400 text-[10px] font-normal">
                                    • a.n <strong className="text-slate-200">{k.accountHolderName}</strong>
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-xs text-slate-200 font-bold">
                                {k.accountNumber || "-"}
                              </div>
                            </div>

                            {k.accountNumber && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (navigator.clipboard) {
                                    navigator.clipboard.writeText(k.accountNumber || "");
                                    setCopiedKasbonId(k.id);
                                    onNotify(`Nomor rekening ${k.accountNumber} disalin!`, "info");
                                    setTimeout(() => setCopiedKasbonId(null), 2500);
                                  }
                                }}
                                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer self-start sm:self-center shrink-0 ${
                                  copiedKasbonId === k.id
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-750"
                                }`}
                                title="Salin Nomor Rekening / E-Wallet"
                              >
                                {copiedKasbonId === k.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span>Tersalin!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>Salin No. Rek</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Admin action buttons */}
                        {isAdmin && k.status === "pending" && (
                          <div className="pt-2 flex justify-end items-center space-x-2 border-t border-slate-900">
                            <button
                              onClick={() => handleUpdateKasbonStatus(k.id, "rejected")}
                              className="px-3 py-1 bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 border border-rose-800/40 rounded-lg text-xs font-bold transition cursor-pointer"
                            >
                              Tolak
                            </button>
                            <button
                              onClick={() => handleUpdateKasbonStatus(k.id, "approved")}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-extrabold transition cursor-pointer shadow"
                            >
                              Setujui Kasbon
                            </button>
                          </div>
                        )}

                        {k.status !== "pending" && k.approvedBy && (
                          <div className="text-[9px] text-slate-500 font-mono text-right pt-1">
                            Diproses oleh: <strong>{k.approvedBy}</strong> ({new Date(k.approvedAt || "").toLocaleDateString("id-ID")})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: TAMBAH REIMBURSE BARU KE POINT B REALISASI */}
      {/* ========================================================================= */}
      {isAddReimburseOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0c0e12] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="flex justify-between items-center pb-3 border-b border-slate-850">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Catat Reimburse (Point B Realisasi)</h3>
                  <p className="text-[10px] text-slate-400">Pengeluaran akan langsung tercatat di Point B event dan slip gaji Anda</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddReimburseOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNewReimburse} className="space-y-4">
              {/* Event selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-slate-400 font-semibold text-xs uppercase tracking-wider text-[10px]">
                    Pilih Event Terkait *
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {openReimburseProjects.length} Event Dibuka
                  </span>
                </div>

                {openReimburseProjects.length === 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-300 text-xs flex items-start space-x-2.5">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                    <div>
                      <p className="font-bold text-amber-200">Tidak ada event yang membuka pengajuan reimburse</p>
                      <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                        Akses Point B / Reimburse untuk seluruh event sedang ditutup oleh Admin pada lembar kerja (Point B Realisasi). Event akan otomatis muncul di sini apabila aksesnya dibuka kembali oleh Admin.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      value={newReimburseProjectId}
                      onChange={(e) => setNewReimburseProjectId(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-emerald-500 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
                      required
                    >
                      <option value="">-- Pilih Event ({openReimburseProjects.length} Event Aktif) --</option>
                      {openReimburseProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.date})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      💡 Hanya event dengan akses Point B aktif dari Admin yang dapat dipilih untuk klaim reimburse.
                    </p>
                  </>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wider text-[10px]">
                  Uraian Kebutuhan / Pengeluaran *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Bensin Avanza Kru, Tol Cikampek, Konsumsi Crew, dll."
                  value={newReimburseDesc}
                  onChange={(e) => setNewReimburseDesc(e.target.value)}
                  className="w-full bg-[#080a0f] border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
                  required
                />
              </div>

              {/* Qty & Unit Expense */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wider text-[10px]">
                    Jumlah (Qty) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newReimburseQty}
                    onChange={(e) => setNewReimburseQty(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-[#080a0f] border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wider text-[10px]">
                    Biaya Satuan (Rp) *
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    placeholder="e.g. 150000"
                    value={newReimburseExpense}
                    onChange={(e) => setNewReimburseExpense(e.target.value)}
                    className="w-full bg-[#080a0f] border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none font-mono"
                    required
                  />
                </div>
              </div>

              {/* Total preview */}
              {Number(newReimburseExpense) > 0 && (
                <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex justify-between items-center text-xs">
                  <span className="text-slate-400 text-[11px]">Total Klaim:</span>
                  <span className="font-extrabold font-mono text-emerald-400">
                    {formatRupiah(newReimburseQty * Number(newReimburseExpense))}
                  </span>
                </div>
              )}

              {/* Receipt photo upload */}
              <div>
                <label className="block text-slate-400 font-semibold text-xs mb-1.5 uppercase tracking-wider text-[10px]">
                  Foto Struk / Nota (Opsional)
                </label>
                {newReimburseReceiptImage ? (
                  <div className="relative rounded-xl border border-slate-800 overflow-hidden bg-slate-950 p-2 flex items-center space-x-3">
                    <img
                      src={newReimburseReceiptImage}
                      alt="Nota"
                      className="w-16 h-16 object-cover rounded-lg border border-slate-800"
                    />
                    <div className="flex-1 text-xs">
                      <span className="text-emerald-400 font-bold block">Foto Nota Terlampir</span>
                      <span className="text-[10px] text-slate-500">Siap disimpan bersama pengeluaran</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewReimburseReceiptImage(null)}
                      className="p-1.5 bg-rose-950/50 hover:bg-rose-900/50 text-rose-400 rounded-lg text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border border-dashed border-slate-800 hover:border-emerald-500/50 rounded-xl p-4 cursor-pointer bg-[#080a0f] transition">
                    <ImageIcon className="w-6 h-6 text-slate-500 mb-1" />
                    <span className="text-xs text-slate-400 font-medium">Klik untuk unggah foto nota</span>
                    <span className="text-[10px] text-slate-600 mt-0.5">JPG, PNG, atau WebP (Maks 4MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const reader = new FileReader();
                          reader.onload = () => setNewReimburseReceiptImage(reader.result as string);
                          reader.readAsDataURL(f);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* PIC note info */}
              <div className="text-[10px] text-slate-500 font-mono">
                * Item akan dicatat dengan PIC: <strong className="text-emerald-400 uppercase">{currentUserProfile.username}</strong>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setIsAddReimburseOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingNewReimburse || openReimburseProjects.length === 0}
                  title={openReimburseProjects.length === 0 ? "Tidak ada event terbuka untuk pengajuan reimburse" : undefined}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl text-xs font-extrabold transition flex items-center space-x-1.5 shadow"
                >
                  {submittingNewReimburse ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan ke Point B Realisasi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: FULLSCREEN PREVIEW BUKTI STRUK / NOTA */}
      {/* ========================================================================= */}
      {viewingReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0c0e12] border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-900 flex justify-between items-center">
              <div>
                <h4 className="text-xs font-bold text-white uppercase font-sans">
                  {viewingReceiptModal.title}
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">
                  {viewingReceiptModal.eventName} • {formatRupiah(viewingReceiptModal.amount)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={viewingReceiptModal.image}
                  download={`nota-${viewingReceiptModal.description.replace(/\s+/g, "_")}.png`}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs flex items-center space-x-1 border border-slate-800 transition"
                  title="Unduh foto nota"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Unduh</span>
                </a>
                <button
                  onClick={() => setViewingReceiptModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 flex items-center justify-center bg-black/50 max-h-[75vh] overflow-auto">
              <img
                src={viewingReceiptModal.image}
                alt="Nota Struk"
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-lg border border-slate-850"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
