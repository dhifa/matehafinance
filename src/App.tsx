import React, { useState, useEffect, useMemo } from "react";
import {
    EventProject,
    INITIAL_PROJECTS,
    DEFAULT_SHARING_RATIO,
    DEFAULT_PIC_BONUS_RATIO,
    formatRupiah,
    ProjectBudget,
    UserProfile,
    StaffRolePreset,
    PublishedPayslip,
    CustomRole,
    TabType,
    BudgetItem
  } from "./types";
import { calculateProjectBudget } from "./utils/math";
import DashboardStats from "./components/DashboardStats";
import FinancialChart from "./components/FinancialChart";
import EditableBudgetTable from "./components/EditableBudgetTable";
import { MatehaFinance } from "./components/MatehaFinance";
import LoginScreen from "./components/LoginScreen";
import CollaborationView from "./components/CollaborationView";
import QuotationView from "./components/QuotationView";
import InvoiceView from "./components/InvoiceView";
import KwitansiView from "./components/KwitansiView";
import ClientManagement from "./components/ClientManagement";
import MultiDatePicker from "./components/MultiDatePicker";
import PublicPayslipView from "./components/PublicPayslipView";
import { parseIndonesianDateText, getProjectEarliestTimestamp, formatMultiDates } from "./utils/date";
import PayslipView from "./components/PayslipView";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Trash2,
  Calendar,
  MapPin,
  Share2,
  Download,
  Upload,
  RefreshCw,
  FileText,
  Check,
  AlertCircle,
  TrendingUp,
  LayoutDashboard,
  Coins,
  ArrowRight,
  Info,
  LogOut,
  Loader2,
  ShieldCheck,
  Users,
  Sparkles,
  X,
  Wallet,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Menu,
  Minimize2,
  Maximize2,
  KeyRound,
  Receipt,
  Landmark,
  Banknote,
  UserCog,
  BookUser,
  FileSignature
} from "lucide-react";
import UserManagement from "./components/UserManagement";
import BackupExport from "./components/BackupExport";
import AiSettingsCard from "./components/AiSettingsCard";
import AiAssistant, { AiEventDraft } from "./components/AiAssistant";
import StaffPayslipView from "./components/StaffPayslipView";
import ChangePasswordModal from "./components/ChangePasswordModal";
import NotificationModal, { PopupNotificationState } from "./components/NotificationModal";
import { setGlobalNotificationListener, notify } from "./utils/notification";
import logo from "/favicon.png";
import { Sidebar, MobileTopBar, BottomNav, MobileMenuSheet } from "./components/layout/AppNavigation";

// Firebase operations
import { onAuthStateChanged, signOut } from "./lib/auth";
import { collection, doc, query, where, onSnapshot, setDoc, deleteDoc, getDoc } from "./lib/firestore";
import { auth, db, handleFirestoreError, OperationType, sanitizeForFirestore } from "./utils/backend";

export type { TabType };

interface NavTabItem {
  id: TabType;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: ("admin" | "staff" | "finance")[];
}

const ALL_NAV_TABS: NavTabItem[] = [
  { id: "sheets", label: "Lembar Kerja Event", shortLabel: "Event", icon: Coins, roles: ["admin", "staff"] },
  { id: "staff-payslips", label: "Staff Payslip & Kasbon", shortLabel: "Payslip", icon: Wallet, roles: ["admin", "staff"] },
  { id: "dashboard", label: "Dashboard & Data", shortLabel: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { id: "finance", label: "Keuangan Mateha", shortLabel: "Keuangan", icon: Landmark, roles: ["admin"] },
  { id: "invoice", label: "Invoice", shortLabel: "Invoice", icon: FileText, roles: ["admin", "finance"] },
  { id: "quotation", label: "Quotation", shortLabel: "Quotation", icon: FileSignature, roles: ["admin", "finance"] },
  { id: "kwitansi", label: "Kwitansi", shortLabel: "Kwitansi", icon: Receipt, roles: ["admin", "finance"] },
  { id: "clients", label: "Database Klien", shortLabel: "Klien", icon: BookUser, roles: ["admin", "finance"] },
  { id: "payslips", label: "Slip Gaji Staff", shortLabel: "Slip Gaji", icon: Banknote, roles: ["admin"] },
  { id: "users", label: "Manajemen Staff", shortLabel: "Staff", icon: UserCog, roles: ["admin"] },
];

// Local Storage resilient caching helpers for Firestore offline/quota fallback
const loadCachedData = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

const saveCachedData = (key: string, data: any) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
};

