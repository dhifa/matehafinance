import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, doc, setDoc, getDoc, query, updateDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import { EventProject, UserProfile, formatRupiah, PublishedPayslip, KasbonRequest } from "../types";
import { calculateProjectBudget } from "../utils/math";
import html2canvas from 'html2canvas';
import { jsPDF } from "jspdf";
import { 
  FileText, 
  Download, 
  Printer, 
  Check, 
  Plus, 
  Trash2, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  UserCircle2, 
  Calendar, 
  PlusCircle, 
  MinusCircle,
  UploadCloud, 
  TrendingUp, 
  Briefcase,
  Wallet,
  CreditCard,
  Building2,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  FileSpreadsheet,
  Share2,
  ExternalLink,
  Eye,
  Send,
  X,
  RefreshCw,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Award
} from "lucide-react";
import logo from "/favicon.png";
import ttd from "../../assets/ttd.png";
import { formatMultiDates, parseIndonesianDateText } from "../utils/date";
import { saveAs } from "file-saver";
import { generateStaffPayslipPdfBlob, printStaffPayslipDirectly, StaffPayslipPdfData } from "../utils/pdfGenerator";

interface PayslipViewProps {
  projects: EventProject[];
  currentUserProfile: UserProfile | null;
  onNotify: (text: string, type?: "success" | "info" | "error") => void;
}

interface CustomItem {
  id: string;
  description: string;
  amount: number;
}