export default function App() {
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Core Projects database (linked to Firestore)
  const [privateProjects, setPrivateProjects] = useState<EventProject[]>(() => 
    loadCachedData<EventProject[]>("mateha_cached_private_projects", [])
  );
  const [publicProjects, setPublicProjects] = useState<EventProject[]>(() => 
    loadCachedData<EventProject[]>("mateha_cached_public_projects", [])
  );
  const [searchQuery, setSearchQuery] = useState("");
  const projects = useMemo(() => {
    // Merge, ensuring no duplicates based on ID
    const map = new Map<string, EventProject>();
    [...privateProjects, ...publicProjects].forEach(p => map.set(p.id, p));
    return Array.from(map.values());
  }, [privateProjects, publicProjects]);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabType>("sheets");

  // Navigation layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("mateha_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState<boolean>(false);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      try {
        localStorage.setItem("mateha_sidebar_collapsed", String(!prev));
      } catch {
        // Storage unavailable (private mode); keep in-memory state only
      }
      return !prev;
    });
  };

  // Custom Roles & feature permissions from settings
  const [customRoles, setCustomRoles] = useState<CustomRole[]>(() => 
    loadCachedData<CustomRole[]>("mateha_cached_custom_roles", [])
  );
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(false);

  const checkQuotaError = (err: unknown, context?: string) => {
    const msg = String(err).toLowerCase();
    const code = ((err as any)?.code || "").toLowerCase();
    const isQuota = msg.includes("quota") || code === "resource-exhausted" || msg.includes("resource-exhausted");
    if (isQuota) {
      setIsQuotaExceeded(true);
      console.warn(`[Firestore Quota] ${context ? context + ": " : ""}Free daily read quota reached. Using cached/local data.`);
      return true;
    }
    return false;
  };

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "custom_roles"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const roles = data.roles || [];
          setCustomRoles(roles);
          saveCachedData("mateha_cached_custom_roles", roles);
        }
      },
      (err) => {
        if (!checkQuotaError(err, "Custom Roles")) {
          console.error("Error loading custom roles in App.tsx:", err);
        }
      }
    );
    return () => unsub();
  }, []);

  const availableTabs = useMemo(() => {
    if (!userProfile) return [];

    const userRoleKey = (userProfile.role || "staff").toLowerCase().trim();

    // Check if role has configured allowedTabs in customRoles
    const matchedRole = customRoles.find(
      (r) => r.id.toLowerCase() === userRoleKey || r.name.toLowerCase() === userRoleKey
    );

    if (userRoleKey === "admin") {
      const allowed = matchedRole && Array.isArray(matchedRole.allowedTabs) && matchedRole.allowedTabs.length > 0
        ? matchedRole.allowedTabs
        : ALL_NAV_TABS.map((t) => t.id);
      // Guarantee admin always retains 'users' tab so they can manage permissions & roles
      const guaranteed = allowed.includes("users") ? allowed : [...allowed, "users" as TabType];
      return ALL_NAV_TABS.filter((t) => guaranteed.includes(t.id));
    }

    if (matchedRole && Array.isArray(matchedRole.allowedTabs) && matchedRole.allowedTabs.length > 0) {
      return ALL_NAV_TABS.filter((t) => matchedRole.allowedTabs!.includes(t.id));
    }

    // Default fallbacks if custom_roles not yet customized
    if (userRoleKey === "finance") {
      return ALL_NAV_TABS.filter((t) => ["invoice", "quotation", "kwitansi", "clients"].includes(t.id));
    }
    return ALL_NAV_TABS.filter((t) => ["sheets", "staff-payslips"].includes(t.id));
  }, [userProfile, customRoles]);

  const currentTabItem = useMemo(() => {
    return ALL_NAV_TABS.find((t) => t.id === activeTab) || ALL_NAV_TABS[0];
  }, [activeTab]);

  // Sorting order for projects
  const [projectSortOrder, setProjectSortOrder] = useState<"newest_date" | "oldest_date" | "newest_created" | "oldest_created" | "name_asc" | "name_desc">("newest_date");

  // Sorted projects list memo
  const sortedProjects = useMemo(() => {
    let filtered = projects.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.location.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (projectSortOrder === "newest_date") {
        return getProjectEarliestTimestamp(b) - getProjectEarliestTimestamp(a);
      } else if (projectSortOrder === "oldest_date") {
        return getProjectEarliestTimestamp(a) - getProjectEarliestTimestamp(b);
      } else if (projectSortOrder === "newest_created") {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      } else if (projectSortOrder === "oldest_created") {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      } else if (projectSortOrder === "name_asc") {
        return a.name.localeCompare(b.name, "id");
      } else {
        return b.name.localeCompare(a.name, "id");
      }
    });
  }, [projects, projectSortOrder, searchQuery]);

  const groupedProjects = useMemo(() => {
    return sortedProjects.reduce((acc, proj) => {
      // Very simple parsing, assuming "DD Month YYYY" or similar
      const parts = proj.date.split(' ');
      const monthYear = parts.length >= 3 ? `${parts[1]} ${parts[2]}` : "Tanpa Tanggal";
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(proj);
      return acc;
    }, {} as Record<string, EventProject[]>);
  }, [sortedProjects]);

  // Share link query states
  const [sharedProjectId, setSharedProjectId] = useState<string | null>(null);
  const [sharedProject, setSharedProject] = useState<EventProject | null>(null);
  const [sharedPayslipId, setSharedPayslipId] = useState<string | null>(null);
  const [sharedPayslip, setSharedPayslip] = useState<PublishedPayslip | null>(null);

  // Global staff role presets loaded from /settings/staff_presets
  const [staffPresets, setStaffPresets] = useState<StaffRolePreset[]>(() => 
    loadCachedData<StaffRolePreset[]>("mateha_cached_staff_presets", [])
  );
  const [dbMembers, setDbMembers] = useState<string[]>(() => 
    loadCachedData<string[]>("mateha_cached_db_members", [])
  );
  const [dbUsers, setDbUsers] = useState<UserProfile[]>(() => 
    loadCachedData<UserProfile[]>("mateha_cached_db_users", [])
  );

  // New project inline form state
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [newProjDate, setNewProjDate] = useState("");
  const [newProjDates, setNewProjDates] = useState<string[]>([]);
  const [newProjLocation, setNewProjLocation] = useState("");

  // AI Scan states for spreadsheet OCR and parsing
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [isScanLoading, setIsScanLoading] = useState(false);
  const [scanStep, setScanStep] = useState("");
  const [parsedProjects, setParsedProjects] = useState<any[] | null>(null);
  const [selectedScanImage, setSelectedScanImage] = useState<string | null>(null);

  // Custom Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: "delete" | "warning";
  } | null>(null);

  // Feedback notifications as Modal Pop up
  const [popupNotification, setPopupNotification] = useState<PopupNotificationState | null>(null);

  // Utility to trigger visual pop up notifications
  const triggerNotification = (
    text: string,
    type: "success" | "error" | "warning" | "info" = "success",
    title?: string
  ) => {
    const defaultTitles: Record<string, string> = {
      success: "Berhasil",
      error: "Perhatian / Terjadi Kesalahan",
      warning: "Peringatan",
      info: "Pemberitahuan Sistem",
    };
    setPopupNotification({
      isOpen: true,
      type,
      title: title || defaultTitles[type] || "Pemberitahuan",
      message: text,
      confirmText: "OK, Mengerti",
      autoCloseMs: type === "success" ? 4000 : undefined,
    });
  };

  useEffect(() => {
    setGlobalNotificationListener((state) => {
      setPopupNotification(state);
    });
    const handleCustomEvent = (e: any) => {
      if (e.detail) {
        setPopupNotification(e.detail);
      }
    };
    window.addEventListener("app:show-notification", handleCustomEvent);
    return () => {
      setGlobalNotificationListener(null);
      window.removeEventListener("app:show-notification", handleCustomEvent);
    };
  }, []);

  // 1. Initial configuration parse and auth observer
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sId = urlParams.get("shareProject");
    if (sId) {
      setSharedProjectId(sId);
    }
    const sPId = urlParams.get("sharePayslip");
    if (sPId) {
      setSharedPayslipId(sPId);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time listing of the user's OWN projects AND public projects
  useEffect(() => {
    // If not logged in and we are viewing a shared project, we don't need to load other project lists.
    // This avoids permission errors or index issues for guest users.
    if (!user && sharedProjectId) {
      setPublicProjects([]);
      setPrivateProjects([]);
      return;
    }

    const projectsRef = collection(db, "projects");
    let unsubUser: (() => void) | null = null;
    let unsubPublic: (() => void) | null = null;

    try {
      // Listener for public projects (everyone can see)
      const publicQuery = query(projectsRef, where("isPublic", "==", true));
      unsubPublic = onSnapshot(
        publicQuery, 
        (snapshot) => {
          const publicList: EventProject[] = [];
          snapshot.forEach((snap) => publicList.push(snap.data() as EventProject));
          setPublicProjects(publicList);
          saveCachedData("mateha_cached_public_projects", publicList);
        },
        (error) => {
          if (!checkQuotaError(error, "Public Projects")) {
            console.warn("Public query failed or is not accessible:", error);
          }
        }
      );
    } catch (e) {
      if (!checkQuotaError(e, "Public Query Init")) {
        console.error("Failed to construct or attach public query:", e);
      }
    }

    if (user) {
      try {
        // Listener for all projects for logged-in users
        const allProjectsQuery = query(projectsRef);
        unsubUser = onSnapshot(allProjectsQuery, async (snapshot) => {
          const allList: EventProject[] = [];
          snapshot.forEach((snap) => allList.push(snap.data() as EventProject));
          setPrivateProjects(allList);
          saveCachedData("mateha_cached_private_projects", allList);
        }, (error) => {
          if (!checkQuotaError(error, "User Projects")) {
            console.error("Failed to load user projects:", error);
          }
        });
      } catch (e) {
        if (!checkQuotaError(e, "User Projects Init")) {
          console.error("Failed to construct or attach user projects query:", e);
        }
      }
    } else {
        setPrivateProjects([]);
    }

    return () => {
      if (unsubUser) unsubUser();
      if (unsubPublic) unsubPublic();
    };
  }, [user, sharedProjectId]);

  // 2.5 Real-time fetch of userProfile (roles & username)
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    const docRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      const isOwnerEmail = user.email && (
        user.email.toLowerCase() === "dhifahermawan@gmail.com" || 
        user.email.toLowerCase().startsWith("admin@")
      );

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        // Dynamically elevate owner to admin in Firestore database
        if (isOwnerEmail && data.role !== "admin") {
          const elevated = { ...data, role: "admin" as const };
          setDoc(docRef, elevated).catch(err => {
            if (!checkQuotaError(err, "Elevation")) console.error("Elevation error:", err);
          });
          setUserProfile(elevated);
          saveCachedData("mateha_cached_user_profile_" + user.uid, elevated);
        } else {
          setUserProfile(data);
          saveCachedData("mateha_cached_user_profile_" + user.uid, data);
        }
      } else {
        const fallbackProfile: UserProfile = {
          uid: user.uid,
          username: user.email ? user.email.split("@")[0] : "Tamu Lapangan",
          role: isOwnerEmail ? "admin" : "staff",
        };
        // Save fallback profile safely to database
        setDoc(docRef, fallbackProfile).catch(err => {
          if (!checkQuotaError(err, "Fallback Profile")) console.error("Error setting fallback user profile:", err);
        });
        setUserProfile(fallbackProfile);
        saveCachedData("mateha_cached_user_profile_" + user.uid, fallbackProfile);
      }
    }, (error) => {
      if (!checkQuotaError(error, "User Profile")) {
        console.error("Failed to read user roles:", error);
      }
      // Resilience fallback: Ensure user is not blocked on loading screen if Firestore quota is exceeded
      const isOwnerEmail = user.email && (
        user.email.toLowerCase() === "dhifahermawan@gmail.com" || 
        user.email.toLowerCase().startsWith("admin@")
      );
      setUserProfile((prev) => prev || loadCachedData<UserProfile | null>("mateha_cached_user_profile_" + user.uid, {
        uid: user.uid,
        username: user.email ? user.email.split("@")[0] : "Pengguna",
        role: isOwnerEmail ? "admin" : "staff",
      }));
    });

    return () => unsubscribe();
  }, [user]);

  // 2.7 Real-time global staff role presets list fetch
  useEffect(() => {
    if (!user) {
      setStaffPresets([]);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, "settings", "staff_presets"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const presets = data.presets || [];
          const members = data.members || [];
          setStaffPresets(presets);
          setDbMembers(members);
          saveCachedData("mateha_cached_staff_presets", presets);
          saveCachedData("mateha_cached_db_members", members);
        } else {
          setStaffPresets([]);
          setDbMembers([]);
        }
      },
      (error) => {
        if (!checkQuotaError(error, "Staff Presets")) {
          console.error("Failed to load staff presets in App.tsx:", error);
        }
      }
    );
    return () => unsubscribe();
  }, [user]);

  // 2.8 Real-time registered users list fetch (Daftar Anggota Tim)
  useEffect(() => {
    if (!user && !sharedProjectId) {
      setDbUsers([]);
      return;
    }
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const list: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as UserProfile);
        });
        setDbUsers(list);
        saveCachedData("mateha_cached_db_users", list);
      },
      (error) => {
        if (!checkQuotaError(error, "Registered Users")) {
          console.error("Failed to load registered users in App.tsx:", error);
        }
      }
    );
    return () => unsubscribe();
  }, [user, sharedProjectId]);

  // Landing page right after login: admins start on the Dashboard, other members on Staff Payslip
  const landingAppliedFor = React.useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      landingAppliedFor.current = null;
      return;
    }
    if (!userProfile || availableTabs.length === 0 || sharedProjectId || landingAppliedFor.current === user.uid) return;
    landingAppliedFor.current = user.uid;

    const isAdminRole = (userProfile.role || "").toLowerCase() === "admin";
    const preferred: TabType = isAdminRole ? "dashboard" : "staff-payslips";
    setActiveTab(availableTabs.some((t) => t.id === preferred) ? preferred : availableTabs[0].id);
  }, [user, userProfile, availableTabs, sharedProjectId]);

  // Keep user inside valid tabs according to role permissions
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  // 3. Real-time listing of the shared collaborative project (accessible to everyone without login)
  useEffect(() => {
    if (!sharedProjectId) {
      setSharedProject(null);
      return;
    }

    const docRef = doc(db, "projects", sharedProjectId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as EventProject;
        setSharedProject(data);
      } else {
        triggerNotification("Sesi kolaborasi tidak ditemukan atau telah kadaluarsa.", "error");
        setSharedProject(null);
      }
    }, (error) => {
      console.error("DEBUG: Listener error for shared projects:", error);
      if (error.code === 'permission-denied') {
        triggerNotification("Anda tidak memiliki akses ke proyek ini atau proyek bersifat privat.", "error");
      } else {
        handleFirestoreError(error, OperationType.GET, `projects/${sharedProjectId}`);
      }
    });

    return () => unsubscribe();
  }, [sharedProjectId, user]);

  // 3.5 Fetch shared payslip (accessible to everyone without login)
  useEffect(() => {
    if (!sharedPayslipId) {
      setSharedPayslip(null);
      return;
    }

    const fetchPayslip = async () => {
      try {
        const docRef = doc(db, "shared-payslips", sharedPayslipId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSharedPayslip(snap.data() as PublishedPayslip);
        } else {
          triggerNotification("Payslip tidak ditemukan.", "error");
          setSharedPayslip(null);
        }
      } catch (error) {
        console.error("Error fetching shared payslip:", error);
      }
    };

    fetchPayslip();
  }, [sharedPayslipId]);

  // Active loaded project object
  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) || null;
  }, [projects, activeProjectId]);

  // Add new project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) {
      triggerNotification("Nama project tidak boleh kosong!", "error");
      return;
    }
    if (!user) return;

    const projId = `project-${Date.now()}`;
    const newProj: EventProject = {
      id: projId,
      name: newProjName.trim(),
      date: newProjDate.trim() || "Belum ditentukan",
      dates: newProjDates,
      location: newProjLocation.trim() || "Belum ditentukan",
      createdAt: new Date().toISOString(),
      rab: {
        income: [],
        accommodation: [],
        sharingRatio: { ...DEFAULT_SHARING_RATIO },
        picBonusRatio: DEFAULT_PIC_BONUS_RATIO,
        feeDistribution: []
      },
      realisasi: {
        income: [],
        accommodation: [],
        sharingRatio: { ...DEFAULT_SHARING_RATIO },
        picBonusRatio: DEFAULT_PIC_BONUS_RATIO,
        feeDistribution: []
      }
    };

    try {
      await setDoc(doc(db, "projects", projId), sanitizeForFirestore({ ...newProj, ownerId: user.uid }));
      setActiveProjectId(projId);
      setIsAddingProject(false);
      setNewProjName("");
      setNewProjDate("");
      setNewProjDates([]);
      setNewProjLocation("");
      setActiveTab("sheets");
      triggerNotification("Project baru berhasil ditambahkan ke cloud database!");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `projects/${projId}`);
    }
  };

  // Creates a project from a draft prepared by the AI assistant (same shape as handleCreateProject)
  const handleCreateProjectFromAi = async (draft: AiEventDraft) => {
    if (!user) return;
    const projId = `project-${Date.now()}`;
    const toItems = (rows: AiEventDraft["income"], prefix: string): BudgetItem[] =>
      rows.map((r, i) => ({
        id: `${prefix}-${Date.now()}-${i}`,
        num: i + 1,
        description: r.description,
        qty: r.qty,
        expense: r.expense,
        notes: r.notes || "",
      }));

    const newProj: EventProject = {
      id: projId,
      name: draft.name.trim(),
      date: draft.dates.length ? formatMultiDates(draft.dates) : "Belum ditentukan",
      dates: draft.dates,
      location: draft.location.trim() || "Belum ditentukan",
      createdAt: new Date().toISOString(),
      rab: {
        income: toItems(draft.income, "ai-in"),
        accommodation: toItems(draft.accommodation, "ai-ac"),
        sharingRatio: { ...DEFAULT_SHARING_RATIO },
        picBonusRatio: DEFAULT_PIC_BONUS_RATIO,
        feeDistribution: toItems(draft.feeDistribution, "ai-fee")
      },
      realisasi: {
        income: [],
        accommodation: [],
        sharingRatio: { ...DEFAULT_SHARING_RATIO },
        picBonusRatio: DEFAULT_PIC_BONUS_RATIO,
        feeDistribution: []
      }
    };

    await setDoc(doc(db, "projects", projId), sanitizeForFirestore({ ...newProj, ownerId: user.uid }));
    setActiveProjectId(projId);
    setActiveTab("sheets");
    window.scrollTo({ top: 0 });
    triggerNotification(`Event "${newProj.name}" berhasil dibuat oleh Asisten AI!`);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedScanImage(reader.result as string);
      setParsedProjects(null); // Clear previous scan result
    };
    reader.readAsDataURL(file);
  };

  // Trigger Gemini spreadsheet OCR and parser
  const handleProcessAIScan = async () => {
    if (!selectedScanImage) {
      triggerNotification("Silakan pilih gambar screenshot spreadsheet terlebih dahulu", "error");
      return;
    }

    setIsScanLoading(true);
    setScanStep("Mempersiapkan gambar untuk analisis AI...");

    const stepMessages = [
      "Mempersiapkan gambar untuk analisis AI...",
      "Mengirimkan screenshot ke Gemini 3.5 Flash...",
      "Menganalisis tabel RANCANGAN ANGGARAN BIAYA PROJEK (RAB)...",
      "Menganalisis tabel REPORT ANGGARAN BIAYA PROJEK (Realisasi/Laporan)...",
      "Mengekstrak rincian Pemasukan, Akomodasi, dan Bagi Hasil...",
      "Memproses struktur JSON dan melakukan validasi mata uang..."
    ];

    let messageIndex = 0;
    const intervalId = setInterval(() => {
      if (messageIndex < stepMessages.length - 1) {
        messageIndex++;
        setScanStep(stepMessages[messageIndex]);
      }
    }, 3500);

    try {
      const response = await fetch("/api/gemini/parse-rab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: selectedScanImage }),
      });

      clearInterval(intervalId);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal memproses gambar");
      }

      setParsedProjects(data.projects);
      triggerNotification(`AI Berhasil menganalisis spreadsheet! Ditemukan ${data.projects?.length || 0} event.`);
    } catch (err: any) {
      clearInterval(intervalId);
      console.error(err);
      triggerNotification("Gagal melacak spreadsheet: " + err.message, "error");
    } finally {
      setIsScanLoading(false);
    }
  };

  // Save the parsed spreadsheet projects into Firestore
  const handleSaveParsedProjects = async () => {
    if (!parsedProjects || parsedProjects.length === 0 || !user) return;

    let successCount = 0;
    try {
      for (const extracted of parsedProjects) {
        const projId = `project-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${user.uid}`;

        // Helper to map and sanitize sub-items returning consistent unique IDs
        const transformItems = (items: any[] | undefined, prefix: string) => {
          if (!items) return [];
          return items.map((item, idx) => ({
            id: `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-idx-${idx}`,
            num: item.num || idx + 1,
            description: item.description || "",
            qty: Number(item.qty) || 1,
            expense: Number(item.expense) || 0,
            notes: item.notes || ""
          }));
        };

        const newProj: EventProject = {
          id: projId,
          name: extracted.name || `Proyek Ekstraksi AI ${successCount + 1}`,
          date: extracted.date || "Belum ditentukan",
          dates: parseIndonesianDateText(extracted.date || ""),
          location: extracted.location || "Belum ditentukan",
          createdAt: new Date().toISOString(),
          paymentStatus: "belum", // Empty as requested ("seperti DP atau lunas dikosongkan")
          dpAmount: 0,
          rab: {
            income: transformItems(extracted.rab?.income, "rab-in"),
            accommodation: transformItems(extracted.rab?.accommodation, "rab-ac"),
            sharingRatio: extracted.rab?.sharingRatio || { ...DEFAULT_SHARING_RATIO },
            picBonusRatio: Number(extracted.rab?.picBonusRatio) || DEFAULT_PIC_BONUS_RATIO,
            feeDistribution: transformItems(extracted.rab?.feeDistribution, "rab-fd")
          },
          realisasi: {
            income: transformItems(extracted.realisasi?.income, "rel-in"),
            accommodation: transformItems(extracted.realisasi?.accommodation, "rel-ac"),
            sharingRatio: extracted.realisasi?.sharingRatio || { ...DEFAULT_SHARING_RATIO },
            picBonusRatio: Number(extracted.realisasi?.picBonusRatio) || DEFAULT_PIC_BONUS_RATIO,
            feeDistribution: transformItems(extracted.realisasi?.feeDistribution, "rel-fd")
          }
        };

        await setDoc(doc(db, "projects", projId), { ...newProj, ownerId: user.uid });
        successCount++;

        if (successCount === 1) {
          setActiveProjectId(projId);
        }
      }

      setIsScanningAI(false);
      setParsedProjects(null);
      setSelectedScanImage(null);
      setActiveTab("sheets");
      triggerNotification(`Berhasil membuat ${successCount} Event baru dari unggahan spreadsheet!`);
    } catch (err: any) {
      console.error(err);
      triggerNotification("Gagal menyimpan event AI: " + err.message, "error");
    }
  };

  // Delete project
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const projName = projects.find(p => p.id === id)?.name || "Event";
    setConfirmModal({
      isOpen: true,
      title: "Hapus Event Secara Permanen",
      message: `Apakah anda yakin ingin menghapus Event "${projName}"? Seluruh data budgeting (RAB) dan realisasi akan hilang secara permanen dari server database.`,
      confirmText: "Ya, Hapus Permanen",
      cancelText: "Batal",
      type: "delete",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "projects", id));
          triggerNotification("Proyek berhasil dihapus.");
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `projects/${id}`);
        }
        setConfirmModal(null);
      }
    });
  };

  // Reset user projects back to seed examples in Firestore
  const handleResetToMocks = async () => {
    if (!user) return;
    setConfirmModal({
      isOpen: true,
      title: "Reset Semua Data Projek",
      message: "Apakah anda yakin ingin mereset seluruh data kembali ke rancangan contoh bawaan? Semua perubahan pribadi anda di cloud akan dihapus secara permanen.",
      confirmText: "Ya, Reset Semua",
      cancelText: "Batal",
      type: "delete",
      onConfirm: async () => {
        try {
          // Delete all current owned projects from database
          for (const proj of projects) {
            await deleteDoc(doc(db, "projects", proj.id));
          }
          // Write the defaults
          for (const proj of INITIAL_PROJECTS) {
            const docId = `${proj.id}-${user.uid}`;
            const customizedProj: EventProject = {
              ...proj,
              id: docId,
              ownerId: user.uid,
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, "projects", docId), customizedProj);
          }
          triggerNotification("Data cloud berhasil di-reset ke data default!");
        } catch (err) {
          triggerNotification("Gagal me-reset data. Silakan hubungi admin.", "error");
        }
        setConfirmModal(null);
      }
    });
  };

  // Copy whole rab config to realisasi
  const handleCopyRABToRealisasi = async () => {
    if (!activeProject || !user) return;

    const proceedWithCloning = async () => {
      const clonedIncome = activeProject.rab.income.map((item) => ({ ...item, id: `rel-in-cloned-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` }));
      const clonedAccommodation = activeProject.rab.accommodation.map((item) => ({ ...item, id: `rel-ac-cloned-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` }));
      const clonedFeeDistribution = activeProject.rab.feeDistribution.map((item) => ({ ...item, id: `rel-fd-cloned-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` }));

      const updatedProject = {
        ...activeProject,
        realisasi: {
          income: clonedIncome,
          accommodation: clonedAccommodation,
          sharingRatio: { ...activeProject.rab.sharingRatio },
          picBonusRatio: activeProject.rab.picBonusRatio,
          feeDistribution: clonedFeeDistribution
        }
      };

      try {
        await setDoc(doc(db, "projects", activeProject.id), updatedProject);
        triggerNotification("Seluruh rancangan anggaran (RAB) berhasil disalin ke Lembar Realisasi!");
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `projects/${activeProject.id}`);
      }
    };

    if (
      activeProject.realisasi.income.length > 0 ||
      activeProject.realisasi.accommodation.length > 0 ||
      activeProject.realisasi.feeDistribution.length > 0
    ) {
      setConfirmModal({
        isOpen: true,
        title: "Tulis Ulang Lembar Realisasi",
        message: "Lembar Realisasi anda saat ini tidak kosong. Menyalin RAB akan menggantikan pengeluaran & pemasukan realisasi anda saat ini. Lanjutkan?",
        confirmText: "Ya, Salin & Timpa",
        cancelText: "Batal",
        type: "warning",
        onConfirm: () => {
          proceedWithCloning();
          setConfirmModal(null);
        }
      });
    } else {
      await proceedWithCloning();
    }
  };

  // Save changes to RAB and Realisasi tables directly off to cloud database
  const handleUpdateRAB = async (updatedRAB: ProjectBudget) => {
    if (!activeProject) return;
    
    // Automatically keep realisasi.income synced with rab.income, and sync picBonusStaff
    const updatedRealisasi = {
      ...activeProject.realisasi,
      income: updatedRAB.income.map((item) => ({
        ...item,
        id: item.id.startsWith("rel-") ? item.id : `rel-in-sync-${item.id}`
      })),
      ...(updatedRAB.picBonusStaff !== undefined ? { picBonusStaff: updatedRAB.picBonusStaff } : {})
    };

    const updated = { 
      ...activeProject, 
      rab: updatedRAB, 
      realisasi: updatedRealisasi 
    };
    setPrivateProjects(prev => prev.map(p => p.id === activeProject.id ? updated : p));
    try {
      await setDoc(doc(db, "projects", activeProject.id), sanitizeForFirestore(updated));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${activeProject.id}`);
    }
  };

  const handleUpdateRealisasi = async (updatedRealisasi: ProjectBudget) => {
    if (!activeProject) return;
    const updated = { 
      ...activeProject, 
      realisasi: updatedRealisasi,
      ...(updatedRealisasi.picBonusStaff !== undefined ? { rab: { ...activeProject.rab, picBonusStaff: updatedRealisasi.picBonusStaff } } : {})
    };
    setPrivateProjects(prev => prev.map(p => p.id === activeProject.id ? updated : p));
    try {
      await setDoc(doc(db, "projects", activeProject.id), sanitizeForFirestore(updated));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${activeProject.id}`);
    }
  };

  // Update active project info
  const handleUpdateProjectInfo = async (
    field: "name" | "date" | "location" | "paymentStatus" | "dpAmount" | "picBonusStaff",
    value: any
  ) => {
    if (!activeProject) return;
    
    let updated = { ...activeProject };
    
    if (field === "picBonusStaff") {
       updated = {
         ...updated,
         rab: { ...updated.rab, picBonusStaff: value },
         realisasi: { ...updated.realisasi, picBonusStaff: value }
       };
    } else {
       const finalValue = field === "dpAmount" ? (Number(value) || 0) : value;
       updated = { ...updated, [field]: finalValue };
    }

    try {
      await setDoc(doc(db, "projects", activeProject.id), sanitizeForFirestore(updated));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${activeProject.id}`);
    }
  };

  // Update active project dates
  const handleUpdateProjectDates = async (dates: string[], formatted: string) => {
    if (!activeProject) return;
    const updated = { 
      ...activeProject, 
      dates: dates, 
      date: formatted 
    };
    try {
      await setDoc(doc(db, "projects", activeProject.id), sanitizeForFirestore(updated));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${activeProject.id}`);
    }
  };

  // Generate Section B Share links
  const handleSharePointB = () => {
    if (!activeProject) return;
    const shareLink = `${window.location.origin}?shareProject=${activeProject.id}`;
    navigator.clipboard.writeText(shareLink);
    triggerNotification("Link kolaborasi Point B berhasil disalin ke clipboard! Bagikan tautan ini ke tim lapangan.");
  };

  // Toggle Point B share lock & staff reimbursement input
  const handleTogglePointB = async () => {
    if (!activeProject) return;
    try {
      const updatedClosed = !activeProject.isPointBClosed;
      const docRef = doc(db, "projects", activeProject.id);
      await setDoc(docRef, { isPointBClosed: updatedClosed }, { merge: true });
      triggerNotification(
        updatedClosed
          ? `Akses Point B & Reimburse event "${activeProject.name}" DITUTUP (link share nonaktif & event disembunyikan dari pengajuan reimburse staf).`
          : `Akses Point B & Reimburse event "${activeProject.name}" DIBUKA KEMBALI (staf dapat memilih event ini untuk mencatat reimburse).`,
        "success"
      );
    } catch (err: any) {
      triggerNotification("Gagal mengubah status akses: " + err.message, "error");
      handleFirestoreError(err, OperationType.UPDATE, `projects/${activeProject.id}`);
    }
  };

  // Toggle Project Visibility
  const handleToggleProjectPublic = async (proj: EventProject) => {
    try {
      await setDoc(doc(db, "projects", proj.id), { ...proj, isPublic: !proj.isPublic });
      triggerNotification(`Proyek ${proj.name} sekarang ${!proj.isPublic ? "Public" : "Private"}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${proj.id}`);
    }
  };

  // Clean collaborative URL parameter to return to master dashboard
  const handleClearShareProject = () => {
    setSharedProjectId(null);
    setSharedProject(null);
    window.history.pushState({}, document.title, window.location.pathname);
  };

  // Generate WhatsApp summary report
  const handleShareReport = () => {
    if (!activeProject) return;
    const calcRab = calculateProjectBudget(activeProject.rab);
    const calcReal = calculateProjectBudget(activeProject.realisasi);

    const text = `*LAPORAN KEUANGAN MATEHA PRODUCTION*
===============================
📌 *Event:* ${activeProject.name}
📅 *Tanggal:* ${activeProject.date}
📍 *Sektor/Lokasi:* ${activeProject.location}

-------------------------------
💰 *RANCANGAN ANGGARAN (RAB):*
• Total Income (A): ${formatRupiah(calcRab.totalIncome)}
• Total Operasional (B): ${formatRupiah(calcRab.totalAccommodation)}
• Keuntungan Distribusi (Net): ${formatRupiah(calcRab.netIncome)}
• Jatah Perusahaan Mateha (25%): ${formatRupiah(calcRab.matehaShare)}
• Jatah Pool Gaji Staf (70%): ${formatRupiah(calcRab.staffPool)}
• Total Gaji Terbayar (D): ${formatRupiah(calcRab.totalFeeDistribution)}
• PIC Bonus (${activeProject.rab.picBonusRatio}%): ${formatRupiah(calcRab.picBonus)}
• *PROFIT NETTO MATEHA:* ${formatRupiah(calcRab.matehaProfit)}

-------------------------------
📊 *REALISASI BIAYA LAPORAN:*
• Total Income (A): ${formatRupiah(calcReal.totalIncome)}
• Total Operasional (B): ${formatRupiah(calcReal.totalAccommodation)}
• Keuntungan Distribusi (Net): ${formatRupiah(calcReal.netIncome)}
• Jatah Perusahaan Mateha (25%): ${formatRupiah(calcReal.matehaShare)}
• Jatah Pool Gaji Staf (70%): ${formatRupiah(calcReal.staffPool)}
• Total Gaji Terbayar (D): ${formatRupiah(calcReal.totalFeeDistribution)}
• PIC Bonus (${activeProject.realisasi.picBonusRatio}%): ${formatRupiah(calcReal.picBonus)}
• *PROFIT NETTO MATEHA:* ${formatRupiah(calcReal.matehaProfit)}

*Selisih Profit Realisasi vs RAB:* ${formatRupiah(calcReal.matehaProfit - calcRab.matehaProfit)} ${calcReal.matehaProfit >= calcRab.matehaProfit ? "📈 (Hemat/Lebih Untung)" : "📉 (Overbudget)"}
===============================
_Sistem Keuangan Otomatis Mateha Production_`;

    navigator.clipboard.writeText(text);
    triggerNotification("Format Laporan Ringkas berhasil disalin ke clipboard! Siap di-paste ke WhatsApp.");
  };

  // Import state from uploaded JSON inside Firestore on active login
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileReader = new FileReader();
    fileReader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        
        // Cek format komprehensif baru
        if (parsed.version && parsed.collections) {
          triggerNotification("Memulai pemulihan seluruh database...");
          
          const collectionsToImport = Object.keys(parsed.collections);
          for (const collName of collectionsToImport) {
            const items = parsed.collections[collName];
            if (Array.isArray(items)) {
              for (const item of items) {
                // Jangan mengubah ID aslinya jika tidak diperlukan
                await setDoc(doc(db, collName, item.id), item);
              }
            }
          }
          triggerNotification("Seluruh database Mateha berhasil dipulihkan secara komprehensif!");
        } 
        // Fallback untuk format array legacy (hanya proyek)
        else if (Array.isArray(parsed) && parsed.length > 0) {
          const isValid = parsed.every((p) => p.name && p.rab && p.realisasi);
          if (isValid) {
            for (const item of parsed) {
              const cloudId = `${item.id}-${user.uid}`;
              await setDoc(doc(db, "projects", cloudId), {
                ...item,
                id: cloudId,
                ownerId: user.uid,
                createdAt: new Date().toISOString()
              });
            }
            triggerNotification("Data event berhasil dipulihkan dari format legacy!");
          } else {
            triggerNotification("Format file cadangan tidak valid.", "error");
          }
        } else {
          triggerNotification("Format file tidak dikenali.", "error");
        }
      } catch (err) {
        triggerNotification("Gagal membaca file JSON.", "error");
      }
    };
    fileReader.readAsText(files[0]);
  };

  const handleLogout = () => {
    signOut(auth);
    setUser(null);
    triggerNotification("Berhasil keluar dari sistem.", "success");
  };

  // SVG Bar analytics calculations
  const activeProjectSummary = useMemo(() => {
    if (!activeProject) return null;
    const rabCalc = calculateProjectBudget(activeProject.rab);
    const realCalc = calculateProjectBudget(activeProject.realisasi);
    return {
      rab: rabCalc,
      real: realCalc
    };
  }, [activeProject]);

  // Loader state rendering
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080a0f] flex flex-col items-center justify-center text-slate-400 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mb-4" />
        <span className="text-xs font-mono uppercase tracking-wider">Memuat Sistem Keamanan...</span>
      </div>
    );
  }

  // If there is a sharedPayslipId and the sharedPayslip is not yet loaded, show loader
  if (sharedPayslipId && !sharedPayslip) {
    return (
      <div className="min-h-screen bg-[#080a0f] flex flex-col items-center justify-center text-slate-400 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mb-4" />
        <span className="text-xs font-mono uppercase tracking-wider">Memuat Slip Gaji...</span>
      </div>
    );
  }

  // If we have a sharedPayslip loaded, show it immediately (regardless of login status)
  if (sharedPayslip) {
      return <PublicPayslipView payslip={sharedPayslip} />;
  }

  // If there is a sharedProjectId and the sharedProject is not yet loaded, show loader
  if (sharedProjectId && !sharedProject) {
    return (
      <div className="min-h-screen bg-[#080a0f] flex flex-col items-center justify-center text-slate-400 font-sans p-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mb-4" />
        <span className="text-xs font-mono uppercase tracking-wider mb-6">Memuat Tautan Kolaborasi Lapangan...</span>
        <button
          onClick={handleClearShareProject}
          className="bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 py-2.5 px-5 rounded-xl text-xs font-bold transition duration-150 cursor-pointer"
        >
          Batal & Kembali ke Login
        </button>
      </div>
    );
  }

  // Under Section B collaboration share links (logged in or guest / everyone)
  const isCollaborationMode = !!(sharedProjectId && sharedProject);
  if (isCollaborationMode) {
    if (sharedProject.isPointBClosed) {
      return (
        <div className="min-h-screen bg-[#080a0f] flex flex-col items-center justify-center text-slate-400 font-sans p-6 text-center animate-fade-in">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-3xl flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-slate-200 mb-2">Sesi Kolaborasi Ditutup</h2>
          <p className="text-sm text-slate-400 max-w-md mb-8">
            Akses pengisian Point B untuk event <span className="text-slate-200 font-semibold">{sharedProject.name}</span> telah ditutup atau kedaluwarsa oleh admin.
          </p>
          <button
            onClick={handleClearShareProject}
            className="bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 py-2.5 px-5 rounded-xl text-xs font-bold transition duration-150 cursor-pointer"
          >
            Batal & Kembali ke Login
          </button>
        </div>
      );
    }

    const virtualEmail = user ? (user.email || "") : "Tim Lapangan (Guest)";
    const authAction = () => {
      if (user) {
        handleLogout();
      } else {
        // Clear share key which effectively goes back to normal login page
        handleClearShareProject();
      }
    };

    return (
      <>
        <CollaborationView
          project={sharedProject}
          userEmail={virtualEmail}
          registeredUsers={dbUsers}
          onLogout={authAction}
          onGoToDashboard={handleClearShareProject}
          onNotify={triggerNotification}
        />
        <NotificationModal 
          popup={popupNotification} 
          onClose={() => setPopupNotification(null)} 
        />
      </>
    );
  }

  // Not Authenticated -> Show login screen (Always)
  if (!user) {
    return <LoginScreen onSuccess={() => triggerNotification("Otentikasi berhasil!")} />;
  }

  // Profile still loading from Firestore
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-[#080a0f] flex flex-col items-center justify-center text-slate-400 font-sans p-6 text-center">
        <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono tracking-wider uppercase text-slate-400">Memuat hak akses akun...</p>
      </div>
    );
  }

  const navUser = {
    username: userProfile?.username || user?.email?.replace("@mateha.local", "") || "user",
    role: (userProfile?.role || "staff").toLowerCase(),
  };

  const handleSelectTab = (id: TabType) => {
    handleClearShareProject();
    setActiveTab(id);
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  // Standard Dashboard & sheets Workspace
  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-white">
      {!!userProfile && (
        <Sidebar
          items={availableTabs}
          activeTab={activeTab}
          onSelect={handleSelectTab}
          collapsed={isSidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          user={navUser}
          logo={logo}
          onChangePassword={() => setIsChangePasswordModalOpen(true)}
          onLogout={handleLogout}
        />
      )}

      <div className={`min-h-screen flex flex-col transition-[padding] duration-200 ${userProfile ? (isSidebarCollapsed ? "lg:pl-[76px]" : "lg:pl-64") : ""}`}>
      {!!userProfile && (
        <MobileTopBar title={currentTabItem.label} logo={logo} user={navUser} onOpenMenu={() => setIsMobileMenuOpen(true)} />
      )}


      {/* GLOBAL POPUP MODAL NOTIFICATION */}
      <NotificationModal 
        popup={popupNotification} 
        onClose={() => setPopupNotification(null)} 
      />

      {/* CORE DISPLAY CANVAS */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-28 lg:pb-10">
        
        {/* COMPACT INTERACTIVE PROJECT SELECTOR / ACTIONS PANEL (Only for sheets & dashboard) */}
        {(activeTab === "sheets" || activeTab === "dashboard") && (
        <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/85 p-5 rounded-2xl mb-6 shadow-xl relative z-30">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            
            {/* Project List dropdown / switcher */}
            <div className="flex items-center flex-wrap gap-2.5">
              <span className="w-full sm:w-auto text-xs font-semibold text-slate-400">Event aktif</span>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <select
                  value={activeProjectId}
                  onChange={(e) => {
                    setActiveProjectId(e.target.value);
                    triggerNotification("Memuat lembar kerja event baru...");
                  }}
                  id="project-selector"
                  className="w-full sm:w-auto sm:max-w-sm min-w-0 bg-slate-950 border border-slate-800 text-slate-200 text-sm sm:text-xs font-bold py-2 sm:py-1.5 px-3.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500/50 cursor-pointer font-sans text-left truncate"
                >
                  {sortedProjects.length === 0 ? (
                    <option value="">(Belum Ada Event)</option>
                  ) : (
                    sortedProjects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name} ({proj.date.split(",")[0]})
                      </option>
                    ))
                  )}
                </select>

                {/* SORTING SELECTOR */}
                <select
                  value={projectSortOrder}
                  onChange={(e) => {
                    setProjectSortOrder(e.target.value as any);
                    triggerNotification("Mengubah urutan event...");
                  }}
                  id="project-sort-selector"
                  className="bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 text-[11px] font-bold py-1.5 px-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500/50 cursor-pointer font-sans"
                  title="Urutkan daftar event"
                >
                  <option value="newest_date">📅 Tanggal Baru → Lama</option>
                  <option value="oldest_date">📅 Tanggal Lama → Baru</option>
                  <option value="newest_created">🆕 Input Baru → Lama</option>
                  <option value="oldest_created">🆕 Input Lama → Baru</option>
                </select>

                {activeProject && !!userProfile && (
                  <button
                    onClick={(e) => handleDeleteProject(activeProjectId, e)}
                    id="btn-delete-active-project"
                    className="p-2 bg-slate-950/60 hover:bg-rose-500/15 text-slate-500 hover:text-rose-400 border border-slate-800 rounded-xl transition cursor-pointer"
                    title="Hapus proyek ini secara permanen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                
                {activeProject && !!userProfile && (
                  <button
                    onClick={() => handleToggleProjectPublic(activeProject)}
                    className={`flex items-center space-x-1.5 py-1.5 px-3 rounded-xl border ${activeProject.isPublic ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-slate-900 border-slate-800 text-slate-400"} text-xs font-semibold hover:opacity-80 transition cursor-pointer`}
                    title="Tampilkan proyek secara publik atau buat private"
                  >
                    <span>{activeProject.isPublic ? "🌎 Public" : "🔒 Private"}</span>
                  </button>
                )}
              </div>

              {!!userProfile && (
                <>

                  {/* Toggle Form to Add new project */}
                  <button
                    onClick={() => setIsAddingProject(!isAddingProject)}
                    id="btn-toggle-add-project"
                    className="flex items-center gap-1.5 bg-slate-900/85 border border-slate-800 hover:bg-slate-800 hover:text-white text-slate-300 font-semibold py-1.5 px-3 rounded-xl text-xs cursor-pointer transition duration-150"
                  >
                    <Plus className="w-3.5 h-3.5 text-slate-400" />
                    <span>Buat Event Baru</span>
                  </button>


                  {/* AI Spreadsheet Upload and Parse Scanner */}
                  <button
                    onClick={() => setIsScanningAI(true)}
                    id="btn-trigger-ai-scan"
                    className="flex items-center gap-1.5 bg-cyan-950/40 border border-cyan-800/60 hover:bg-cyan-900/40 hover:text-white text-cyan-400 font-bold py-1.5 px-3 rounded-xl text-xs cursor-pointer transition duration-150 shadow-md shadow-cyan-950/20"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse animate-duration-3000" />
                    <span>Scan Spreadsheet (AI)</span>
                  </button>
                </>
              )}
            </div>

            {/* Quick Actions for active project */}
            {activeProject && !!userProfile && (
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <button
                  onClick={handleShareReport}
                  className="flex items-center space-x-1.5 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-bold py-1.5 px-3.5 rounded-xl transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Kirim Laporan WA</span>
                </button>
                
                {activeTab === "sheets" ? (
                  <button
                    onClick={handleCopyRABToRealisasi}
                    id="btn-trigger-copy-rab-sheets"
                    className="flex items-center space-x-1.5 bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-350 border border-indigo-500/25 font-bold py-1.5 px-3.5 rounded-xl transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Salin RAB ke Realisasi</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* EXPANDABLE INLINE EVENT CREATOR FORM */}
          <AnimatePresence>
            {isAddingProject && (
              <motion.form
                onSubmit={handleCreateProject}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-4 gap-3 overflow-visible text-xs text-left"
              >
                <div>
                  <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[10px]">Nama Event *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CSR Astra Bakti, Gathering BCA"
                    value={newProjName}
                    onChange={(e) => setNewProjName(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div>
                  <MultiDatePicker
                    label="Tanggal Event *"
                    selectedDates={newProjDates}
                    onChange={(dates, formatted) => {
                      setNewProjDates(dates);
                      setNewProjDate(formatted);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[10px]">Lokasi Event</label>
                  <input
                    type="text"
                    placeholder="e.g. Grand Mercure, Jakarta"
                    value={newProjLocation}
                    onChange={(e) => setNewProjLocation(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold p-2.5 rounded-xl transition shadow active:scale-95 text-center cursor-pointer h-[38px] uppercase tracking-wide text-xs font-sans"
                  >
                    Simpan Proyek Baru
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
        )}


        {/* ==================== TAB VIEW 1: SHEETS WORKSPACE (RAB vs REALISASI) ==================== */}
        {activeTab === "sheets" && activeProject && (
          <div className="space-y-6">
            {!!userProfile && <DashboardStats projects={projects} />}
            {/* COMPACT METADATA EDITABLE HEADER */}
            <div className="bg-[#111317]/60 border border-slate-800/65 p-5 rounded-2xl shadow-xl text-left relative z-20">
              <h3 className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 mb-3 flex items-center gap-1.5 font-mono">
                <Info className="w-4 h-4 text-slate-500" />
                <span>
                  {userProfile?.role === "staff"
                    ? "INFORMASI DAN SPESIFIKASI EVENT (Hanya Admin yang dapat mengubah)"
                    : "INFORMASI DAN SPESIFIKASI EVENT (Dapat diedit disini)"}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[9px] font-mono">1. Nama Event / Projek</label>
                  <input
                    type="text"
                    value={activeProject.name}
                    disabled={userProfile?.role === "staff"}
                    onChange={(e) => handleUpdateProjectInfo("name", e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl py-2 px-3 text-slate-100 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition focus:bg-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <MultiDatePicker
                    label="2. Tanggal Pelaksanaan"
                    selectedDates={activeProject.dates || []}
                    disabled={userProfile?.role === "staff"}
                    onChange={(dates, formatted) => {
                      handleUpdateProjectDates(dates, formatted);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[9px] font-mono">3. Sektor / Tempat / Lokasi</label>
                  <input
                    type="text"
                    value={activeProject.location}
                    disabled={userProfile?.role === "staff"}
                    onChange={(e) => handleUpdateProjectInfo("location", e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl py-2 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition focus:bg-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[9px] font-mono">4. Status Pembayaran</label>
                  <select
                    value={activeProject.paymentStatus || "belum"}
                    disabled={userProfile?.role === "staff"}
                    onChange={(e) => handleUpdateProjectInfo("paymentStatus", e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl py-2 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition focus:bg-slate-950 disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer font-semibold"
                  >
                    <option value="belum" className="bg-slate-950 text-slate-300">❌ Belum DP / Bayar</option>
                    <option value="dp" className="bg-slate-950 text-amber-400 font-bold">🟡 Sudah DP (Uang Muka)</option>
                    <option value="lunas" className="bg-slate-950 text-emerald-400 font-bold">✅ Sudah Lunas (Paid)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[9px] font-mono">5. Nominal DP (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={(activeProject.paymentStatus === "dp" ? activeProject.dpAmount : 0) || ""}
                    disabled={userProfile?.role === "staff" || activeProject.paymentStatus !== "dp"}
                    onChange={(e) => handleUpdateProjectInfo("dpAmount", e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl py-2 px-3 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition focus:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed disabled:text-slate-500"
                  />
                </div>
              </div>
            </div>

            {/* SIDE-BY-SIDE GRIDS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              
              {/* RAB LEFT COMPONENT */}
              <div>
                <EditableBudgetTable
                  title="RANCANGAN ANGGARAN BIAYA PROJEK"
                  theme="green"
                  budget={activeProject.rab}
                  projectMetadata={{
                    name: activeProject.name,
                    date: activeProject.date,
                    location: activeProject.location
                  }}
                  onChange={handleUpdateRAB}
                  onSave={() => triggerNotification("Rancangan Anggaran (RAB) berhasil disimpan!", "success")}
                  userRole={userProfile?.role}
                  staffPresets={staffPresets}
                  isGuestView={!!sharedProjectId}
                />
              </div>

              {/* REALISASI RIGHT COMPONENT */}
              <div>
                <EditableBudgetTable
                  title="REPORT ANGGARAN BIAYA PROJEK"
                  theme="red"
                  budget={activeProject.realisasi}
                  projectMetadata={{
                    name: activeProject.name,
                    date: activeProject.date,
                    location: activeProject.location
                  }}
                  onChange={handleUpdateRealisasi}
                  onSave={() => triggerNotification("Realisasi Anggaran berhasil disimpan!", "success")}
                  onCopyFromRAB={handleCopyRABToRealisasi}
                  onSharePointB={handleSharePointB}
                  userRole={userProfile?.role}
                  staffPresets={staffPresets}
                  isPointBClosed={activeProject.isPointBClosed}
                  onTogglePointB={handleTogglePointB}
                  isGuestView={!!sharedProjectId}
                />
              </div>

            </div>
          </div>
        )}


        {activeTab === "finance" && (
          <div className="max-w-5xl mx-auto space-y-6">
            <MatehaFinance projects={projects} onNotify={triggerNotification} />
          </div>
        )}

        {activeTab === "kwitansi" && (
          <div className="max-w-5xl mx-auto space-y-6">
            <KwitansiView onNotify={triggerNotification} />
          </div>
        )}

        {activeTab === "invoice" && (
          <div className="max-w-5xl mx-auto space-y-6">
            <InvoiceView onNotify={triggerNotification} />
          </div>
        )}
        
        {activeTab === "quotation" && (
          <div className="max-w-5xl mx-auto space-y-6">
            <QuotationView onNotify={triggerNotification} />
          </div>
        )}

        {activeTab === "clients" && (
          <div className="max-w-6xl mx-auto space-y-6">
            <ClientManagement onNotify={triggerNotification} />
          </div>
        )}
        
        {/* ==================== TAB VIEW 2: DASHBOARD & COMPARISON DATA ==================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6 text-left">
            {!!userProfile && user && (
              <AiAssistant
                storageKey={user.uid}
                isAdmin={(userProfile.role || "").toLowerCase() === "admin"}
                onCreateEvent={handleCreateProjectFromAi}
                onDocumentCreated={(tab, message) => {
                  setActiveTab(tab);
                  window.scrollTo({ top: 0 });
                  triggerNotification(message);
                }}
              />
            )}
            {!!userProfile && <DashboardStats projects={projects} />}
            {!!userProfile && <FinancialChart projects={projects} />}
            {!!userProfile && userProfile.role === "admin" && <AiSettingsCard />}
            {!!userProfile && userProfile.role === "admin" && <BackupExport />}
            
            {/* OVERVIEW TABLE FOR ALL REGISTERED PROJECTS */}
            <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-5 bg-[#0f1115]/60 border-b border-slate-800/60 text-left flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>Daftar Proyek & Selisih Keuangan (RAB vs Realisasi)</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Ringkasan penghematan operasional dan keuntungan bersih Mateha dalam tiap event</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Cari event..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
                  />
                  <select
                    value={projectSortOrder}
                    onChange={(e) => setProjectSortOrder(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="newest_date">Terdekat (Tanggal)</option>
                    <option value="oldest_date">Terlama (Tanggal)</option>
                    <option value="newest_created">Terbaru (Dibuat)</option>
                    <option value="oldest_created">Terlama (Dibuat)</option>
                    <option value="name_asc">A-Z</option>
                    <option value="name_desc">Z-A</option>
                  </select>
                </div>
              </div>

              <div className="p-4 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/40 text-slate-400 font-bold border-b border-slate-800 font-mono tracking-wider text-[10px] uppercase">
                      <th className="py-3 px-4">Nama Event / Projek</th>
                      <th className="py-3 px-4">Tanggal & Lokasi</th>
                      <th className="py-3 px-4 text-right">Omset</th>
                      <th className="py-3 px-4 text-right">Profit Event</th>
                      <th className="py-3 px-4 text-center font-mono">Status Pembayaran</th>
                      <th className="py-3 px-4 text-center">Status Keuangan</th>
                      {!!userProfile && (
                        <th className="py-3 px-4 text-center">Aksi</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedProjects).map(([monthYear, group]: [string, EventProject[]]) => (
                      <React.Fragment key={monthYear}>
                        <tr className="bg-slate-950/40 text-cyan-500 text-[10px] font-mono font-bold uppercase tracking-wider">
                          <td colSpan={7} className="py-2 px-4 border-b border-slate-800/60">
                             {monthYear}
                          </td>
                        </tr>
                        {group.map((proj) => {
                          const realCalc = calculateProjectBudget(proj.realisasi);

                          return (
                            <tr
                              key={proj.id}
                              className="border-b border-slate-800/60 hover:bg-[#111317]/80 cursor-pointer transition duration-150"
                              onClick={() => {
                                setActiveProjectId(proj.id);
                                setActiveTab("sheets");
                                triggerNotification(`Membuka berkas ${proj.name}`);
                              }}
                            >
                              <td className="py-3.5 px-4 font-bold text-slate-200">
                                {proj.name}
                              </td>
                              <td className="py-3.5 px-4 text-slate-400">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-mono text-slate-300">{proj.date}</span>
                                  <span className="text-[10px] text-slate-500 font-sans">{proj.location}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                                {formatRupiah(realCalc.totalIncome)}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono text-cyan-400 font-bold">
                                {formatRupiah(realCalc.matehaProfit)}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {(() => {
                                  const status = proj.paymentStatus || "belum";
                                  if (status === "lunas") {
                                    return (
                                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider font-sans bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        🟢 LUNAS
                                      </span>
                                    );
                                  } else if (status === "dp") {
                                    return (
                                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider font-sans bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        🟡 DP ({formatRupiah(proj.dpAmount || 0)})
                                      </span>
                                    );
                                  } else {
                                    return (
                                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider font-sans bg-slate-500/10 text-slate-400 border border-slate-500/20">
                                        Belum DP
                                      </span>
                                    );
                                  }
                                })()}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider font-mono ${
                                  realCalc.matehaProfit > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}>
                                  {realCalc.matehaProfit > 0 ? "SURPLUS" : "DEFISIT"}
                                </span>
                              </td>
                              {!!userProfile && (
                                <td className="py-3.5 px-4 text-center">
                                  <button
                                    onClick={(e) => handleDeleteProject(proj.id, e)}
                                    className="p-1.5 bg-slate-950/60 hover:bg-rose-500/15 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-550/30 rounded-xl transition cursor-pointer"
                                    title="Hapus event ini secara permanen"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* DASHBOARD UTILITIES COLUMN */}
              <div className="bg-[#0b0d11]/80 p-4 border-t border-slate-850/80 text-slate-400 text-xxs font-mono flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center space-x-1.5 text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Sistem Database tersimpan aman di Cloud Database (Firestore).</span>
                </div>
                <div className="flex items-center space-x-3 text-slate-400">
                  <label className="font-bold underline text-amber-500 hover:text-amber-400 cursor-pointer">
                    <span>Impor / Pulihkan Database</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportJSON}
                      className="hidden"
                    />
                  </label>
                  <span className="text-slate-700">•</span>
                  <button
                    onClick={handleResetToMocks}
                    className="font-bold underline text-rose-500 hover:text-rose-400 transition cursor-pointer"
                  >
                    Reset Ulang Data Contoh
                  </button>
                </div>
              </div>
            </div>

            {/* RAPID SVG BAR CHART COMPARISON CARD IN ACTIVE PROJECT */}
            {activeProject && activeProjectSummary && !!userProfile && (
              <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 p-5 rounded-2xl shadow-xl text-xs">
                <div className="mb-5">
                  <h3 className="font-bold text-sm text-white">Visualisasi Perbandingan Anggaran vs Realisasi</h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">Visual perbandingan nominal RAB (Estimasi) dan Realisasi (Laporan Lapangan) untuk Event: <span className="text-cyan-400 font-bold">{activeProject.name}</span></p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Category bars */}
                  <div className="space-y-4">
                    {/* Revenue Row */}
                    <div>
                      <div className="flex justify-between font-bold text-slate-300 mb-1.5 text-[11px] uppercase tracking-wider font-mono">
                        <span>Pemasukan Total (A)</span>
                        <span className="font-mono text-cyan-400">{formatRupiah(activeProjectSummary.rab.totalIncome)} vs {formatRupiah(activeProjectSummary.real.totalIncome)}</span>
                      </div>
                      <div className="h-10 w-full bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800/80 flex flex-col justify-center p-1 gap-1">
                        <div className="w-full h-1/2 flex items-center relative">
                          <div
                            className="h-full bg-emerald-500/15 rounded-lg border-l border-emerald-500 transition-all duration-300 flex items-center px-2 font-mono font-bold text-emerald-400 text-[9px]"
                            style={{ width: `${Math.max(10, Math.min(100, (activeProjectSummary.rab.totalIncome / Math.max(activeProjectSummary.rab.totalIncome, activeProjectSummary.real.totalIncome, 1)) * 100))}%` }}
                          >
                            RAB
                          </div>
                        </div>
                        <div className="w-full h-1/2 flex items-center relative">
                          <div
                            className="h-full bg-emerald-500/60 rounded-lg transition-all duration-300 flex items-center px-2 font-mono font-bold text-slate-950 text-[9px]"
                            style={{ width: `${Math.max(10, Math.min(100, (activeProjectSummary.real.totalIncome / Math.max(activeProjectSummary.rab.totalIncome, activeProjectSummary.real.totalIncome, 1)) * 100))}%` }}
                          >
                            Realisasi
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Operational Row */}
                    <div>
                      <div className="flex justify-between font-bold text-slate-300 mb-1.5 text-[11px] uppercase tracking-wider font-mono">
                        <span>Biaya Akomodasi & Ops (B)</span>
                        <span className="font-mono text-rose-450">{!!sharedProjectId ? "****" : `${formatRupiah(activeProjectSummary.rab.totalAccommodation)} vs ${formatRupiah(activeProjectSummary.real.totalAccommodation)}`}</span>
                      </div>
                      <div className="h-10 w-full bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800/80 flex flex-col justify-center p-1 gap-1">
                        <div className="w-full h-1/2 flex items-center relative">
                          <div
                            className="h-full bg-rose-500/15 rounded-lg border-l border-rose-500 transition-all duration-300 flex items-center px-2 font-mono font-bold text-rose-400 text-[9px]"
                            style={{ width: `${Math.max(10, Math.min(100, (activeProjectSummary.rab.totalAccommodation / Math.max(activeProjectSummary.rab.totalAccommodation, activeProjectSummary.real.totalAccommodation, 1)) * 100))}%` }}
                          >
                            RAB
                          </div>
                        </div>
                        <div className="w-full h-1/2 flex items-center relative">
                          <div
                            className="h-full bg-rose-500/60 rounded-lg transition-all duration-300 flex items-center px-2 font-mono font-bold text-white text-[9px]"
                            style={{ width: `${Math.max(10, Math.min(100, (activeProjectSummary.real.totalAccommodation / Math.max(activeProjectSummary.rab.totalAccommodation, activeProjectSummary.real.totalAccommodation, 1)) * 100))}%` }}
                          >
                            Realisasi
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Net profit Row */}
                    <div>
                      <div className="flex justify-between font-bold text-slate-300 mb-1.5 text-[11px] uppercase tracking-wider font-mono">
                        <span>Keuntungan Mateha Bersih (Bottom Profit)</span>
                        <span className="font-mono text-cyan-400">{formatRupiah(activeProjectSummary.rab.matehaProfit)} vs {formatRupiah(activeProjectSummary.real.matehaProfit)}</span>
                      </div>
                      <div className="h-10 w-full bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800/80 flex flex-col justify-center p-1 gap-1">
                        <div className="w-full h-1/2 flex items-center relative">
                          <div
                            className="h-full bg-cyan-500/15 rounded-lg border-l border-cyan-500 transition-all duration-300 flex items-center px-2 font-mono font-bold text-cyan-400 text-[9px]"
                            style={{ width: `${Math.max(10, Math.min(100, (activeProjectSummary.rab.matehaProfit / Math.max(activeProjectSummary.rab.matehaProfit, activeProjectSummary.real.matehaProfit, 1)) * 100))}%` }}
                          >
                            RAB
                          </div>
                        </div>
                        <div className="w-full h-1/2 flex items-center relative">
                          <div
                            className="h-full bg-cyan-500/60 rounded-lg transition-all duration-300 flex items-center px-2 font-mono font-bold text-slate-950 text-[9px]"
                            style={{ width: `${Math.max(10, Math.min(100, (activeProjectSummary.real.matehaProfit / Math.max(activeProjectSummary.rab.matehaProfit, activeProjectSummary.real.matehaProfit, 1)) * 100))}%` }}
                          >
                            Realisasi
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary commentary card */}
                  <div className="bg-[#101217]/60 p-5 rounded-xl flex flex-col justify-between border border-slate-800/80 leading-relaxed text-left">
                    <div>
                      <h4 className="font-bold text-white mb-2 uppercase tracking-wider text-[10px] font-mono flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        <span>Analisa Realisasi vs RAB</span>
                      </h4>
                      <p className="text-slate-300 text-xs leading-relaxed">
                        {activeProjectSummary.real.matehaProfit >= activeProjectSummary.rab.matehaProfit ? (
                          <span>
                            Event <span className="font-bold text-emerald-400">{activeProject.name}</span> berjalan sangat menguntungkan! Anda berhasil mengamankan profit bersih realisasi senilai{" "}
                            <span className="font-bold text-emerald-400 font-mono text-[13px] bg-emerald-500/10 px-1.5 py-0.5 rounded ml-0.5">{formatRupiah(activeProjectSummary.real.matehaProfit)}</span>. Ini merupakan peningkatan keuntungan sebesar{" "}
                            <span className="font-mono font-extrabold text-emerald-400">
                              {formatRupiah(activeProjectSummary.real.matehaProfit - activeProjectSummary.rab.matehaProfit)}
                            </span>{" "}
                            dibandingkan rancangan awal (RAB). Penghematan ini dipicu oleh efisiensi pengeluaran dan akomodasi operasional di lapangan.
                          </span>
                        ) : (
                          <span>
                            Event <span className="font-bold text-rose-450">{activeProject.name}</span> melampaui estimasi pengeluaran rancangan awal. Realisasi profit bersih Mateha tercatat sebesar{" "}
                            <span className="font-bold text-rose-400 font-mono text-[13px] bg-rose-500/10 px-1.5 py-0.5 rounded ml-0.5">{formatRupiah(activeProjectSummary.real.matehaProfit)}</span>, yang berarti terjadi penurunan keuntungan senilai{" "}
                            <span className="font-mono font-extrabold text-rose-450">
                              {formatRupiah(activeProjectSummary.rab.matehaProfit - activeProjectSummary.real.matehaProfit)}
                            </span>{" "}
                            dibandingkan rencana semula. Harap tinjau kembali pos-pos pengeluaran di Section B atau distribusi gaji di Section D yang mengalami overbudget.
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-850/80 flex justify-between items-center text-slate-500 text-[10px]">
                      <span>Dikalkulasikan secara real-time berdasarkan data terkini</span>
                      <button
                        onClick={() => {
                          setActiveTab("sheets");
                          triggerNotification("Buka halaman detail.");
                        }}
                        className="text-cyan-400 font-bold flex items-center hover:underline cursor-pointer"
                      >
                        Buka Detail Event <ArrowRight className="w-3 h-3 ml-1" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB VIEW 3: PAYSLIP STAFF WORKSPACE - SECURED FOR ADMINS ONLY ==================== */}
        {activeTab === "payslips" && !!userProfile && (
          <PayslipView
            projects={projects}
            currentUserProfile={userProfile}
            onNotify={(msg, type) => triggerNotification(msg, type === "error" ? "error" : "success")}
          />
        )}

        {/* ==================== TAB VIEW 3.5: STAFF PAYSLIP & KASBON WORKSPACE (STAFF & ADMIN) ==================== */}
        {activeTab === "staff-payslips" && !!userProfile && (
          <StaffPayslipView
            projects={projects}
            currentUserProfile={userProfile}
            onNotify={(msg, type) => triggerNotification(msg, type === "error" ? "error" : "success")}
          />
        )}

        {/* ==================== TAB VIEW 4: USER / STAFF MANAGEMENT WORKSPACE ==================== */}
        {activeTab === "users" && !!userProfile && (
          <UserManagement 
            currentUserId={user.uid} 
            onNotify={(msg, type) => triggerNotification(msg, type === "error" ? "error" : "success")} 
          />
        )}

      </main>

      {/* FOOTER FOR BRANDING AND COMPLIANCE */}
      <footer className="hidden lg:block border-t border-slate-800/60 py-5 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between gap-4">
          <p>© 2026 Mateha Production</p>
          <p className="text-slate-600">Sistem Keuangan Terpadu · v2.5</p>
        </div>
      </footer>
      </div>

      {!!userProfile && (
        <>
          <BottomNav
            items={availableTabs}
            activeTab={activeTab}
            onSelect={handleSelectTab}
            onOpenMenu={() => setIsMobileMenuOpen(true)}
            menuOpen={isMobileMenuOpen}
          />
          <MobileMenuSheet
            open={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
            items={availableTabs}
            activeTab={activeTab}
            onSelect={handleSelectTab}
            user={navUser}
            onChangePassword={() => {
              setIsMobileMenuOpen(false);
              setIsChangePasswordModalOpen(true);
            }}
            onLogout={handleLogout}
          />
        </>
      )}

      {/* CUSTOM CONFIRMATION MODAL OVERLAY */}
      <AnimatePresence>
        {confirmModal && confirmModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            {/* Modal Backdrop Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="w-full max-w-md bg-[#0f1115] border border-slate-850 rounded-2xl shadow-2xl p-6 text-left relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Colored top border accent */}
              <div className={`absolute top-0 left-0 right-0 h-1.5 ${confirmModal.type === "delete" ? "bg-rose-500" : "bg-amber-500"}`} />

              <div className="flex items-start space-x-4 mt-2">
                <div className={`p-3 rounded-full flex-shrink-0 ${confirmModal.type === "delete" ? "bg-rose-500/10 text-rose-450" : "bg-amber-500/10 text-amber-400"}`}>
                  {confirmModal.type === "delete" ? (
                    <Trash2 className="w-6 h-6" />
                  ) : (
                    <AlertCircle className="w-6 h-6" />
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider font-sans">
                    {confirmModal.title}
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed font-sans mt-1">
                    {confirmModal.message}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold border border-slate-800 transition cursor-pointer"
                >
                  {confirmModal.cancelText || "Batal"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmModal.onConfirm();
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold text-slate-950 transition cursor-pointer font-sans uppercase tracking-wider ${
                    confirmModal.type === "delete"
                      ? "bg-rose-500 hover:bg-rose-400"
                      : "bg-amber-500 hover:bg-amber-400"
                  }`}
                >
                  {confirmModal.confirmText || "Ya, Lanjutkan"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI SPREADSHEET AUTO-IMPORT SCANNER MODAL */}
      <AnimatePresence>
        {isScanningAI && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-2xl bg-[#0f1115] border border-slate-800 rounded-2xl shadow-2xl p-6 text-left relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Colored top border accent */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 to-indigo-500" />

              <div className="flex items-center justify-between mt-2 border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 rounded-xl text-cyan-400">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider font-sans">
                      Upload & Scan Spreadsheet (AI)
                    </h3>
                    <p className="text-slate-400 text-[10px] uppercase font-mono tracking-wide mt-0.5">
                      OTOMATISASI PARSING TABEL RAB & REALISASI PROJEK
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsScanningAI(false);
                    setSelectedScanImage(null);
                    setParsedProjects(null);
                  }}
                  className="p-1 px-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white text-slate-400 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Loader overlay during scanning */}
              {isScanLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="p-4 bg-cyan-500/10 rounded-full text-cyan-400 animate-spin">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-white text-xs font-bold font-sans uppercase tracking-wider animate-pulse">
                      MENGANALISIS GAMBAR DENGAN GEMINI...
                    </p>
                    <p className="text-slate-400 text-xxs font-mono mt-1 max-w-sm mx-auto leading-relaxed">
                      {scanStep}
                    </p>
                  </div>
                </div>
              ) : parsedProjects ? (
                // Extracted Projects Preview Screen
                <div className="mt-4 space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-xl flex items-center space-x-3 text-emerald-400">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="font-extrabold uppercase tracking-wide">Analisis Spreadsheet Berhasil!</p>
                      <p className="text-emerald-300 font-mono text-xxs mt-0.5">Ditemukan {parsedProjects.length} event/projek. Silakan tinjau data rincian di bawah ini sebelum menyimpan.</p>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                    {parsedProjects.map((proj, idx) => (
                      <div key={idx} className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                          <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5 font-sans">
                            <span className="w-5 h-5 rounded-md bg-slate-800/80 text-xxs text-slate-300 flex items-center justify-center font-mono">
                              {idx + 1}
                            </span>
                            {proj.name}
                          </span>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {proj.date}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-500" />
                              {proj.location}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-300">
                          {/* RAB Section Column */}
                          <div className="space-y-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                            <p className="font-extrabold text-cyan-400 font-sans uppercase tracking-[0.05em] text-[9px]">Rancangan Anggaran Biaya (RAB):</p>
                            <ul className="space-y-1 text-slate-400 font-mono list-disc list-inside">
                              <li>Pemasukan: {proj.rab?.income?.length || 0} item</li>
                              <li>Akomodasi: {proj.rab?.accommodation?.length || 0} item</li>
                              <li>Fee Distribusi: {proj.rab?.feeDistribution?.length || 0} item</li>
                            </ul>
                          </div>
                          {/* Realisasi Section Column */}
                          <div className="space-y-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                            <p className="font-extrabold text-amber-400 font-sans uppercase tracking-[0.05em] text-[9px]">Laporan Realisasi Projek:</p>
                            <ul className="space-y-1 text-slate-400 font-mono list-disc list-inside">
                              <li>Pemasukan: {proj.realisasi?.income?.length || 0} item</li>
                              <li>Akomodasi: {proj.realisasi?.accommodation?.length || 0} item</li>
                              <li>Fee Distribusi: {proj.realisasi?.feeDistribution?.length || 0} item</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-800 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setParsedProjects(null);
                        setSelectedScanImage(null);
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold border border-slate-800 transition cursor-pointer font-sans"
                    >
                      Ulangi Unggah
                    </button>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsScanningAI(false);
                          setSelectedScanImage(null);
                          setParsedProjects(null);
                        }}
                        className="px-4 py-2 bg-slate-950 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition cursor-pointer font-sans"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveParsedProjects}
                        className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold rounded-xl text-xs transition cursor-pointer font-sans uppercase tracking-wider"
                      >
                        Ya, Masukan & Simpan ke Cloud
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // File Upload Screen
                <div className="mt-4 space-y-4">
                  <div className="text-xs text-slate-300 leading-relaxed font-sans">
                    Unggah tangkapan layar (screenshot) spreadsheet RAB Anda. Sistem AI Gemini akan secara cerdas mengenali nama event, tanggal, sektor lokasi serta rincian lengkap untuk disusun menjadi draf RAB dan Realisasi yang langsung tersimpan di cloud database.
                  </div>

                  {/* Drag-and-drop Image Area */}
                  <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 rounded-2xl p-6 transition flex flex-col items-center justify-center text-center space-y-3 relative group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />

                    {selectedScanImage ? (
                      <div className="space-y-3 py-1">
                        <img
                          src={selectedScanImage}
                          alt="Preview spreadsheet screenshot"
                          className="max-h-40 rounded-xl border border-slate-800 shadow-md mx-auto object-contain"
                        />
                        <p className="text-cyan-400 font-mono text-[10px] font-extrabold uppercase tracking-wide animate-pulse">
                          GAMBAR REKAP TERUNGGAH (Siap di-Scan)
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="p-3 bg-slate-900 rounded-full text-slate-500 group-hover:text-cyan-400 transition">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-white text-xs font-bold font-sans">
                            Tarik & Lepaskan gambar, atau klik untuk menelusuri berkas
                          </p>
                          <p className="text-slate-500 text-xxs font-mono uppercase tracking-wide">
                            PNG, JPG, JPEG (Hingga 10MB)
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {selectedScanImage && (
                    <div className="flex justify-end space-x-3.5 border-t border-slate-800 pt-4">
                      <button
                        type="button"
                        onClick={() => setSelectedScanImage(null)}
                        className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition cursor-pointer font-sans"
                      >
                        Reset Gambar
                      </button>
                      <button
                        type="button"
                        onClick={handleProcessAIScan}
                        className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-extrabold rounded-xl text-xs transition cursor-pointer font-sans uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-950/30"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Mulai Analisis AI</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CHANGE PASSWORD MODAL */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        userProfile={userProfile}
        onNotify={(msg, type) => triggerNotification(msg, type === "error" ? "error" : "success")}
      />

    </div>
  );
}