const INDONESIAN_MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export default function PayslipView({ projects, currentUserProfile, onNotify }: PayslipViewProps) {
  // Navigation tabs: "rekap" (Tabel Rekap Semua Staff) vs "kasbon" (Pusat Persetujuan Kasbon)
  const [activeTab, setActiveTab] = useState<"rekap" | "kasbon">("rekap");

  const [dbUsers, setDbUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Month and Year selector states
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());

  // Search & filter states in table
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterPublishStatus, setFilterPublishStatus] = useState<"all" | "published" | "draft">("all");
  const [filterRole, setFilterRole] = useState<string>("all");

  // Keep track of published payslips loaded from DB
  const [publishedPayslips, setPublishedPayslips] = useState<Record<string, PublishedPayslip>>({});
  const [publishedLoading, setPublishedLoading] = useState(true);

  // Detail & Quick Edit Modal State for a specific staff
  const [modalStaff, setModalStaff] = useState<UserProfile | null>(null);
  const [modalManualEarnings, setModalManualEarnings] = useState<CustomItem[]>([]);
  const [modalManualDeductions, setModalManualDeductions] = useState<CustomItem[]>([]);
  const [modalExtraInDesc, setModalExtraInDesc] = useState("");
  const [modalExtraInAmount, setModalExtraInAmount] = useState("");
  const [modalExtraOutDesc, setModalExtraOutDesc] = useState("");
  const [modalExtraOutAmount, setModalExtraOutAmount] = useState("");
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [adminExportingStaffPdf, setAdminExportingStaffPdf] = useState(false);
  const [adminPrintingStaff, setAdminPrintingStaff] = useState(false);

  // Kasbon requests subscription & state
  const [kasbonList, setKasbonList] = useState<KasbonRequest[]>([]);
  const [loadingKasbon, setLoadingKasbon] = useState(true);
  const [kasbonStatusFilter, setKasbonStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [kasbonSearchQuery, setKasbonSearchQuery] = useState<string>("");
  const [copiedKasbonId, setCopiedKasbonId] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);
  const isAdmin = !!currentUserProfile;

  // 1. Fetch db users list
  useEffect(() => {
    setUsersLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((doc) => {
          list.push(doc.data() as UserProfile);
        });
        setDbUsers(list);
        setUsersLoading(false);
      },
      (err) => {
        console.error("Error loading users in Payslip:", err);
        setUsersLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Fetch all published payslips
  useEffect(() => {
    setPublishedLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "payslips"),
      (snap) => {
        const dict: Record<string, PublishedPayslip> = {};
        snap.forEach((doc) => {
          dict[doc.id] = doc.data() as PublishedPayslip;
        });
        setPublishedPayslips(dict);
        setPublishedLoading(false);
      },
      (err) => {
        console.error("Error loading payslips:", err);
        setPublishedLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 3. Fetch all kasbon requests
  useEffect(() => {
    setLoadingKasbon(true);
    const unsubscribe = onSnapshot(
      collection(db, "kasbon_requests"),
      (snap) => {
        const list: KasbonRequest[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as KasbonRequest);
        });
        setKasbonList(list);
        setLoadingKasbon(false);
      },
      (err) => {
        console.error("Error loading kasbon in PayslipView:", err);
        setLoadingKasbon(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Determine if a project belongs to selected month and year
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

  // Helper to match staff notes in budget items
  const createStaffMatcher = (targetUsername: string, targetDisplayName: string) => {
    const uLow = targetUsername.toLowerCase().trim();
    const dLow = targetDisplayName.toLowerCase().trim();
    return (notesString: string) => {
      if (!notesString) return false;
      const parts = notesString.toLowerCase().split(/[,/&]|\bdan\b/g);
      return parts.some((p) => {
        const trimmed = p.trim();
        return (
          trimmed === uLow ||
          (dLow && trimmed === dLow) ||
          trimmed.includes(uLow)
        );
      });
    };
  };

  // Calculate comprehensive data for EVERY staff member for the selected Period
  const allStaffCalculatedData = useMemo(() => {
    // Filter active users
    const activeUsers = dbUsers.filter((u) => u.username && u.status !== "nonaktif");

    return activeUsers.map((user) => {
      const username = user.username.toLowerCase().trim();
      const displayName = user.displayName || user.username.toUpperCase();
      const matchesInitials = createStaffMatcher(username, displayName);

      const feeItems: Array<{ id: string; projectName: string; description: string; amount: number; type: string }> = [];
      const driverItems: Array<{ id: string; projectName: string; description: string; amount: number; type: string }> = [];
      const rmbsItems: Array<{ id: string; projectName: string; description: string; amount: number; type: string }> = [];
      const attendedEvents: Record<string, { name: string; date: string; location: string; daysCount: number }> = {};

      let totalFee = 0;
      let totalDriver = 0;
      let totalRmbs = 0;

      // Scan all projects in period
      projects.forEach((proj) => {
        if (!isProjInSelectedPeriod(proj)) return;
        if (!proj.id || !proj.name || proj.name.trim() === "") return;

        const budgetSource: any = proj.realisasi || {};
        let staffHasEarning = false;

        // 1. Fee distribution
        if (budgetSource.feeDistribution) {
          budgetSource.feeDistribution.forEach((item: any, idx: number) => {
            if (matchesInitials(item.notes)) {
              staffHasEarning = true;
              const isDriver = item.description.toLowerCase().includes("driver") || 
                              item.description.toLowerCase().includes("drv") || 
                              item.description.toLowerCase().includes("sopir");
              const amt = (Number(item.expense) || 0) * (Number(item.qty) || 1);

              if (isDriver) {
                totalDriver += amt;
                driverItems.push({
                  id: `${proj.id}-fee-${idx}-${item.id}`,
                  projectName: proj.name,
                  description: item.description,
                  amount: amt,
                  type: "driver"
                });
              } else {
                totalFee += amt;
                feeItems.push({
                  id: `${proj.id}-fee-${idx}-${item.id}`,
                  projectName: proj.name,
                  description: item.description,
                  amount: amt,
                  type: "fee"
                });
              }
            }
          });
        }

        // 1b. PIC Bonus
        const calc = calculateProjectBudget(budgetSource);
        if (budgetSource.picBonusStaff && matchesInitials(budgetSource.picBonusStaff)) {
          staffHasEarning = true;
          totalFee += calc.picBonus;
          feeItems.push({
            id: `${proj.id}-pic-bonus`,
            projectName: proj.name,
            description: "PIC Bonus Event",
            amount: calc.picBonus,
            type: "pic_bonus"
          });
        }

        // 2. Accommodation / Reimbursement
        if (budgetSource.accommodation) {
          budgetSource.accommodation.forEach((item: any, idx: number) => {
            if (matchesInitials(item.notes)) {
              staffHasEarning = true;
              const amt = (Number(item.expense) || 0) * (Number(item.qty) || 1);
              totalRmbs += amt;
              rmbsItems.push({
                id: `${proj.id}-ac-${idx}-${item.id}`,
                projectName: proj.name,
                description: item.description,
                amount: amt,
                type: "reimbursement"
              });
            }
          });
        }

        // Attended events tracking
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

      // Approved Kasbon for this staff in this period
      const approvedKasbons = kasbonList.filter((k) => {
        const matchStaff = (k.staffUsername || "").toLowerCase().trim() === username;
        if (!matchStaff || k.status !== "approved") return false;
        if (k.periodMonth !== undefined && k.periodYear !== undefined) {
          return k.periodMonth === selectedMonth && k.periodYear === selectedYear;
        }
        if (k.createdAt) {
          const d = new Date(k.createdAt);
          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
        }
        return true;
      });

      const totalApprovedKasbon = approvedKasbons.reduce((acc, k) => acc + (k.amount || 0), 0);

      // Pending Kasbon for this staff
      const pendingKasbons = kasbonList.filter((k) => {
        return (k.staffUsername || "").toLowerCase().trim() === username && k.status === "pending";
      });

      // Published payslip record
      const payslipKey = `${username}-${selectedYear}-${selectedMonth}`;
      const savedDoc = publishedPayslips[payslipKey] || null;
      const isPublished = savedDoc?.published === true;

      // Custom manual adjustments from saved doc
      const manualEarningsList: CustomItem[] = savedDoc?.customEarnings || [];
      const manualDeductionsList: CustomItem[] = savedDoc?.customDeductions || [];

      const totalManualEarnings = manualEarningsList.reduce((acc, item) => acc + (item.amount || 0), 0);
      const totalManualDeductions = manualDeductionsList.reduce((acc, item) => acc + (item.amount || 0), 0);

      const totalGrossEarnings = totalFee + totalDriver + totalRmbs + totalManualEarnings;
      const totalDeductions = totalApprovedKasbon + totalManualDeductions;
      const takeHomePay = totalGrossEarnings - totalDeductions;

      return {
        user,
        username,
        displayName,
        jobTitle: user.jobTitle || savedDoc?.staffJob || "Staff Lapangan",
        role: user.role || "staff",
        bankName: user.bankName,
        accountNumber: user.accountNumber,
        accountHolderName: user.accountHolderName,
        attendedEventsList: Object.values(attendedEvents),
        eventsCount: Object.keys(attendedEvents).length,
        feeItems,
        driverItems,
        rmbsItems,
        totalFee,
        totalDriver,
        totalRmbs,
        approvedKasbons,
        pendingKasbons,
        totalApprovedKasbon,
        manualEarningsList,
        manualDeductionsList,
        totalManualEarnings,
        totalManualDeductions,
        totalGrossEarnings,
        totalDeductions,
        takeHomePay,
        isPublished,
        payslipKey,
        savedDoc
      };
    });
  }, [dbUsers, projects, selectedMonth, selectedYear, kasbonList, publishedPayslips]);

  // Overall Financial Summary for the Period
  const periodKpiSummary = useMemo(() => {
    let totalTakeHome = 0;
    let totalGross = 0;
    let totalFee = 0;
    let totalDriver = 0;
    let totalRmbs = 0;
    let totalKasbonCut = 0;
    let totalPublishedCount = 0;
    let totalStaffWithActivity = 0;

    allStaffCalculatedData.forEach((s) => {
      totalTakeHome += s.takeHomePay;
      totalGross += s.totalGrossEarnings;
      totalFee += s.totalFee;
      totalDriver += s.totalDriver;
      totalRmbs += s.totalRmbs;
      totalKasbonCut += s.totalApprovedKasbon;
      if (s.isPublished) totalPublishedCount++;
      if (s.eventsCount > 0 || s.totalGrossEarnings > 0) totalStaffWithActivity++;
    });

    return {
      totalTakeHome,
      totalGross,
      totalFee,
      totalDriver,
      totalRmbs,
      totalKasbonCut,
      totalPublishedCount,
      totalStaffWithActivity,
      totalStaffCount: allStaffCalculatedData.length
    };
  }, [allStaffCalculatedData]);

  // Filtered staff list for table
  const filteredStaffList = useMemo(() => {
    return allStaffCalculatedData.filter((s) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = s.displayName.toLowerCase().includes(q) || s.username.toLowerCase().includes(q);
        const matchJob = s.jobTitle.toLowerCase().includes(q);
        if (!matchName && !matchJob) return false;
      }

      // Publish Status
      if (filterPublishStatus === "published" && !s.isPublished) return false;
      if (filterPublishStatus === "draft" && s.isPublished) return false;

      // Role
      if (filterRole !== "all" && s.role !== filterRole) return false;

      return true;
    });
  }, [allStaffCalculatedData, searchQuery, filterPublishStatus, filterRole]);

  // Kasbon management statistics & filtered list
  const totalPendingKasbonCount = useMemo(() => {
    return kasbonList.filter((k) => k.status === "pending").length;
  }, [kasbonList]);

  const totalApprovedKasbonCount = useMemo(() => {
    return kasbonList.filter((k) => k.status === "approved").length;
  }, [kasbonList]);

  const totalRejectedKasbonCount = useMemo(() => {
    return kasbonList.filter((k) => k.status === "rejected").length;
  }, [kasbonList]);

  const filteredKasbonList = useMemo(() => {
    return kasbonList
      .filter((k) => {
        if (kasbonStatusFilter !== "all" && k.status !== kasbonStatusFilter) return false;
        if (kasbonSearchQuery.trim()) {
          const q = kasbonSearchQuery.toLowerCase().trim();
          const matchStaff = (k.staffUsername || "").toLowerCase().includes(q) || (k.staffDisplayName || "").toLowerCase().includes(q);
          const matchReason = (k.reason || "").toLowerCase().includes(q);
          const matchBank = (k.bankName || "").toLowerCase().includes(q) || (k.accountNumber || "").includes(q);
          if (!matchStaff && !matchReason && !matchBank) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [kasbonList, kasbonStatusFilter, kasbonSearchQuery]);

  // Handle Admin ACC / Approve / Reject Kasbon
  const handleUpdateKasbonStatus = async (id: string, newStatus: "approved" | "rejected" | "pending") => {
    if (!isAdmin) {
      onNotify("Hanya Administrator yang berwenang memproses persetujuan kasbon!", "error");
      return;
    }
    try {
      const kasbonRef = doc(db, "kasbon_requests", id);
      const updateData: any = {
        status: newStatus,
        approvedAt: newStatus === "pending" ? null : new Date().toISOString(),
        approvedBy: newStatus === "pending" ? null : (currentUserProfile?.displayName || currentUserProfile?.username || "Admin")
      };
      await updateDoc(kasbonRef, updateData);
      onNotify(
        newStatus === "approved"
          ? "Kasbon berhasil di-ACC (Disetujui)! Nominal langsung otomatis masuk ke potongan slip gaji staf."
          : newStatus === "rejected"
          ? "Kasbon telah ditolak."
          : "Status kasbon dikembalikan ke status Menunggu (Pending).",
        newStatus === "approved" ? "success" : "info"
      );
    } catch (err: any) {
      console.error("Error updating kasbon status:", err);
      onNotify("Gagal memperbarui status kasbon: " + (err.message || "Periksa koneksi"), "error");
    }
  };

  // Quick toggle publish for a specific staff
  const handleTogglePublish = async (staffData: typeof allStaffCalculatedData[0]) => {
    if (!isAdmin) {
      onNotify("Hanya Administrator yang berwenang mengubah status publikasi slip gaji!", "error");
      return;
    }
    try {
      const targetPublish = !staffData.isPublished;
      const payload: PublishedPayslip = {
        id: staffData.payslipKey,
        staffUsername: staffData.username,
        staffDisplayName: staffData.displayName,
        staffJob: staffData.jobTitle,
        month: selectedMonth,
        year: selectedYear,
        published: targetPublish,
        customEarnings: staffData.manualEarningsList,
        customDeductions: staffData.manualDeductionsList,
        createdAt: staffData.savedDoc?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "payslips", staffData.payslipKey), payload);
      onNotify(
        targetPublish
          ? `Slip gaji ${staffData.displayName} berhasil dipublikasikan ke akun staf!`
          : `Slip gaji ${staffData.displayName} ditarik dari publikasi (kembali ke Draft).`,
        targetPublish ? "success" : "info"
      );
    } catch (err: any) {
      console.error("Publish toggle error:", err);
      onNotify("Gagal mengubah status publikasi: " + err.message, "error");
    }
  };

  // Publish All Drafts
  const handlePublishAll = async () => {
    if (!isAdmin) return;
    const drafts = allStaffCalculatedData.filter((s) => !s.isPublished);
    if (drafts.length === 0) {
      onNotify("Semua slip gaji staf untuk periode ini sudah terpublikasi!", "info");
      return;
    }
    if (!window.confirm(`Publikasikan ${drafts.length} slip gaji staf sekaligus ke masing-masing akun staf?`)) {
      return;
    }

    try {
      for (const s of drafts) {
        const payload: PublishedPayslip = {
          id: s.payslipKey,
          staffUsername: s.username,
          staffDisplayName: s.displayName,
          staffJob: s.jobTitle,
          month: selectedMonth,
          year: selectedYear,
          published: true,
          customEarnings: s.manualEarningsList,
          customDeductions: s.manualDeductionsList,
          createdAt: s.savedDoc?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, "payslips", s.payslipKey), payload);
      }
      onNotify(`Berhasil mempublikasikan ${drafts.length} slip gaji staf!`, "success");
    } catch (err: any) {
      console.error("Batch publish error:", err);
      onNotify("Gagal mempublikasikan beberapa slip: " + err.message, "error");
    }
  };

  // Open Detail Modal
  const handleOpenDetailModal = (staffUser: UserProfile) => {
    setModalStaff(staffUser);
    const targetUsername = staffUser.username.toLowerCase().trim();
    const pKey = `${targetUsername}-${selectedYear}-${selectedMonth}`;
    const saved = publishedPayslips[pKey];
    setModalManualEarnings(saved?.customEarnings || []);
    setModalManualDeductions(saved?.customDeductions || []);
    setModalExtraInDesc("");
    setModalExtraInAmount("");
    setModalExtraOutDesc("");
    setModalExtraOutAmount("");
  };

  // Save Modal Adjustments
  const handleSaveModalAdjustments = async () => {
    if (!modalStaff || !isAdmin) return;
    setIsSavingModal(true);
    try {
      const targetUsername = modalStaff.username.toLowerCase().trim();
      const pKey = `${targetUsername}-${selectedYear}-${selectedMonth}`;
      const saved = publishedPayslips[pKey];

      const payload: PublishedPayslip = {
        id: pKey,
        staffUsername: targetUsername,
        staffDisplayName: modalStaff.displayName || modalStaff.username.toUpperCase(),
        staffJob: modalStaff.jobTitle || "Staff Lapangan",
        month: selectedMonth,
        year: selectedYear,
        published: saved ? saved.published : true,
        customEarnings: modalManualEarnings,
        customDeductions: modalManualDeductions,
        createdAt: saved?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "payslips", pKey), payload);
      onNotify(`Rincian penyesuaian untuk ${payload.staffDisplayName} berhasil disimpan!`, "success");
      setModalStaff(null);
    } catch (err: any) {
      console.error("Save modal error:", err);
      onNotify("Gagal menyimpan penyesuaian: " + err.message, "error");
    } finally {
      setIsSavingModal(false);
    }
  };

  // Export CSV of Table
  const handleExportCSV = () => {
    const headers = [
      "No",
      "Username",
      "Nama Staff",
      "Jabatan",
      "Role",
      "Jumlah Event",
      "Honor Pokok & PIC",
      "Honor Driver",
      "Reimbursement",
      "Bonus & Tambahan",
      "Total Pendapatan Kotor",
      "Potongan Kasbon (ACC)",
      "Potongan Manual",
      "Total Potongan",
      "Gaji Bersih (Take Home Pay)",
      "Status Publikasi",
      "Bank",
      "No Rekening",
      "Atas Nama"
    ];

    const rows = filteredStaffList.map((s, idx) => [
      idx + 1,
      `"${s.username}"`,
      `"${s.displayName}"`,
      `"${s.jobTitle}"`,
      `"${s.role}"`,
      s.eventsCount,
      s.totalFee,
      s.totalDriver,
      s.totalRmbs,
      s.totalManualEarnings,
      s.totalGrossEarnings,
      s.totalApprovedKasbon,
      s.totalManualDeductions,
      s.totalDeductions,
      s.takeHomePay,
      s.isPublished ? "Terpublikasi" : "Draft",
      `"${s.bankName || "-"}"`,
      `"${s.accountNumber || "-"}"`,
      `"${s.accountHolderName || "-"}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_Slip_Gaji_${INDONESIAN_MONTH_NAMES[selectedMonth]}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify("Rekap data slip gaji berhasil diekspor ke CSV!", "success");
  };

  // Selected staff calculated object for modal
  const modalStaffCalculated = useMemo(() => {
    if (!modalStaff) return null;
    return allStaffCalculatedData.find((s) => s.username === modalStaff.username.toLowerCase().trim()) || null;
  }, [modalStaff, allStaffCalculatedData]);

  // Helper to build current modal staff payslip payload
  const buildModalStaffPdfData = (): StaffPayslipPdfData | null => {
    if (!modalStaffCalculated) return null;
    const earnings = [
      ...modalStaffCalculated.feeItems.map(f => ({ description: `${f.projectName} - ${f.description}`, amount: f.amount, type: "fee" })),
      ...modalStaffCalculated.driverItems.map(d => ({ description: `${d.projectName} - ${d.description}`, amount: d.amount, type: "driver" })),
      ...modalStaffCalculated.rmbsItems.map(r => ({ description: `${r.projectName} - ${r.description}`, amount: r.amount, type: "reimbursement" })),
      ...modalManualEarnings.map(m => ({ description: m.description, amount: m.amount, type: "fee" }))
    ];

    const deductions = [
      ...modalStaffCalculated.approvedKasbons.map(k => ({ description: `Kasbon: ${k.reason}`, amount: k.amount })),
      ...modalManualDeductions.map(m => ({ description: m.description, amount: m.amount }))
    ];

    const totalE = earnings.reduce((a, b) => a + b.amount, 0);
    const totalD = deductions.reduce((a, b) => a + b.amount, 0);
    const thp = Math.max(0, totalE - totalD);

    return {
      staffUsername: modalStaffCalculated.username,
      staffDisplayName: modalStaffCalculated.displayName,
      staffRole: modalStaffCalculated.role,
      staffJob: modalStaffCalculated.jobTitle,
      monthName: INDONESIAN_MONTH_NAMES[selectedMonth],
      year: selectedYear,
      earnings,
      deductions,
      totalEarnings: totalE,
      totalDeductions: totalD,
      takeHomePay: thp,
      attendedEvents: modalStaffCalculated.attendedEventsList,
      isPublished: modalStaffCalculated.isPublished,
    };
  };

  const handleAdminDownloadStaffPdf = async () => {
    const data = buildModalStaffPdfData();
    if (!data) return;
    setAdminExportingStaffPdf(true);
    try {
      const blob = await generateStaffPayslipPdfBlob(data);
      saveAs(blob, `Slip_Gaji_${data.staffUsername}_${INDONESIAN_MONTH_NAMES[selectedMonth]}_${selectedYear}.pdf`);
      onNotify(`Slip gaji ${data.staffDisplayName} berhasil diunduh sebagai PDF!`, "success");
    } catch (err: any) {
      console.error("Admin PDF error:", err);
      onNotify("Gagal mengunduh PDF: " + err.message, "error");
    } finally {
      setAdminExportingStaffPdf(false);
    }
  };

  const handleAdminPrintStaff = async () => {
    const data = buildModalStaffPdfData();
    if (!data) return;
    setAdminPrintingStaff(true);
    try {
      const ok = await printStaffPayslipDirectly(data);
      if (!ok) onNotify("Gagal membuka jendela cetak. Periksa izin pop-up browser.", "error");
    } catch (err: any) {
      console.error("Admin Print error:", err);
      onNotify("Gagal mencetak: " + err.message, "error");
    } finally {
      setAdminPrintingStaff(false);
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

  return (
    <div className="space-y-6 pb-16">
      {/* TOP HEADER & CONTROLS */}
      <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Manajemen Slip Gaji & Kasbon Staff</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-bold">
                  Admin Control
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Rekap menyeluruh honorarium seluruh staf dan pusat persetujuan pencairan kasbon terintegrasi.
              </p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
              <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex items-center space-x-1.5 text-xs font-semibold">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-sans"
                >
                  {INDONESIAN_MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx} className="bg-slate-900 text-slate-200">
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-mono font-bold"
                >
                  {yearsList.map((yr) => (
                    <option key={yr} value={yr} className="bg-slate-900 text-slate-200">
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-750 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              title="Download Rekap CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ekspor CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePublishAll}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-extrabold rounded-xl text-xs transition shadow-lg shadow-cyan-950/40 cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 text-slate-950" />
              <span>Publikasikan Semua</span>
            </button>
          </div>
        </div>

        {/* NAVIGATION SEGMENTED TABS */}
        <div className="flex items-center space-x-2 border-t border-slate-850/80 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab("rekap")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === "rekap"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Tabel Rekap Slip Gaji Semua Staff</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-900 text-slate-300 border border-slate-800">
              {allStaffCalculatedData.length} Staf
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("kasbon")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer relative ${
              activeTab === "kasbon"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Pusat Persetujuan & ACC Kasbon</span>
            {totalPendingKasbonCount > 0 ? (
              <span className="bg-amber-500 text-slate-950 font-black text-[9px] px-1.5 py-0.2 rounded-full font-mono animate-pulse">
                {totalPendingKasbonCount} Butuh ACC
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                {kasbonList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: REKAP TABEL SLIP GAJI SEMUA STAFF                                   */}
      {/* ========================================================================= */}
      {activeTab === "rekap" && (
        <div className="space-y-5">
          {/* FINANCIAL OVERVIEW KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#0e121a] border border-cyan-500/30 p-3.5 rounded-xl space-y-1 shadow-sm">
              <span className="text-[10px] uppercase font-mono text-cyan-400 font-semibold block">
                Total Gaji Bersih (THP)
              </span>
              <p className="text-base sm:text-lg font-mono font-black text-white">
                {formatRupiah(periodKpiSummary.totalTakeHome)}
              </p>
              <span className="text-[9px] text-slate-400 font-sans block">
                Periode: {INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear}
              </span>
            </div>

            <div className="bg-[#0e121a] border border-slate-800 p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400 font-semibold block">
                Honor Pokok & PIC
              </span>
              <p className="text-sm sm:text-base font-mono font-bold text-slate-200">
                {formatRupiah(periodKpiSummary.totalFee)}
              </p>
              <span className="text-[9px] text-slate-500 font-sans block">Dari distribusi fee</span>
            </div>

            <div className="bg-[#0e121a] border border-slate-800 p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400 font-semibold block">
                Honor Driver / Lapangan
              </span>
              <p className="text-sm sm:text-base font-mono font-bold text-slate-200">
                {formatRupiah(periodKpiSummary.totalDriver)}
              </p>
              <span className="text-[9px] text-slate-500 font-sans block">Roster transport</span>
            </div>

            <div className="bg-[#0e121a] border border-slate-800 p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400 font-semibold block">
                Total Reimbursement
              </span>
              <p className="text-sm sm:text-base font-mono font-bold text-slate-200">
                {formatRupiah(periodKpiSummary.totalRmbs)}
              </p>
              <span className="text-[9px] text-slate-500 font-sans block">Talangan staf</span>
            </div>

            <div className="bg-[#0e121a] border border-amber-500/25 p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-mono text-amber-400 font-semibold block">
                Kasbon Terpotong (ACC)
              </span>
              <p className="text-sm sm:text-base font-mono font-bold text-amber-300">
                {formatRupiah(periodKpiSummary.totalKasbonCut)}
              </p>
              <span className="text-[9px] text-slate-500 font-sans block">Otomatis memotong gaji</span>
            </div>

            <div className="bg-[#0e121a] border border-slate-800 p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-mono text-emerald-400 font-semibold block">
                Status Terpublikasi
              </span>
              <p className="text-sm sm:text-base font-mono font-bold text-emerald-300">
                {periodKpiSummary.totalPublishedCount} / {periodKpiSummary.totalStaffCount}
              </p>
              <span className="text-[9px] text-slate-500 font-sans block">
                {periodKpiSummary.totalStaffWithActivity} staf ada kegiatan
              </span>
            </div>
          </div>

          {/* SEARCH & FILTERS BAR */}
          <div className="bg-[#0e121a] border border-slate-800/80 p-3 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full md:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Cari nama staff / username / jabatan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
              <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Status:</span>
                <select
                  value={filterPublishStatus}
                  onChange={(e) => setFilterPublishStatus(e.target.value as any)}
                  className="bg-transparent text-slate-300 font-bold focus:outline-none cursor-pointer text-xs"
                >
                  <option value="all" className="bg-slate-900">Semua Status</option>
                  <option value="published" className="bg-slate-900">Terpublikasi</option>
                  <option value="draft" className="bg-slate-900">Draft (Belum Rilis)</option>
                </select>
              </div>

              <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Role:</span>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="bg-transparent text-slate-300 font-bold focus:outline-none cursor-pointer text-xs capitalize"
                >
                  <option value="all" className="bg-slate-900">Semua Role</option>
                  <option value="staff" className="bg-slate-900">Staff</option>
                  <option value="admin" className="bg-slate-900">Admin</option>
                  <option value="finance" className="bg-slate-900">Finance</option>
                </select>
              </div>

              <span className="text-[10.5px] text-slate-500 font-mono pl-1">
                Menampilkan <strong>{filteredStaffList.length}</strong> staf
              </span>
            </div>
          </div>

          {/* COMPREHENSIVE ALL-STAFF PAYSLIP TABLE */}
          <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {usersLoading ? (
              <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mb-2" />
                <span>Memuat data staf dan realisasi honorarium...</span>
              </div>
            ) : filteredStaffList.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Tidak ada data staf yang sesuai dengan filter pencarian.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-[#080b11] border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                      <th className="py-3 px-3.5 text-center w-10">No</th>
                      <th className="py-3 px-3.5">Nama Staff & Jabatan</th>
                      <th className="py-3 px-3 text-center">Event</th>
                      <th className="py-3 px-3 text-right">Honor Pokok / PIC</th>
                      <th className="py-3 px-3 text-right">Driver / Lapangan</th>
                      <th className="py-3 px-3 text-right">Reimbursement</th>
                      <th className="py-3 px-3 text-right">Bonus / Tambahan</th>
                      <th className="py-3 px-3 text-right text-amber-400">Pot. Kasbon (ACC)</th>
                      <th className="py-3 px-3 text-right text-rose-400">Pot. Lain</th>
                      <th className="py-3 px-3.5 text-right font-bold text-cyan-400">Take Home Pay</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3.5 text-center w-28">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/60">
                    {filteredStaffList.map((s, idx) => (
                      <tr
                        key={s.username}
                        className="hover:bg-slate-900/50 transition duration-150 group"
                      >
                        {/* No */}
                        <td className="py-3 px-3.5 text-center font-mono text-slate-500 text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Staff & Jabatan */}
                        <td className="py-3 px-3.5">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-850 border border-slate-750 flex items-center justify-center text-cyan-400 font-bold font-mono text-xs uppercase shrink-0">
                              {s.username.slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-white group-hover:text-cyan-300 transition text-[12.5px]">
                                  {s.displayName}
                                </span>
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800 uppercase">
                                  {s.role}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-sans flex items-center space-x-1 mt-0.5">
                                <span>{s.jobTitle}</span>
                                {s.bankName && (
                                  <span className="text-[9px] text-cyan-400 font-mono font-semibold">
                                    • {s.bankName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Event count */}
                        <td className="py-3 px-3 text-center">
                          {s.eventsCount > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-800/50">
                              {s.eventsCount} Event
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600 font-mono">-</span>
                          )}
                        </td>

                        {/* Fee Pokok & PIC */}
                        <td className="py-3 px-3 text-right font-mono text-slate-200">
                          {s.totalFee > 0 ? formatRupiah(s.totalFee) : <span className="text-slate-600">Rp 0</span>}
                        </td>

                        {/* Driver */}
                        <td className="py-3 px-3 text-right font-mono text-slate-200">
                          {s.totalDriver > 0 ? formatRupiah(s.totalDriver) : <span className="text-slate-600">Rp 0</span>}
                        </td>

                        {/* Reimbursement */}
                        <td className="py-3 px-3 text-right font-mono text-slate-200">
                          {s.totalRmbs > 0 ? formatRupiah(s.totalRmbs) : <span className="text-slate-600">Rp 0</span>}
                        </td>

                        {/* Bonus / Tambahan */}
                        <td className="py-3 px-3 text-right font-mono">
                          {s.totalManualEarnings > 0 ? (
                            <span className="text-emerald-400 font-semibold">+{formatRupiah(s.totalManualEarnings)}</span>
                          ) : (
                            <span className="text-slate-600">Rp 0</span>
                          )}
                        </td>

                        {/* Potongan Kasbon ACC */}
                        <td className="py-3 px-3 text-right font-mono">
                          {s.totalApprovedKasbon > 0 ? (
                            <span className="text-amber-400 font-bold">-{formatRupiah(s.totalApprovedKasbon)}</span>
                          ) : (
                            <span className="text-slate-600">Rp 0</span>
                          )}
                          {s.pendingKasbons.length > 0 && (
                            <span className="block text-[8px] font-mono text-amber-500 uppercase font-bold animate-pulse">
                              +{s.pendingKasbons.length} Menunggu ACC
                            </span>
                          )}
                        </td>

                        {/* Potongan Lain */}
                        <td className="py-3 px-3 text-right font-mono">
                          {s.totalManualDeductions > 0 ? (
                            <span className="text-rose-400 font-bold">-{formatRupiah(s.totalManualDeductions)}</span>
                          ) : (
                            <span className="text-slate-600">Rp 0</span>
                          )}
                        </td>

                        {/* TAKE HOME PAY */}
                        <td className="py-3 px-3.5 text-right font-mono font-black text-[13px] text-cyan-300">
                          {formatRupiah(s.takeHomePay)}
                        </td>

                        {/* Status Publikasi */}
                        <td className="py-3 px-3 text-center">
                          {s.isPublished ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Rilis</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase bg-slate-800/80 text-slate-400 border border-slate-700/60">
                              <Clock className="w-2.5 h-2.5" />
                              <span>Draft</span>
                            </span>
                          )}
                        </td>

                        {/* Aksi */}
                        <td className="py-3 px-3.5 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenDetailModal(s.user)}
                              className="p-1.5 bg-slate-850 hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-slate-750 hover:border-cyan-800 rounded-lg text-xs font-bold transition cursor-pointer"
                              title="Buka Detail & Edit Penyesuaian"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleTogglePublish(s)}
                              className={`p-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                                s.isPublished
                                  ? "bg-emerald-950/40 hover:bg-rose-950/40 text-emerald-400 hover:text-rose-400 border-emerald-800/40 hover:border-rose-800/40"
                                  : "bg-cyan-600 hover:bg-cyan-500 text-slate-950 border-cyan-500"
                              }`}
                              title={s.isPublished ? "Tarik Publikasi (Kembali ke Draft)" : "Publikasikan ke Akun Staf"}
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PUSAT PERSETUJUAN & ACC KASBON (COMFORTABLE & INTUITIVE UI)         */}
      {/* ========================================================================= */}
      {activeTab === "kasbon" && (
        <div className="space-y-5">
          {/* TOP KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0e121a] border border-amber-500/30 p-4 rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono text-amber-400 font-bold">
                  Butuh Persetujuan (ACC)
                </span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-xl sm:text-2xl font-mono font-black text-amber-300">
                {totalPendingKasbonCount}
              </p>
              <span className="text-[9.5px] text-slate-400 font-sans block">
                Pengajuan menunggu konfirmasi admin
              </span>
            </div>

            <div className="bg-[#0e121a] border border-emerald-500/30 p-4 rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold">
                  Kasbon Disetujui (ACC)
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xl sm:text-2xl font-mono font-black text-emerald-300">
                {totalApprovedKasbonCount}
              </p>
              <span className="text-[9.5px] text-slate-400 font-sans block">
                Otomatis memotong slip gaji
              </span>
            </div>

            <div className="bg-[#0e121a] border border-rose-500/30 p-4 rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono text-rose-400 font-bold">
                  Kasbon Ditolak
                </span>
                <XCircle className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-xl sm:text-2xl font-mono font-black text-rose-300">
                {totalRejectedKasbonCount}
              </p>
              <span className="text-[9.5px] text-slate-400 font-sans block">
                Permohonan tidak disetujui
              </span>
            </div>

            <div className="bg-[#0e121a] border border-slate-800 p-4 rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold">
                  Total Seluruh Kasbon
                </span>
                <Wallet className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-xl sm:text-2xl font-mono font-black text-white">
                {kasbonList.length}
              </p>
              <span className="text-[9.5px] text-slate-400 font-sans block">
                Riwayat permohonan staf
              </span>
            </div>
          </div>

          {/* SEARCH & STATUS FILTER BAR */}
          <div className="bg-[#0e121a] border border-slate-800 p-3 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full md:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Cari staf, keperluan kasbon, nomor rekening..."
                value={kasbonSearchQuery}
                onChange={(e) => setKasbonSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none"
              />
              {kasbonSearchQuery && (
                <button
                  type="button"
                  onClick={() => setKasbonSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
              {(["all", "pending", "approved", "rejected"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setKasbonStatusFilter(st)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-mono font-bold transition capitalize cursor-pointer ${
                    kasbonStatusFilter === st
                      ? st === "pending"
                        ? "bg-amber-500 text-slate-950 shadow-md font-extrabold"
                        : st === "approved"
                        ? "bg-emerald-500 text-slate-950 shadow-md font-extrabold"
                        : st === "rejected"
                        ? "bg-rose-500 text-slate-950 shadow-md font-extrabold"
                        : "bg-slate-200 text-slate-950 shadow-md font-extrabold"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-850"
                  }`}
                >
                  {st === "all" ? "Semua Status" : st === "pending" ? "Menunggu ACC" : st === "approved" ? "Disetujui (ACC)" : "Ditolak"}
                </button>
              ))}
            </div>
          </div>

          {/* KASBON MODERN CARDS GRID */}
          {loadingKasbon ? (
            <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center bg-[#0b0f17] border border-slate-800 rounded-2xl">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400 mb-2" />
              <span>Memuat daftar permohonan kasbon...</span>
            </div>
          ) : filteredKasbonList.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs bg-[#0b0f17] border border-slate-800 rounded-2xl">
              Tidak ada data pengajuan kasbon yang cocok dengan filter yang dipilih.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredKasbonList.map((k) => (
                <div
                  key={k.id}
                  className={`bg-[#0c1017] border rounded-2xl p-4.5 space-y-3.5 transition flex flex-col justify-between shadow-lg ${
                    k.status === "pending"
                      ? "border-amber-500/40 hover:border-amber-500/70 shadow-amber-950/10"
                      : k.status === "approved"
                      ? "border-emerald-900/50 hover:border-emerald-800/70"
                      : "border-slate-850 opacity-80"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header: Staff Info & Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 font-bold font-mono text-sm uppercase">
                          {k.staffUsername.slice(0, 2)}
                        </div>
                        <div>
                          <span className="font-extrabold text-white text-sm block">
                            {k.staffDisplayName || k.staffUsername.toUpperCase()}
                          </span>
                          <span className="text-[9.5px] text-slate-500 font-mono">
                            {new Date(k.createdAt).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Status badge */}
                      <div>
                        {k.status === "pending" ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
                            <Clock className="w-3 h-3" />
                            <span>Menunggu ACC</span>
                          </span>
                        ) : k.status === "approved" ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Di-ACC</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <XCircle className="w-3 h-3" />
                            <span>Ditolak</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Nominal Amount */}
                    <div className="bg-[#080a0f] border border-slate-850 p-3 rounded-xl flex items-baseline justify-between">
                      <div>
                        <span className="text-[9px] uppercase font-mono text-slate-500 block">
                          Nominal Kasbon:
                        </span>
                        <span className="text-lg font-mono font-black text-amber-400">
                          {formatRupiah(k.amount)}
                        </span>
                      </div>
                      {k.periodMonth !== undefined && k.periodYear !== undefined && (
                        <div className="text-right">
                          <span className="text-[9px] uppercase font-mono text-slate-500 block">
                            Periode Potong:
                          </span>
                          <span className="text-[10px] font-mono text-slate-300 font-bold">
                            {INDONESIAN_MONTH_NAMES[k.periodMonth]} {k.periodYear}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Reason / Keperluan */}
                    <div className="text-xs text-slate-300 bg-[#080b11] p-3 rounded-xl border border-slate-900 leading-relaxed">
                      <span className="text-[9px] font-mono text-slate-500 uppercase block font-semibold mb-0.5">
                        Keperluan / Alasan:
                      </span>
                      <p className="font-sans">{k.reason}</p>
                    </div>

                    {/* Rekening Pencairan / E-Wallet Card */}
                    {k.bankName && (
                      <div className="bg-gradient-to-br from-[#0c1424] to-[#070b12] border border-cyan-900/50 p-3 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-cyan-400 font-bold">
                          <div className="flex items-center space-x-1.5">
                            <Building2 className="w-3.5 h-3.5" />
                            <span>{k.bankName}</span>
                          </div>
                          {k.accountHolderName && (
                            <span className="text-slate-400 text-[9.5px] font-normal font-sans">
                              a.n <strong className="text-slate-200">{k.accountHolderName}</strong>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-0.5">
                          <span className="font-mono text-sm text-slate-100 font-black tracking-wider">
                            {k.accountNumber || "-"}
                          </span>

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
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[9.5px] font-bold transition cursor-pointer shrink-0 ${
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
                                  <span>Salin Rekening</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-2 border-t border-slate-850/80">
                    {k.status === "pending" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateKasbonStatus(k.id, "rejected")}
                          className="py-2 px-3 bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateKasbonStatus(k.id, "approved")}
                          className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-md flex items-center justify-center space-x-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Setujui (ACC)</span>
                        </button>
                      </div>
                    ) : k.status === "approved" ? (
                      <div className="flex items-center justify-between">
                        <div className="text-[9.5px] text-emerald-400 font-mono">
                          Di-ACC oleh: <strong>{k.approvedBy || "Admin"}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUpdateKasbonStatus(k.id, "pending")}
                          className="text-[10px] text-slate-400 hover:text-slate-200 underline font-mono cursor-pointer"
                        >
                          Batalkan ACC
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="text-[9.5px] text-rose-400 font-mono">
                          Ditolak oleh: <strong>{k.approvedBy || "Admin"}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUpdateKasbonStatus(k.id, "pending")}
                          className="text-[10px] text-slate-400 hover:text-slate-200 underline font-mono cursor-pointer"
                        >
                          Tinjau Ulang
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETAIL RINCIAN & EDIT PENYESUAIAN GAJI STAF                         */}
      {/* ========================================================================= */}
      {modalStaff && modalStaffCalculated && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e121a] border border-slate-750 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4.5 border-b border-slate-800 flex items-center justify-between bg-[#080b11]">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 font-bold font-mono text-sm uppercase">
                  {modalStaffCalculated.username.slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>Rincian Slip Gaji: {modalStaffCalculated.displayName}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 uppercase">
                      {INDONESIAN_MONTH_NAMES[selectedMonth]} {selectedYear}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Jabatan: {modalStaffCalculated.jobTitle} • {modalStaffCalculated.eventsCount} Event Diikuti
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalStaff(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Event Attended List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase font-mono text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Daftar Event yang Diikuti Pada Periode Ini</span>
                </h4>
                {modalStaffCalculated.attendedEventsList.length === 0 ? (
                  <p className="text-slate-500 italic p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                    Tidak ada catatan event lapangan di bulan ini untuk staf ini.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {modalStaffCalculated.attendedEventsList.map((ev, idx) => (
                      <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-200 block">{ev.name}</span>
                          <span className="text-[10px] text-slate-400">{ev.date} • {ev.location}</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-cyan-400 border border-slate-800">
                          {ev.daysCount} Hari
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Earnings Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#080b11] border border-slate-850 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[11px] font-bold text-slate-200">
                    <span>Honor Pokok & PIC</span>
                    <span className="font-mono text-cyan-400">{formatRupiah(modalStaffCalculated.totalFee)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Honor Driver / Lapangan</span>
                    <span className="font-mono text-slate-200">{formatRupiah(modalStaffCalculated.totalDriver)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Reimbursement (RMBS)</span>
                    <span className="font-mono text-slate-200">{formatRupiah(modalStaffCalculated.totalRmbs)}</span>
                  </div>
                </div>

                <div className="bg-[#080b11] border border-slate-850 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[11px] font-bold text-slate-200">
                    <span>Potongan Kasbon (ACC)</span>
                    <span className="font-mono text-amber-400">-{formatRupiah(modalStaffCalculated.totalApprovedKasbon)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Total Pendapatan Kotor</span>
                    <span className="font-mono text-slate-200">{formatRupiah(modalStaffCalculated.totalGrossEarnings)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-cyan-300 pt-1 border-t border-slate-800">
                    <span>Gaji Bersih (Take Home Pay)</span>
                    <span className="font-mono text-sm">{formatRupiah(modalStaffCalculated.takeHomePay)}</span>
                  </div>
                </div>
              </div>

              {/* Manual Adjustments: Bonus & Additional Earnings */}
              <div className="bg-[#080b11] border border-slate-850 p-4 rounded-xl space-y-3">
                <h5 className="text-xs font-bold uppercase font-mono text-emerald-400 flex items-center gap-1.5">
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Pendapatan Tambahan / Bonus Manual</span>
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Deskripsi bonus/tunjangan..."
                    value={modalExtraInDesc}
                    onChange={(e) => setModalExtraInDesc(e.target.value)}
                    className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex space-x-1.5">
                    <input
                      type="number"
                      placeholder="Nominal Rp"
                      value={modalExtraInAmount}
                      onChange={(e) => setModalExtraInAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!modalExtraInDesc.trim() || !modalExtraInAmount) return;
                        setModalManualEarnings(prev => [
                          ...prev,
                          { id: `e-${Date.now()}`, description: modalExtraInDesc.trim(), amount: Number(modalExtraInAmount) }
                        ]);
                        setModalExtraInDesc("");
                        setModalExtraInAmount("");
                      }}
                      className="px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg font-bold text-xs cursor-pointer"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                {modalManualEarnings.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {modalManualEarnings.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-850 text-xs">
                        <span className="text-slate-200">{item.description}</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-emerald-400 font-bold">+{formatRupiah(item.amount)}</span>
                          <button
                            type="button"
                            onClick={() => setModalManualEarnings(prev => prev.filter(x => x.id !== item.id))}
                            className="text-rose-400 hover:text-rose-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Adjustments: Deductions / Sanksi */}
              <div className="bg-[#080b11] border border-slate-850 p-4 rounded-xl space-y-3">
                <h5 className="text-xs font-bold uppercase font-mono text-rose-400 flex items-center gap-1.5">
                  <MinusCircle className="w-3.5 h-3.5" />
                  <span>Potongan Manual / Sanksi</span>
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Deskripsi potongan..."
                    value={modalExtraOutDesc}
                    onChange={(e) => setModalExtraOutDesc(e.target.value)}
                    className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex space-x-1.5">
                    <input
                      type="number"
                      placeholder="Nominal Rp"
                      value={modalExtraOutAmount}
                      onChange={(e) => setModalExtraOutAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!modalExtraOutDesc.trim() || !modalExtraOutAmount) return;
                        setModalManualDeductions(prev => [
                          ...prev,
                          { id: `d-${Date.now()}`, description: modalExtraOutDesc.trim(), amount: Number(modalExtraOutAmount) }
                        ]);
                        setModalExtraOutDesc("");
                        setModalExtraOutAmount("");
                      }}
                      className="px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs cursor-pointer"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                {modalManualDeductions.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {modalManualDeductions.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-850 text-xs">
                        <span className="text-slate-200">{item.description}</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-rose-400 font-bold">-{formatRupiah(item.amount)}</span>
                          <button
                            type="button"
                            onClick={() => setModalManualDeductions(prev => prev.filter(x => x.id !== item.id))}
                            className="text-rose-400 hover:text-rose-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#080b11] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setModalStaff(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Tutup
                </button>

                <button
                  type="button"
                  onClick={handleAdminDownloadStaffPdf}
                  disabled={adminExportingStaffPdf}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  title="Unduh file PDF resmi A4 untuk staf ini"
                >
                  {adminExportingStaffPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>{adminExportingStaffPdf ? "Membuat PDF..." : "Export PDF Staf"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAdminPrintStaff}
                  disabled={adminPrintingStaff}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  title="Cetak slip gaji staf ini"
                >
                  {adminPrintingStaff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                  <span>{adminPrintingStaff ? "Membuka Cetak..." : "Cetak"}</span>
                </button>
              </div>

              <button
                type="button"
                disabled={isSavingModal}
                onClick={handleSaveModalAdjustments}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl text-xs font-black transition cursor-pointer shadow-md disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isSavingModal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Simpan Penyesuaian</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
