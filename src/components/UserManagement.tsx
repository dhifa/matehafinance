import React, { useState, useEffect } from "react";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, addDoc } from "firebase/firestore";
import { db, sanitizeForFirestore, registerTeamMemberByAdmin, syncUserAuthPassword } from "../utils/firebase";
import { UserProfile, CustomRole, StaffRolePreset, formatRupiah, TabType, KasbonPlafondType } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, 
  ShieldCheck, 
  Search, 
  Loader2, 
  Check, 
  Trash2, 
  AlertCircle,
  Plus,
  Briefcase,
  KeyRound,
  Shield,
  Edit2,
  Lock,
  UserCheck,
  UserX,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  CheckSquare,
  Square,
  Sliders,
  SlidersHorizontal,
  Layers,
  Coins,
  Wallet,
  LayoutDashboard,
  FileText,
  UserPlus,
  Eye,
  EyeOff,
  Phone,
  Mail,
  User,
  RefreshCw
} from "lucide-react";

interface UserManagementProps {
  currentUserId: string;
  onNotify: (text: string, type?: "success" | "info" | "error") => void;
}

export interface RoleFeatureItem {
  id: TabType;
  label: string;
  shortLabel: string;
  description: string;
  category: "Operasional Event" | "Keuangan & Dokumen" | "Administrasi & Master";
  icon: React.ComponentType<{ className?: string }>;
}

export const ALL_SYSTEM_FEATURES: RoleFeatureItem[] = [
  // Operasional Event
  { id: "sheets", label: "Lembar Kerja Event", shortLabel: "Lembar Kerja", description: "Akses RAB, Realisasi & penganggaran event", category: "Operasional Event", icon: Coins },
  { id: "dashboard", label: "Dashboard & Data Analitik", shortLabel: "Dashboard", description: "Ringkasan performa event, chart omset & dividen", category: "Operasional Event", icon: LayoutDashboard },

  // Keuangan & Dokumen
  { id: "finance", label: "Keuangan Mateha", shortLabel: "Keuangan", description: "Kas operasional, arus kas & laporan laba", category: "Keuangan & Dokumen", icon: Wallet },
  { id: "invoice", label: "Invoice & Tagihan", shortLabel: "Invoice", description: "Pembuatan, preview & cetak invoice tagihan klien", category: "Keuangan & Dokumen", icon: FileText },
  { id: "quotation", label: "Quotation Penawaran", shortLabel: "Quotation", description: "Pembuatan & cetak surat penawaran harga resmi", category: "Keuangan & Dokumen", icon: FileText },
  { id: "kwitansi", label: "Kwitansi Pembayaran", shortLabel: "Kwitansi", description: "Pembuatan & cetak tanda terima pembayaran sah", category: "Keuangan & Dokumen", icon: FileText },
  { id: "clients", label: "Database Klien & Vendor", shortLabel: "Klien", description: "Pencatatan kontak relasi klien & rekanan vendor", category: "Keuangan & Dokumen", icon: Users },

  // Administrasi & Master
  { id: "staff-payslips", label: "Staff Payslip & Kasbon", shortLabel: "Staff Payslip", description: "Slip gaji staf & pengajuan kasbon operasional", category: "Administrasi & Master", icon: Wallet },
  { id: "payslips", label: "Slip Gaji Staff (Admin)", shortLabel: "Slip Gaji", description: "Perhitungan kalkulasi gaji seluruh tim Mateha", category: "Administrasi & Master", icon: FileText },
  { id: "users", label: "Manajemen Staff & Peran", shortLabel: "Manajemen Staff", description: "Kelola akun anggota tim & kustomisasi hak peran", category: "Administrasi & Master", icon: Users },
];

const DEFAULT_SYSTEM_ROLES: CustomRole[] = [
  { 
    id: "admin", 
    name: "Administrator", 
    description: "Akses penuh seluruh sistem, omset dividen, keuangan dan user", 
    isSystem: true, 
    color: "cyan",
    allowedTabs: [
      "sheets", "staff-payslips", "dashboard", "finance", 
      "invoice", "quotation", "kwitansi", "clients", 
      "payslips", "users"
    ]
  },
  { 
    id: "finance", 
    name: "Finance", 
    description: "Khusus kelola Invoice, Quotation, Kwitansi, dan Database Klien", 
    isSystem: true, 
    color: "emerald",
    allowedTabs: ["invoice", "quotation", "kwitansi", "clients"]
  },
  { 
    id: "staff", 
    name: "Staff", 
    description: "Akses lapangan, input RAB, realisasi & Staff Payslip pribadi", 
    isSystem: true, 
    color: "indigo",
    allowedTabs: ["sheets", "staff-payslips"]
  }
];

const ROLE_COLORS = [
  { id: "cyan", name: "Cyan / Biru Muda", bg: "bg-cyan-500", border: "border-cyan-400" },
  { id: "emerald", name: "Emerald / Hijau", bg: "bg-emerald-500", border: "border-emerald-400" },
  { id: "indigo", name: "Indigo / Biru Laut", bg: "bg-indigo-500", border: "border-indigo-400" },
  { id: "purple", name: "Purple / Ungu", bg: "bg-purple-500", border: "border-purple-400" },
  { id: "amber", name: "Amber / Emas", bg: "bg-amber-500", border: "border-amber-400" },
  { id: "rose", name: "Rose / Merah Muda", bg: "bg-rose-500", border: "border-rose-400" },
];

const getRoleBadgeStyle = (color?: string, roleId?: string) => {
  const c = color || (roleId === "admin" ? "cyan" : roleId === "finance" ? "emerald" : "indigo");
  switch (c) {
    case "cyan":
      return {
        bg: "bg-cyan-500/10",
        text: "text-cyan-400",
        border: "border-cyan-500/20",
        dot: "bg-cyan-400",
        ring: "ring-cyan-500/40",
      };
    case "emerald":
      return {
        bg: "bg-emerald-500/10",
        text: "text-emerald-400",
        border: "border-emerald-500/20",
        dot: "bg-emerald-400",
        ring: "ring-emerald-500/40",
      };
    case "purple":
      return {
        bg: "bg-purple-500/10",
        text: "text-purple-400",
        border: "border-purple-500/20",
        dot: "bg-purple-400",
        ring: "ring-purple-500/40",
      };
    case "amber":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/20",
        dot: "bg-amber-400",
        ring: "ring-amber-500/40",
      };
    case "rose":
      return {
        bg: "bg-rose-500/10",
        text: "text-rose-400",
        border: "border-rose-500/20",
        dot: "bg-rose-400",
        ring: "ring-rose-500/40",
      };
    case "indigo":
    default:
      return {
        bg: "bg-indigo-500/10",
        text: "text-indigo-400",
        border: "border-indigo-500/20",
        dot: "bg-indigo-400",
        ring: "ring-indigo-500/40",
      };
  }
};

export default function UserManagement({ currentUserId, onNotify }: UserManagementProps) {
  const loadCached = <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch {
      return fallback;
    }
  };

  const [users, setUsers] = useState<UserProfile[]>(() => loadCached<UserProfile[]>("mateha_cached_db_users", []));
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // Custom Roles state (Admin can add/edit roles & customize feature permissions)
  const [customRoles, setCustomRoles] = useState<CustomRole[]>(() => loadCached<CustomRole[]>("mateha_cached_custom_roles", DEFAULT_SYSTEM_ROLES));
  const [rolesLoading, setRolesLoading] = useState(false);
  const [newCustomRoleName, setNewCustomRoleName] = useState("");
  const [newCustomRoleDesc, setNewCustomRoleDesc] = useState("");
  const [selectedRoleFeatures, setSelectedRoleFeatures] = useState<TabType[]>(["sheets", "staff-payslips"]);
  const [selectedRoleColor, setSelectedRoleColor] = useState<string>("indigo");
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);

  // Staff roles dropdown presets for RAB
  const [presets, setPresets] = useState<StaffRolePreset[]>(() => loadCached<StaffRolePreset[]>("mateha_cached_staff_presets", []));
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [newPresetRoleName, setNewPresetRoleName] = useState("");
  const [newDefaultNames, setNewDefaultNames] = useState("");
  const [newDefaultExpense, setNewDefaultExpense] = useState("");

  // Quick user edit modal (Password, Role, Status, Hak Akses, Profile)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editDisplayNameInput, setEditDisplayNameInput] = useState("");
  const [editJobTitleInput, setEditJobTitleInput] = useState("");
  const [editPhoneInput, setEditPhoneInput] = useState("");
  const [editPasswordInput, setEditPasswordInput] = useState("");
  const [editRoleInput, setEditRoleInput] = useState("");
  const [editStatusInput, setEditStatusInput] = useState<"aktif" | "nonaktif">("aktif");
  const [editAccessInput, setEditAccessInput] = useState("");
  const [editKasbonPlafondType, setEditKasbonPlafondType] = useState<KasbonPlafondType>("percent");
  const [editKasbonPercentLimit, setEditKasbonPercentLimit] = useState("50");
  const [editKasbonFixedLimit, setEditKasbonFixedLimit] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  // Add New Team Member modal state (Admin Exclusive)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [addFullName, setAddFullName] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [addPassword, setAddPassword] = useState("mateha123");
  const [addShowPassword, setAddShowPassword] = useState(false);
  const [addRole, setAddRole] = useState("staff");
  const [addJobTitle, setAddJobTitle] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addCustomEmail, setAddCustomEmail] = useState("");
  const [addUseCustomEmail, setAddUseCustomEmail] = useState(false);
  const [addAccessLevel, setAddAccessLevel] = useState("");
  const [addKasbonPlafondType, setAddKasbonPlafondType] = useState<KasbonPlafondType>("percent");
  const [addKasbonPercentLimit, setAddKasbonPercentLimit] = useState("50");
  const [addKasbonFixedLimit, setAddKasbonFixedLimit] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  // Self-contained confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
    type: "delete" | "warning";
  } | null>(null);

  // 1. Load custom roles from Firestore settings
  useEffect(() => {
    setRolesLoading(true);
    const unsub = onSnapshot(
      doc(db, "settings", "custom_roles"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const saved: CustomRole[] = data.roles || [];
          
          // Ensure system roles are always present and fill allowedTabs
          const merged: CustomRole[] = DEFAULT_SYSTEM_ROLES.map((defaultRole) => {
            const found = saved.find(
              (s) => s.id === defaultRole.id || s.name.toLowerCase() === defaultRole.name.toLowerCase()
            );
            if (found) {
              return {
                ...defaultRole,
                ...found,
                allowedTabs: Array.isArray(found.allowedTabs) && found.allowedTabs.length > 0 
                  ? found.allowedTabs 
                  : defaultRole.allowedTabs
              };
            }
            return defaultRole;
          });

          // Add any custom roles added by admin
          saved.forEach((r) => {
            if (!merged.some((m) => m.id === r.id || m.name.toLowerCase() === r.name.toLowerCase())) {
              merged.push({
                ...r,
                allowedTabs: Array.isArray(r.allowedTabs) && r.allowedTabs.length > 0 
                  ? r.allowedTabs 
                  : ["sheets", "staff-payslips"]
              });
            }
          });

          setCustomRoles(merged);
        } else {
          setCustomRoles(DEFAULT_SYSTEM_ROLES);
        }
        setRolesLoading(false);
      },
      (error) => {
        const msg = String(error).toLowerCase();
        if (msg.includes("quota") || (error as any)?.code === "resource-exhausted") {
          console.warn("[UserManagement] Firestore quota reached for custom_roles. Using default/cached roles.");
        } else {
          console.error("Failed to load custom roles:", error);
        }
        setCustomRoles(DEFAULT_SYSTEM_ROLES);
        setRolesLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // 2. Load staff presets from Firestore
  useEffect(() => {
    setPresetsLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, "settings", "staff_presets"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPresets(data.presets || []);
        } else {
          setPresets([]);
        }
        setPresetsLoading(false);
      },
      (error) => {
        const msg = String(error).toLowerCase();
        if (msg.includes("quota") || (error as any)?.code === "resource-exhausted") {
          console.warn("[UserManagement] Firestore quota reached for staff_presets. Using cached presets.");
        } else {
          console.error("Failed to load staff presets:", error);
        }
        setPresetsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 3. Load all users from Firestore
  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const userList: UserProfile[] = [];
        snapshot.forEach((doc) => {
          userList.push(doc.data() as UserProfile);
        });
        setUsers(userList);
        setLoading(false);
      },
      (error) => {
        const msg = String(error).toLowerCase();
        if (msg.includes("quota") || (error as any)?.code === "resource-exhausted") {
          console.warn("[UserManagement] Firestore quota reached for users collection. Using cached users.");
        } else {
          console.error("Failed to load users:", error);
          onNotify("Gagal memuat daftar pengguna: " + error.message, "error");
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Handlers for Custom Roles & Feature Customization
  const handleStartEditRole = (role: CustomRole) => {
    setEditingRole(role);
    setNewCustomRoleName(role.name);
    setNewCustomRoleDesc(role.description || "");
    setSelectedRoleColor(role.color || (role.id === "admin" ? "cyan" : role.id === "finance" ? "emerald" : "indigo"));
    
    const currentTabs = Array.isArray(role.allowedTabs) && role.allowedTabs.length > 0
      ? role.allowedTabs
      : role.id === "admin"
      ? ALL_SYSTEM_FEATURES.map((f) => f.id)
      : role.id === "finance"
      ? ["invoice", "quotation", "kwitansi", "clients"]
      : ["sheets", "staff-payslips"];
    setSelectedRoleFeatures([...currentTabs]);

    const formEl = document.getElementById("role-management-form");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleCancelEditRole = () => {
    setEditingRole(null);
    setNewCustomRoleName("");
    setNewCustomRoleDesc("");
    setSelectedRoleColor("indigo");
    setSelectedRoleFeatures(["sheets", "staff-payslips"]);
  };

  const handleToggleRoleFeature = (featureId: TabType) => {
    setSelectedRoleFeatures((prev) =>
      prev.includes(featureId) ? prev.filter((id) => id !== featureId) : [...prev, featureId]
    );
  };

  const handleSelectAllFeatures = () => {
    setSelectedRoleFeatures(ALL_SYSTEM_FEATURES.map((f) => f.id));
  };

  const handleSetPresetFeatures = (type: "staff" | "finance") => {
    if (type === "staff") {
      setSelectedRoleFeatures(["sheets", "staff-payslips"]);
    } else {
      setSelectedRoleFeatures(["invoice", "quotation", "kwitansi", "clients"]);
    }
  };

  const handleClearAllFeatures = () => {
    setSelectedRoleFeatures([]);
  };

  // Handle adding or updating custom role
  const handleSaveCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCustomRoleName.trim();
    if (!name) {
      onNotify("Nama peran tidak boleh kosong!", "error");
      return;
    }

    if (selectedRoleFeatures.length === 0) {
      onNotify("Pilih minimal 1 fitur yang diizinkan untuk peran ini!", "error");
      return;
    }

    try {
      let updated: CustomRole[];
      if (editingRole) {
        updated = customRoles.map((r) =>
          r.id === editingRole.id
            ? {
                ...r,
                name: r.isSystem ? r.name : name, // Keep system role ID stable, update name for custom
                description: newCustomRoleDesc.trim() || r.description,
                color: selectedRoleColor,
                allowedTabs: selectedRoleFeatures
              }
            : r
        );
        onNotify(`Berhasil memperbarui peran & fitur "${editingRole.name}"!`, "success");
      } else {
        const newRoleItem: CustomRole = {
          id: `role-${Date.now()}`,
          name,
          description: newCustomRoleDesc.trim() || `Peran khusus ${name}`,
          isSystem: false,
          color: selectedRoleColor,
          allowedTabs: selectedRoleFeatures
        };
        updated = [...customRoles, newRoleItem];
        onNotify(`Berhasil menambahkan peran baru "${name}" dengan ${selectedRoleFeatures.length} fitur aktif!`, "success");
      }

      await setDoc(doc(db, "settings", "custom_roles"), {
        roles: sanitizeForFirestore(updated)
      });

      handleCancelEditRole();
    } catch (err: any) {
      console.error(err);
      onNotify("Gagal menyimpan peran: " + err.message, "error");
    }
  };

  // Handle deleting custom role
  const handleDeleteCustomRole = async (roleId: string, roleName: string) => {
    const isSystem = DEFAULT_SYSTEM_ROLES.some((r) => r.id === roleId);
    if (isSystem) {
      onNotify("Peran bawaan sistem tidak dapat dihapus (namun fiturnya dapat diedit)!", "error");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Hapus Peran Custom",
      message: `Apakah Anda yakin ingin menghapus peran "${roleName}"? Pengguna dengan peran ini dapat diarahkan ke peran Staff.`,
      confirmText: "Ya, Hapus Peran",
      cancelText: "Batal",
      type: "delete",
      onConfirm: async () => {
        try {
          const updated = customRoles.filter((r) => r.id !== roleId);
          await setDoc(doc(db, "settings", "custom_roles"), { roles: updated });
          onNotify(`Peran "${roleName}" berhasil dihapus!`, "success");
        } catch (err: any) {
          console.error(err);
          onNotify("Gagal menghapus peran: " + err.message, "error");
        }
        setConfirmModal(null);
      }
    });
  };

  // Open modal to edit user
  const handleOpenEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setEditDisplayNameInput(user.displayName || user.username || "");
    setEditJobTitleInput(user.jobTitle || "");
    setEditPhoneInput(user.phone || "");
    setEditPasswordInput(user.password || "");
    setEditRoleInput(user.role || "staff");
    setEditStatusInput(user.status || "aktif");
    setEditKasbonPlafondType(user.kasbonPlafondType || "percent");
    setEditKasbonPercentLimit(user.kasbonPercentLimit !== undefined ? user.kasbonPercentLimit.toString() : "50");
    setEditKasbonFixedLimit(user.kasbonFixedLimit !== undefined ? user.kasbonFixedLimit.toString() : "");
    setEditAccessInput(
      user.accessLevel ||
      (user.role === "admin"
        ? "Akses Penuh (Full Dashboard & Keuangan)"
        : user.role === "finance"
        ? "Khusus Finance (Invoice, Quotation, Kwitansi)"
        : "Staff Lapangan (Input RAB, Realisasi & Payslip)")
    );
  };

  // Save updated user data
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingUser(true);
    try {
      const fixedLimitNum = Number(editKasbonFixedLimit.replace(/\D/g, "")) || 0;
      const percentLimitNum = Number(editKasbonPercentLimit) || 50;
      const updateData: Partial<UserProfile> = {
        displayName: editDisplayNameInput.trim() || editingUser.username,
        jobTitle: editJobTitleInput.trim() || undefined,
        phone: editPhoneInput.trim() || undefined,
        role: editRoleInput,
        status: editStatusInput,
        accessLevel: editAccessInput.trim(),
        kasbonPlafondType: editKasbonPlafondType,
        kasbonPercentLimit: editKasbonPlafondType === "percent" ? percentLimitNum : undefined,
        kasbonFixedLimit: editKasbonPlafondType === "fixed" ? fixedLimitNum : undefined
      };
      if (editPasswordInput.trim()) {
        updateData.password = editPasswordInput.trim();
        // If password was changed and old password is known, sync to Firebase Auth
        if (editingUser.password && editingUser.password !== editPasswordInput.trim()) {
          const userEmail = editingUser.email || `${editingUser.username.toLowerCase()}@mateha.local`;
          syncUserAuthPassword(userEmail, editingUser.password, editPasswordInput.trim()).catch(() => {});
        }
      }

      await updateDoc(doc(db, "users", editingUser.uid), sanitizeForFirestore(updateData));
      onNotify(`Berhasil memperbarui data anggota "${editingUser.displayName || editingUser.username}"!`, "success");
      setEditingUser(null);
    } catch (err: any) {
      console.warn("User update error:", err?.message || err);
      onNotify("Gagal memperbarui pengguna: " + (err?.message || "Kesalahan sistem"), "error");
    } finally {
      setSavingUser(false);
    }
  };

  // Create new team member (Admin Only)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawUname = addUsername.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    const cleanPass = addPassword.trim();
    const fullName = addFullName.trim();

    if (!rawUname) {
      onNotify("Username anggota tim wajib diisi!", "error");
      return;
    }
    if (rawUname.length < 3) {
      onNotify("Username minimal harus 3 karakter!", "error");
      return;
    }
    if (cleanPass.length < 6) {
      onNotify("Password minimal harus 6 karakter!", "error");
      return;
    }

    let finalEmail = `${rawUname}@mateha.local`;
    if (addUseCustomEmail && addCustomEmail.trim()) {
      finalEmail = addCustomEmail.trim().toLowerCase();
    }

    // Check duplicate username or email locally
    const duplicate = users.find(
      (u) =>
        u.username.toLowerCase() === rawUname ||
        (u.email && u.email.toLowerCase() === finalEmail)
    );
    if (duplicate) {
      onNotify(`Username "${rawUname}" sudah terdaftar sebagai ${duplicate.displayName || duplicate.username} (${duplicate.role})! Silakan edit data langsung dari tabel.`, "error");
      return;
    }

    setCreatingUser(true);
    try {
      // 1. Provision user via secondary Firebase Auth app (or reconnect existing auth)
      const regResult = await registerTeamMemberByAdmin(finalEmail, cleanPass);
      const newUid = regResult.uid;

      // 2. Prepare role name and access level
      const matchedRole = customRoles.find(
        (r) => r.id === addRole || r.name.toLowerCase() === addRole.toLowerCase()
      );
      const roleName = matchedRole?.name || addRole;
      const defaultAccess =
        addRole === "admin"
          ? "Akses Penuh (Full Dashboard & Keuangan)"
          : addRole === "finance"
          ? "Khusus Finance (Invoice, Quotation & Kwitansi)"
          : `Staff Lapangan (${roleName})`;

      const finalAccess = addAccessLevel.trim() || defaultAccess;
      const addFixedNum = Number(addKasbonFixedLimit.replace(/\D/g, "")) || 0;
      const addPercentNum = Number(addKasbonPercentLimit) || 50;

      // 3. Save UserProfile doc to Firestore
      const newProfile: UserProfile = {
        uid: newUid,
        username: rawUname,
        displayName: fullName || rawUname,
        password: cleanPass,
        role: addRole,
        status: "aktif",
        accessLevel: finalAccess,
        jobTitle: addJobTitle.trim() || undefined,
        phone: addPhone.trim() || undefined,
        email: finalEmail,
        kasbonPlafondType: addKasbonPlafondType,
        kasbonPercentLimit: addKasbonPlafondType === "percent" ? addPercentNum : undefined,
        kasbonFixedLimit: addKasbonPlafondType === "fixed" ? addFixedNum : undefined,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", newUid), sanitizeForFirestore(newProfile));

      const successText = regResult.isExistingAuth
        ? `Akun "${fullName || rawUname}" (${roleName}) berhasil dihubungkan kembali dan diaktifkan!`
        : `Berhasil mendaftarkan anggota tim "${fullName || rawUname}" (${roleName})!`;
      onNotify(successText, "success");

      // Reset form and close
      setIsAddUserModalOpen(false);
      setAddFullName("");
      setAddUsername("");
      setAddPassword("mateha123");
      setAddRole("staff");
      setAddJobTitle("");
      setAddPhone("");
      setAddCustomEmail("");
      setAddUseCustomEmail(false);
      setAddAccessLevel("");
      setAddKasbonPlafondType("percent");
      setAddKasbonPercentLimit("50");
      setAddKasbonFixedLimit("");
    } catch (err: any) {
      console.warn("Handled team member registration error:", err?.message || err);
      let msg = err?.message || "Terjadi kesalahan saat mendaftarkan anggota tim.";
      if (msg.includes("email-already-in-use") || err.name === "EmailAlreadyInUseError") {
        msg = `Username atau email "${finalEmail}" sudah pernah digunakan sebelumnya di Firebase Auth dengan kata sandi berbeda. Silakan gunakan username/email lain (contoh: ${rawUname}2), atau hubungi personil untuk login dengan kata sandi mereka.`;
      } else if (msg.includes("weak-password")) {
        msg = "Password terlalu lemah, minimal 6 karakter.";
      }
      onNotify(msg, "error");
    } finally {
      setCreatingUser(false);
    }
  };

  // Toggle user status aktif/nonaktif directly from table
  const handleToggleStatus = async (user: UserProfile) => {
    if (user.uid === currentUserId) {
      onNotify("Anda tidak dapat menonaktifkan akun Anda sendiri!", "error");
      return;
    }
    const nextStatus = user.status === "nonaktif" ? "aktif" : "nonaktif";
    try {
      await updateDoc(doc(db, "users", user.uid), {
        status: nextStatus
      });
      onNotify(`Status pengguna "${user.username}" diubah menjadi ${nextStatus.toUpperCase()}!`, "success");
    } catch (err: any) {
      console.error(err);
      onNotify("Gagal mengubah status: " + err.message, "error");
    }
  };

  // Delete User from Firestore
  const handleDeleteUser = async (userId: string, username: string) => {
    if (userId === currentUserId) {
      onNotify("Anda tidak dapat menghapus akun Anda sendiri!", "error");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Hapus Anggota Tim",
      message: `Apakah Anda yakin ingin menghapus sistem akses untuk pengguna "${username}"? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, Hapus Akses",
      cancelText: "Batal",
      type: "delete",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "users", userId));
          onNotify(`Berhasil menghapus akses pengguna "${username}"!`, "success");
        } catch (err: any) {
          console.error(err);
          onNotify("Gagal menghapus pengguna: " + err.message, "error");
        }
        setConfirmModal(null);
      }
    });
  };

  // Preset management for RAB
  const handleAddPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetRoleName.trim()) {
      onNotify("Nama peran tidak boleh kosong!", "error");
      return;
    }

    const newPreset: Partial<StaffRolePreset> = {
      id: `preset-${Date.now()}`,
      roleName: newPresetRoleName.trim(),
      defaultNames: newDefaultNames.trim(),
    };
    if (newDefaultExpense && !isNaN(Number(newDefaultExpense))) {
      newPreset.defaultExpense = Number(newDefaultExpense);
    }

    const updatedPresets = [...presets, newPreset];
    try {
      await setDoc(doc(db, "settings", "staff_presets"), sanitizeForFirestore({
        presets: updatedPresets
      }));
      onNotify(`Berhasil menambahkan master preset "${newPresetRoleName.trim()}"!`, "success");
      setNewPresetRoleName("");
      setNewDefaultNames("");
      setNewDefaultExpense("");
    } catch (err: any) {
      console.error(err);
      onNotify("Gagal menyimpan preset: " + err.message, "error");
    }
  };

  const handleDeletePreset = async (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Hapus Preset Peran",
      message: `Apakah Anda yakin ingin menghapus preset "${name}" dari drop-down pilihan divisi/jabatan RAB?`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      type: "delete",
      onConfirm: async () => {
        const updatedPresets = presets.filter(p => p.id !== id);
        try {
          await setDoc(doc(db, "settings", "staff_presets"), {
            presets: updatedPresets
          });
          onNotify(`Berhasil menghapus preset "${name}"!`, "success");
        } catch (err: any) {
          console.error(err);
          onNotify("Gagal menghapus preset: " + err.message, "error");
        }
        setConfirmModal(null);
      }
    });
  };

  const filteredUsers = users.filter((u) => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.role || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-left">
      {/* HEADER HERO */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0c0e12]/80 border border-slate-900 p-6 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-lg font-extrabold text-white tracking-tight flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>Manajemen Anggota Tim & Kustomisasi Peran</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Kelola daftar anggota tim, status aktif, hak akses, password, dan kustomisasi peran baru untuk sistem Mateha.
          </p>
        </div>

        <div className="w-full sm:w-auto flex items-center space-x-2.5">
          <div className="relative flex-1 sm:w-60">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Cari username / peran..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#080a0f] border border-slate-800 focus:border-indigo-500 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsAddUserModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-500/10 transition cursor-pointer shrink-0 active:scale-95"
          >
            <UserPlus className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            <span>Tambah Anggota Tim</span>
          </button>
        </div>
      </div>

      {/* INFO BANNER */}
      <div className="bg-indigo-950/20 border border-indigo-500/15 rounded-2xl p-4 flex items-start space-x-3 text-xs leading-relaxed text-indigo-300">
        <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-extrabold block mb-0.5">Integrasi Anggota Tim & Lembar Kerja (Point D)</span>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            Seluruh nama PIC/Roster pada Point D Lembar Kerja sekarang mengambil langsung dari <strong>Daftar Anggota Tim</strong> di bawah ini. Anda dapat mengedit peran, password, status aktif, dan hak akses setiap personil secara terpusat.
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: DAFTAR ANGGOTA TIM (TABLE) */}
      {/* ========================================================================= */}
      <div className="bg-[#0c0e12]/80 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-900 bg-[#0c0e12]/95 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-300">
              Daftar Anggota Tim ({filteredUsers.length})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono">
            <span className="text-cyan-400">● Admin: {users.filter(u => u.role === "admin").length}</span>
            <span className="text-emerald-400">● Finance: {users.filter(u => u.role === "finance").length}</span>
            <span className="text-indigo-400">● Staff: {users.filter(u => u.role === "staff" || (!["admin", "finance"].includes(u.role))).length}</span>
            <span className="text-slate-500">● Aktif: {users.filter(u => u.status !== "nonaktif").length}</span>
            <button
              onClick={() => setIsAddUserModalOpen(true)}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-lg text-[11px] font-bold font-sans transition cursor-pointer ml-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Baru</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
            <span className="text-xs font-mono">Memuat database anggota tim...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Tidak ditemukan anggota tim dengan kata kunci pencarian tersebut.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-950/40 text-slate-400 font-bold uppercase tracking-wider text-[10px] font-mono">
                  <th className="px-5 py-3.5">Username</th>
                  <th className="px-5 py-3.5">Password</th>
                  <th className="px-5 py-3.5">Peran Aktif</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Limit Kasbon</th>
                  <th className="px-5 py-3.5">Hak Akses</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 font-sans">
                {filteredUsers.map((item) => {
                  const isMe = item.uid === currentUserId;
                  const isAktif = item.status !== "nonaktif";
                  return (
                    <tr 
                      key={item.uid} 
                      className={`hover:bg-slate-900/20 transition ${isMe ? "bg-cyan-500/5" : ""} ${!isAktif ? "opacity-60" : ""}`}
                    >
                      {/* 1. Username & Profile */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs uppercase shadow-sm shrink-0 ${
                            item.role === "admin" 
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" 
                              : item.role === "finance"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                          }`}>
                            {(item.displayName || item.username).charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-slate-100 flex items-center space-x-1.5 leading-snug">
                              <span>{item.displayName || item.username}</span>
                              {item.displayName && item.displayName !== item.username && (
                                <span className="text-[10px] text-slate-400 font-mono font-normal">
                                  (@{item.username})
                                </span>
                              )}
                              {isMe && (
                                <span className="text-[8px] bg-cyan-400 text-slate-950 font-mono py-0.2 px-1 rounded font-extrabold uppercase">
                                  Anda
                                </span>
                              )}
                            </span>
                            <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
                              <span>{item.email || `${item.username.toLowerCase()}@mateha.local`}</span>
                              {item.jobTitle && (
                                <>
                                  <span>·</span>
                                  <span className="text-cyan-400/80 font-sans font-medium">{item.jobTitle}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Password */}
                      <td className="px-5 py-3.5 font-mono text-slate-400 text-[11px]">
                        {item.password ? (
                          <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-900 text-slate-300">
                            {item.password}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Tersandi (Auth)</span>
                        )}
                      </td>

                      {/* 3. Peran Aktif */}
                      <td className="px-5 py-3.5">
                        {(() => {
                          const matchedCustom = customRoles.find(
                            (r) => r.id === item.role || r.name.toLowerCase() === item.role?.toLowerCase()
                          );
                          const style = getRoleBadgeStyle(matchedCustom?.color, item.role);
                          return (
                            <span className={`inline-flex items-center space-x-1 py-0.5 px-2 rounded-full text-[10px] uppercase font-bold ${style.bg} ${style.text} border ${style.border}`}>
                              {item.role === "admin" ? (
                                <ShieldCheck className="w-3 h-3" />
                              ) : (
                                <Users className="w-3 h-3" />
                              )}
                              <span>{matchedCustom?.name || item.role}</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* 4. Status */}
                      <td className="px-5 py-3.5">
                        <button
                          disabled={isMe}
                          onClick={() => handleToggleStatus(item)}
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition cursor-pointer ${
                            isAktif
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                          } ${isMe ? "cursor-default opacity-80" : ""}`}
                          title={isMe ? "Tidak bisa mengubah akun sendiri" : "Klik untuk toggle status"}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isAktif ? "bg-emerald-400" : "bg-rose-400"}`} />
                          <span>{isAktif ? "Aktif" : "Nonaktif"}</span>
                        </button>
                      </td>

                      {/* 5. Limit Plafond Kasbon */}
                      <td className="px-5 py-3.5">
                        {item.kasbonPlafondType === "fixed" ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20" title={`Limit Tetap Bulanan: ${formatRupiah(item.kasbonFixedLimit || 0)}`}>
                            <Wallet className="w-3 h-3 text-indigo-400" />
                            <span>{formatRupiah(item.kasbonFixedLimit || 0)}</span>
                          </span>
                        ) : item.kasbonPlafondType === "unlimited" ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20" title="Bebas nominal pengajuan, diverifikasi langsung saat approval">
                            <Sparkles className="w-3 h-3 text-purple-400" />
                            <span>Bebas (Unlimited)</span>
                          </span>
                        ) : item.kasbonPlafondType === "auto" ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Dihitung 100% dari Honor Event (Point D & PIC) periode berjalan">
                            <span>100% Honor Event</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20" title={`Limit ${item.kasbonPercentLimit ?? 50}% dari total THP bruto (Gaji/Honor + Reimbursement)`}>
                            <Wallet className="w-3 h-3 text-amber-400" />
                            <span>{item.kasbonPercentLimit ?? 50}% THP</span>
                          </span>
                        )}
                      </td>

                      {/* 6. Hak Akses */}
                      <td className="px-5 py-3.5 text-slate-300 font-mono text-[11px] max-w-[200px] truncate">
                        {item.accessLevel || (
                          item.role === "admin"
                            ? "Akses Penuh (Full Dashboard)"
                            : item.role === "finance"
                            ? "Khusus Invoice, Quotation & Kwitansi"
                            : "Input RAB, Realisasi & Payslip"
                        )}
                      </td>

                      {/* 7. Aksi */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEditUser(item)}
                            className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition cursor-pointer"
                            title="Edit Peran, Password & Hak Akses"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!isMe && (
                            <button
                              onClick={() => handleDeleteUser(item.uid, item.username)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                              title="Hapus Pengguna"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: KUSTOMISASI PERAN & HAK AKSES FITUR (ROLE MANAGEMENT) */}
      {/* ========================================================================= */}
      <div className="bg-[#0c0e12]/80 border border-slate-900 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-white tracking-tight flex items-center space-x-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span>Kustomisasi Peran & Fitur (Role Management)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Admin dapat mengkostumisasi fitur-fitur yang diizinkan untuk setiap peran (termasuk peran sistem & peran kustom baru) serta mengedit tiap peran yang sudah terbuat.
            </p>
          </div>
          {editingRole && (
            <button
              onClick={handleCancelEditRole}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition cursor-pointer"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Batal Edit Peran</span>
            </button>
          )}
        </div>

        {/* Form Tambah / Edit Peran & Fitur */}
        <form 
          id="role-management-form"
          onSubmit={handleSaveCustomRole} 
          className="bg-slate-950/60 border border-slate-850 p-5 rounded-2xl space-y-5 font-sans shadow-inner"
        >
          {editingRole && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-amber-300 font-medium">
                <SlidersHorizontal className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Sedang Mengedit: <strong>{editingRole.name}</strong> {editingRole.isSystem && <span className="text-[10px] text-amber-400/80 font-mono bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40 ml-1">Sistem Default</span>} — Anda dapat mengubah fitur yang diizinkan, ruang lingkup, dan warna badge peran ini.
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelEditRole}
                className="text-amber-400 hover:text-white text-xs underline font-bold cursor-pointer ml-3 shrink-0"
              >
                Batal
              </button>
            </div>
          )}

          {/* Baris 1: Nama Peran, Deskripsi, dan Pilihan Warna */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4 space-y-1.5">
              <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                Nama Peran (Role)
              </label>
              <input
                type="text"
                placeholder="e.g. Supervisor, Teknisi, Sound Engineer, Stage Manager"
                value={newCustomRoleName}
                onChange={(e) => setNewCustomRoleName(e.target.value)}
                disabled={editingRole?.isSystem}
                className={`w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none transition ${
                  editingRole?.isSystem ? "opacity-75 cursor-not-allowed bg-slate-900/60" : ""
                }`}
                required
              />
              <span className="text-[10px] text-slate-500 block">
                {editingRole?.isSystem ? "Nama peran sistem default terkunci untuk konsistensi sistem" : "Identitas nama peran untuk penugasan akun anggota tim"}
              </span>
            </div>

            <div className="md:col-span-5 space-y-1.5">
              <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                Keterangan / Ruang Lingkup Peran
              </label>
              <input
                type="text"
                placeholder="e.g. Penanggung jawab operasional lapangan & koordinasi vendor"
                value={newCustomRoleDesc}
                onChange={(e) => setNewCustomRoleDesc(e.target.value)}
                className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none transition"
              />
              <span className="text-[10px] text-slate-500 block">
                Ringkasan tanggung jawab dan ruang lingkup tugas peran ini
              </span>
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                Warna Aksen Badge
              </label>
              <div className="flex items-center space-x-2 pt-1">
                {ROLE_COLORS.map((c) => {
                  const isSelected = selectedRoleColor === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedRoleColor(c.id)}
                      className={`w-7 h-7 rounded-full ${c.bg} transition transform flex items-center justify-center cursor-pointer ${
                        isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-110 shadow-lg" : "opacity-60 hover:opacity-100 hover:scale-105"
                      }`}
                      title={c.name}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Baris 2: KUSTOMISASI HAK AKSES FITUR (CHECKBOX GRID) */}
          <div className="border-t border-slate-900 pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <label className="block text-slate-200 font-extrabold uppercase tracking-wider text-xs flex items-center space-x-2">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Kustomisasi Fitur yang Dapat Diakses</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    {selectedRoleFeatures.length} dari {ALL_SYSTEM_FEATURES.length} Fitur Aktif
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Centang modul atau tab yang diizinkan untuk dibuka oleh pengguna dengan peran ini.
                </p>
              </div>

              {/* Quick preset buttons */}
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllFeatures}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer"
                >
                  Pilih Semua ({ALL_SYSTEM_FEATURES.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPresetFeatures("staff")}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 transition cursor-pointer"
                >
                  Staff Default (2)
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPresetFeatures("finance")}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition cursor-pointer"
                >
                  Finance Default (4)
                </button>
                <button
                  type="button"
                  onClick={handleClearAllFeatures}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/30 transition cursor-pointer"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            {/* Grid 11 Fitur Sistem */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {ALL_SYSTEM_FEATURES.map((feat) => {
                const isChecked = selectedRoleFeatures.includes(feat.id);
                const IconComp = feat.icon;
                return (
                  <div
                    key={feat.id}
                    onClick={() => handleToggleRoleFeature(feat.id)}
                    className={`relative p-3 rounded-xl border transition-all cursor-pointer select-none flex items-start space-x-3 ${
                      isChecked
                        ? "bg-cyan-950/25 border-cyan-500/40 ring-1 ring-cyan-500/30 shadow-sm"
                        : "bg-slate-950/40 border-slate-850 hover:border-slate-750 hover:bg-slate-900/30"
                    }`}
                  >
                    <div className="pt-0.5 shrink-0">
                      {isChecked ? (
                        <div className="w-4 h-4 rounded bg-cyan-500 text-slate-950 flex items-center justify-center font-bold shadow-sm shadow-cyan-500/40">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded border border-slate-700 bg-slate-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs font-bold leading-tight truncate flex items-center space-x-1.5 ${isChecked ? "text-cyan-300" : "text-slate-200"}`}>
                          <IconComp className="w-3.5 h-3.5 shrink-0 opacity-80" />
                          <span>{feat.label}</span>
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800 shrink-0">
                          {feat.category === "Operasional Event" ? "Event" : feat.category === "Keuangan & Dokumen" ? "Finance" : "Master"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                        {feat.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tombol Simpan / Aksi */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-900">
            {editingRole && (
              <button
                type="button"
                onClick={handleCancelEditRole}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 transition cursor-pointer"
              >
                Batal Edit
              </button>
            )}
            <button
              type="submit"
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold py-2 px-5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-cyan-500/20 transition"
            >
              {editingRole ? (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Simpan Perubahan Peran & Fitur</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Tambah Peran Baru</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Roles Table */}
        <div className="bg-[#0c0e12]/40 rounded-xl border border-slate-900 overflow-hidden">
          {rolesLoading ? (
            <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400 mb-2" />
              <span>Memuat daftar peran...</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-900 text-slate-400 uppercase font-bold tracking-wider text-[10px] font-mono">
                  <th className="px-4 py-3">Nama Peran</th>
                  <th className="px-4 py-3">Deskripsi / Ruang Lingkup</th>
                  <th className="px-4 py-3">Fitur yang Diizinkan</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 font-sans">
                {customRoles.map((role) => {
                  const roleStyle = getRoleBadgeStyle(role.color, role.id);
                  const activeTabs = Array.isArray(role.allowedTabs) && role.allowedTabs.length > 0
                    ? role.allowedTabs
                    : role.id === "admin"
                    ? ALL_SYSTEM_FEATURES.map((f) => f.id)
                    : role.id === "finance"
                    ? ["invoice", "quotation", "kwitansi", "clients"]
                    : ["sheets", "staff-payslips"];
                  const isAll = activeTabs.length === ALL_SYSTEM_FEATURES.length;

                  return (
                    <tr key={role.id} className="hover:bg-slate-900/10 transition">
                      <td className="px-4 py-3 font-semibold text-slate-200">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${roleStyle.dot}`} />
                          <span className="font-bold">{role.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-xs">
                        {role.description || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {isAll ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                            Akses Penuh ({ALL_SYSTEM_FEATURES.length} Fitur)
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-md">
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 font-bold mr-1">
                              {activeTabs.length} Fitur:
                            </span>
                            {activeTabs.map((tabId) => {
                              const feat = ALL_SYSTEM_FEATURES.find((f) => f.id === tabId);
                              return (
                                <span
                                  key={tabId}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-900/80 text-slate-300 border border-slate-800"
                                >
                                  {feat?.shortLabel || tabId}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {role.isSystem ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-900 text-slate-400 border border-slate-800">
                            Sistem Default
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            Kustom Admin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Admin can edit ANY role, including system roles! */}
                          <button
                            onClick={() => handleStartEditRole(role)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition cursor-pointer"
                            title="Edit Peran & Kustomisasi Fitur"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit Fitur</span>
                          </button>
                          {!role.isSystem ? (
                            <button
                              onClick={() => handleDeleteCustomRole(role.id, role.name)}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                              title="Hapus Peran Kustom"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span 
                              className="p-1 text-slate-700 cursor-not-allowed" 
                              title="Peran bawaan sistem tidak dapat dihapus (namun fiturnya dapat diedit)"
                            >
                              <Lock className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: PRESET PERAN & BIAYA DI RAB (Point D Template) */}
      {/* ========================================================================= */}
      <div className="bg-[#0c0e12]/80 border border-slate-900 rounded-2xl p-6 shadow-xl space-y-5">
        <div>
          <h3 className="text-base font-extrabold text-white tracking-tight flex items-center space-x-2">
            <Briefcase className="w-4 h-4 text-emerald-400" />
            <span>Preset Template Divisi & Fee Default di RAB</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Konfigurasi template peran untuk mempercepat pengisian nama posisi & perkiraan biaya saat membuat RAB baru.
          </p>
        </div>

        <form onSubmit={handleAddPreset} className="bg-slate-950/40 border border-slate-900 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3 font-sans">
          <div className="space-y-1">
            <label className="block text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Posisi / Divisi</label>
            <input
              type="text"
              placeholder="e.g. TD, FOH, Camera"
              value={newPresetRoleName}
              onChange={(e) => setNewPresetRoleName(e.target.value)}
              className="w-full bg-[#080a0f] border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Penerima Default (Notes)</label>
            <input
              type="text"
              placeholder="e.g. Jimmy, Kobil"
              value={newDefaultNames}
              onChange={(e) => setNewDefaultNames(e.target.value)}
              className="w-full bg-[#080a0f] border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Fee Default per Orang (Rp)</label>
            <input
              type="number"
              placeholder="400000"
              value={newDefaultExpense}
              onChange={(e) => setNewDefaultExpense(e.target.value)}
              className="w-full bg-[#080a0f] border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none font-mono"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold py-2 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 cursor-pointer h-[36px]"
            >
              <Plus className="w-4 h-4 text-slate-950" />
              <span>Simpan Preset</span>
            </button>
          </div>
        </form>

        <div className="bg-[#0c0e12]/40 rounded-xl overflow-hidden border border-slate-900">
          {presetsLoading ? (
            <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400 mb-2" />
              <span>Memuat preset...</span>
            </div>
          ) : presets.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Belum ada master template peran staf diatur.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-900 text-slate-400 uppercase font-bold tracking-wider text-[10px] font-mono">
                  <th className="px-4 py-3">Nama Divisi</th>
                  <th className="px-4 py-3">Penerima Default (Notes)</th>
                  <th className="px-4 py-3">Fee Default</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 font-sans">
                {presets.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/10 transition">
                    <td className="px-4 py-3 font-semibold text-slate-200">{p.roleName}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {p.defaultNames || <span className="text-slate-600 italic">Belum diatur</span>}
                    </td>
                    <td className="px-4 py-3 text-emerald-400 font-mono">
                      {p.defaultExpense ? formatRupiah(p.defaultExpense) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeletePreset(p.id, p.roleName)}
                        className="text-slate-500 hover:text-rose-400 transition p-1 cursor-pointer"
                        title="Hapus Preset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL EDIT ANGGOTA TIM (Password, Peran, Status, Hak Akses) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm shadow-2xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0e1117] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-left"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-extrabold text-white">
                    Edit Anggota: {editingUser.username}
                  </h3>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-slate-500 hover:text-white text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="space-y-3.5 font-sans">
                {/* 1. Nama Lengkap */}
                <div>
                  <label className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">
                    Nama Lengkap / Panggilan
                  </label>
                  <input
                    type="text"
                    placeholder="Masukkan nama lengkap personil..."
                    value={editDisplayNameInput}
                    onChange={(e) => setEditDisplayNameInput(e.target.value)}
                    className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                {/* 2. Username (read only) */}
                <div>
                  <label className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">
                    Username Sistem
                  </label>
                  <input
                    type="text"
                    value={editingUser.username}
                    disabled
                    className="w-full bg-[#080a0f] border border-slate-900 rounded-xl py-2 px-3 text-xs text-slate-400 font-mono cursor-not-allowed"
                  />
                </div>

                {/* 3. Posisi Lapangan & Telepon */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">
                      Posisi / Jabatan
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sound Engineer"
                      value={editJobTitleInput}
                      onChange={(e) => setEditJobTitleInput(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">
                      No. WhatsApp / HP
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 081234567890"
                      value={editPhoneInput}
                      onChange={(e) => setEditPhoneInput(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* 4. Password */}
                <div>
                  <label className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">
                    Password Akun
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Masukkan password baru / catatan password..."
                      value={editPasswordInput}
                      onChange={(e) => setEditPasswordInput(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-200 font-mono focus:outline-none"
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 block mt-1">
                    Catatan: Password tersimpan di profil anggota tim untuk memudahkan administrasi.
                  </span>
                </div>

                {/* 5. Peran Aktif */}
                <div>
                  <label className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">
                    Peran Aktif
                  </label>
                  <select
                    value={editRoleInput}
                    onChange={(e) => setEditRoleInput(e.target.value)}
                    className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none cursor-pointer"
                  >
                    {customRoles.map((r) => (
                      <option key={r.id} value={r.id.toLowerCase()}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Status Aktif */}
                <div>
                  <label className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">
                    Status Akun
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditStatusInput("aktif")}
                      className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                        editStatusInput === "aktif"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-950 text-slate-500 border border-slate-850 hover:text-slate-300"
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Aktif</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditStatusInput("nonaktif")}
                      className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                        editStatusInput === "nonaktif"
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : "bg-slate-950 text-slate-500 border border-slate-850 hover:text-slate-300"
                      }`}
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>Nonaktif</span>
                    </button>
                  </div>
                </div>

                {/* 7. Pengaturan Limit Plafond Kasbon */}
                <div className="bg-[#080a0f] border border-slate-800/80 p-3.5 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-850">
                    <label className="text-slate-200 font-bold text-[10px] uppercase tracking-wider flex items-center space-x-1.5">
                      <Wallet className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pengaturan Limit Plafond Kasbon</span>
                    </label>
                    <span className="text-[9px] text-slate-500 font-mono">Batas Pengajuan Staff</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {/* 1. Persen dari THP (Default 50%) */}
                    <button
                      type="button"
                      onClick={() => setEditKasbonPlafondType("percent")}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                        editKasbonPlafondType === "percent"
                          ? "bg-amber-500/10 border-amber-500/40 text-amber-300 ring-1 ring-amber-500/20"
                          : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">% dari THP</span>
                        {editKasbonPlafondType === "percent" && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-snug">
                        {editKasbonPercentLimit || "50"}% dari Total THP Bruto (Gaji + Reimburse)
                      </p>
                    </button>

                    {/* 2. Nominal Tetap */}
                    <button
                      type="button"
                      onClick={() => setEditKasbonPlafondType("fixed")}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                        editKasbonPlafondType === "fixed"
                          ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/20"
                          : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Nominal Khusus</span>
                        {editKasbonPlafondType === "fixed" && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-snug">
                        Limit bulanan tetap ditentukan Admin
                      </p>
                    </button>

                    {/* 3. Otomatis Event */}
                    <button
                      type="button"
                      onClick={() => setEditKasbonPlafondType("auto")}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                        editKasbonPlafondType === "auto"
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/20"
                          : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">100% Honor Event</span>
                        {editKasbonPlafondType === "auto" && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-snug">
                        Sesuai Honor Lapangan (Point D & PIC)
                      </p>
                    </button>

                    {/* 4. Bebas / Unlimited */}
                    <button
                      type="button"
                      onClick={() => setEditKasbonPlafondType("unlimited")}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                        editKasbonPlafondType === "unlimited"
                          ? "bg-purple-500/10 border-purple-500/40 text-purple-300 ring-1 ring-purple-500/20"
                          : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Bebas / Unlimited</span>
                        {editKasbonPlafondType === "unlimited" && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-snug">
                        Tanpa batas, diverifikasi saat approve
                      </p>
                    </button>
                  </div>

                  {editKasbonPlafondType === "percent" && (
                    <div className="pt-2 border-t border-slate-850/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-300 text-[10px] font-semibold uppercase">
                          Persentase dari Total THP Bruto (%)
                        </label>
                        <div className="flex items-center space-x-1">
                          {["30", "50", "70", "100"].map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setEditKasbonPercentLimit(p)}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                                editKasbonPercentLimit === p
                                  ? "bg-amber-500 text-slate-950 font-extrabold"
                                  : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                              }`}
                            >
                              {p}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="50"
                          step="any"
                          min="0"
                          max="100"
                          value={editKasbonPercentLimit}
                          onChange={(e) => setEditKasbonPercentLimit(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl py-2 px-3 pr-8 text-xs text-slate-100 font-mono focus:outline-none"
                        />
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 text-xs font-mono font-bold">
                          %
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        💡 <strong>Formula THP:</strong> Plafond kasbon = <strong>{editKasbonPercentLimit || "50"}%</strong> &times; (Total Gaji/Honor + Reimbursement + Tambahan). Sisa gaji bersih yang diterima saat gajian = Total Pendapatan &minus; Kasbon.
                      </p>
                    </div>
                  )}

                  {editKasbonPlafondType === "fixed" && (
                    <div className="pt-2 border-t border-slate-850/60 space-y-1.5">
                      <label className="block text-slate-300 text-[10px] font-semibold uppercase">
                        Nominal Batas Plafond Kasbon Bulanan (Rp)
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 text-xs font-mono">
                          Rp
                        </span>
                        <input
                          type="number"
                          placeholder="Contoh: 2000000"
                          step="any"
                          min="0"
                          value={editKasbonFixedLimit}
                          onChange={(e) => setEditKasbonFixedLimit(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-100 font-mono focus:outline-none"
                        />
                      </div>
                      {editKasbonFixedLimit && Number(editKasbonFixedLimit) > 0 && (
                        <span className="text-[10px] text-indigo-400 font-mono mt-1 block">
                          Terbilang: {formatRupiah(Number(editKasbonFixedLimit))} per bulan
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 8. Hak Akses */}
                <div>
                  <label className="block text-slate-400 font-semibold text-[10px] uppercase tracking-wider mb-1">
                    Deskripsi Hak Akses
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Akses Penuh / Terbatas Input RAB & Slip"
                    value={editAccessInput}
                    onChange={(e) => setEditAccessInput(e.target.value)}
                    className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingUser}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold text-slate-950 bg-cyan-500 hover:bg-cyan-400 transition cursor-pointer flex items-center space-x-1.5"
                  >
                    {savingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Simpan Perubahan</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL TAMBAH ANGGOTA TIM BARU (ADMIN ONLY) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isAddUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm shadow-2xl overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0e1117] border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-left my-8"
            >
              <div className="flex justify-between items-start pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                      <span>Tambah Anggota Tim Baru</span>
                      <span className="text-[9px] bg-cyan-500/20 text-cyan-300 font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 uppercase font-bold">
                        Fitur Admin
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Daftarkan anggota tim baru ke sistem Mateha secara terpusat.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="text-slate-500 hover:text-white text-xs font-bold cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-3.5 font-sans">
                {/* 1. Nama Lengkap & Username */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold text-[10px] uppercase tracking-wider mb-1">
                      Nama Lengkap / Panggilan <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                        <User className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: Dian Pratama"
                        value={addFullName}
                        onChange={(e) => setAddFullName(e.target.value)}
                        className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-200 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold text-[10px] uppercase tracking-wider mb-1">
                      Username Login <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: dian"
                      value={addUsername}
                      onChange={(e) =>
                        setAddUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ""))
                      }
                      className={`w-full bg-[#080a0f] border ${
                        users.some(u => u.username.toLowerCase() === addUsername.trim().toLowerCase() && addUsername.trim().length > 0)
                          ? "border-amber-500 focus:border-amber-400 ring-1 ring-amber-500/30"
                          : "border-slate-800 focus:border-cyan-500"
                      } rounded-xl py-2 px-3 text-xs text-slate-200 font-mono focus:outline-none`}
                    />
                    {(() => {
                      const cleanU = addUsername.trim().toLowerCase();
                      const existingMatch = cleanU ? users.find(u => u.username.toLowerCase() === cleanU) : null;
                      if (!existingMatch) return null;
                      return (
                        <div className="mt-1 flex items-center justify-between text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                          <span>
                            Sudah ada: <strong>{existingMatch.displayName || existingMatch.username}</strong> ({existingMatch.role})
                          </span>
                          <button
                            type="button"
                            onClick={() => setAddUsername(`${cleanU}2`)}
                            className="text-cyan-400 hover:text-cyan-300 underline font-mono cursor-pointer ml-1"
                          >
                            Gunakan "{cleanU}2"
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Email Preview and toggle */}
                <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center space-x-1.5 font-mono text-[10px]">
                      <Mail className="w-3 h-3 text-slate-500" />
                      <span>Email Identifikasi Login:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddUseCustomEmail(!addUseCustomEmail)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      {addUseCustomEmail ? "Gunakan email sistem otomatis" : "Gunakan email pribadi/Google"}
                    </button>
                  </div>

                  {addUseCustomEmail ? (
                    <input
                      type="email"
                      required
                      placeholder="email.anggota@gmail.com"
                      value={addCustomEmail}
                      onChange={(e) => setAddCustomEmail(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-lg py-1.5 px-2.5 text-xs text-slate-200 font-mono focus:outline-none"
                    />
                  ) : (
                    <div className="text-slate-300 font-mono text-[11px] bg-[#080a0f] px-2.5 py-1.5 rounded-lg border border-slate-900 flex items-center justify-between">
                      <span>{addUsername ? `${addUsername}@mateha.local` : "username@mateha.local"}</span>
                      <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        Otomatis Sistem
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Password Akun */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-slate-300 font-bold text-[10px] uppercase tracking-wider">
                      Kata Sandi (Password) <span className="text-rose-400">*</span>
                    </label>
                    <div className="flex items-center space-x-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setAddPassword("mateha123")}
                        className="text-slate-400 hover:text-cyan-400 cursor-pointer"
                      >
                        Reset "mateha123"
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const randomPass = Math.random().toString(36).substring(2, 8) + "123";
                          setAddPassword(randomPass);
                        }}
                        className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Acak Password</span>
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type={addShowPassword ? "text" : "password"}
                      required
                      placeholder="Minimal 6 karakter"
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 pl-9 pr-10 text-xs text-slate-200 font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setAddShowPassword(!addShowPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                      tabIndex={-1}
                    >
                      {addShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <span className="text-[9px] text-slate-500 block mt-1">
                    Anggota dapat masuk ke aplikasi dengan username dan password ini.
                  </span>
                </div>

                {/* 3. Peran (Role) & Penugasan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold text-[10px] uppercase tracking-wider mb-1">
                      Peran Sistem <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={addRole}
                      onChange={(e) => setAddRole(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none cursor-pointer"
                    >
                      {customRoles.map((r) => (
                        <option key={r.id} value={r.id.toLowerCase()}>
                          {r.name} {r.isSystem ? "(Bawaan)" : "(Custom)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold text-[10px] uppercase tracking-wider mb-1">
                      Posisi / Jabatan Lapangan
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Sound Engineer, Operator"
                      list="admin-add-job-presets"
                      value={addJobTitle}
                      onChange={(e) => setAddJobTitle(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
                    />
                    <datalist id="admin-add-job-presets">
                      {presets.map((p) => (
                        <option key={p.id} value={p.roleName} />
                      ))}
                      <option value="Sound Engineer" />
                      <option value="Lighting Operator" />
                      <option value="Stage Manager" />
                      <option value="Visual / Multimedia" />
                      <option value="Staff Finance" />
                      <option value="Admin Produksi" />
                    </datalist>
                  </div>
                </div>

                {/* Role Features Preview */}
                {(() => {
                  const selectedRoleObj = customRoles.find(
                    (r) => r.id === addRole || r.name.toLowerCase() === addRole.toLowerCase()
                  );
                  const allowedTabs = selectedRoleObj?.allowedTabs || ["sheets", "staff-payslips"];
                  return (
                    <div className="p-2.5 bg-slate-900/40 border border-slate-800/80 rounded-xl text-[10px]">
                      <span className="text-slate-400 font-mono block mb-1">
                        Hak Akses Tab untuk Peran <strong>{selectedRoleObj?.name || addRole}</strong>:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {allowedTabs.map((t) => {
                          const feat = ALL_SYSTEM_FEATURES.find((f) => f.id === t);
                          return (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded font-mono"
                            >
                              {feat?.label || t}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Pengaturan Limit Plafond Kasbon */}
                <div className="bg-[#080a0f] border border-slate-800/80 p-3.5 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-850">
                    <label className="text-slate-200 font-bold text-[10px] uppercase tracking-wider flex items-center space-x-1.5">
                      <Wallet className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pengaturan Limit Plafond Kasbon</span>
                    </label>
                    <span className="text-[9px] text-slate-500 font-mono">Batas Pengajuan Staff</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {/* 1. Persen dari THP (Default 50%) */}
                    <button
                      type="button"
                      onClick={() => setAddKasbonPlafondType("percent")}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                        addKasbonPlafondType === "percent"
                          ? "bg-amber-500/10 border-amber-500/40 text-amber-300 ring-1 ring-amber-500/20"
                          : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">% dari THP</span>
                        {addKasbonPlafondType === "percent" && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-snug">
                        {addKasbonPercentLimit || "50"}% dari Total THP Bruto (Gaji + Reimburse)
                      </p>
                    </button>

                    {/* 2. Nominal Tetap */}
                    <button
                      type="button"
                      onClick={() => setAddKasbonPlafondType("fixed")}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                        addKasbonPlafondType === "fixed"
                          ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/20"
                          : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Nominal Khusus</span>
                        {addKasbonPlafondType === "fixed" && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-snug">
                        Limit bulanan tetap ditentukan Admin
                      </p>
                    </button>

                    {/* 3. Otomatis Event */}
                    <button
                      type="button"
                      onClick={() => setAddKasbonPlafondType("auto")}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                        addKasbonPlafondType === "auto"
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/20"
                          : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">100% Honor Event</span>
                        {addKasbonPlafondType === "auto" && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-snug">
                        Sesuai Honor Lapangan (Point D & PIC)
                      </p>
                    </button>

                    {/* 4. Bebas / Unlimited */}
                    <button
                      type="button"
                      onClick={() => setAddKasbonPlafondType("unlimited")}
                      className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                        addKasbonPlafondType === "unlimited"
                          ? "bg-purple-500/10 border-purple-500/40 text-purple-300 ring-1 ring-purple-500/20"
                          : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Bebas / Unlimited</span>
                        {addKasbonPlafondType === "unlimited" && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-snug">
                        Tanpa batas, diverifikasi saat approve
                      </p>
                    </button>
                  </div>

                  {addKasbonPlafondType === "percent" && (
                    <div className="pt-2 border-t border-slate-850/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-300 text-[10px] font-semibold uppercase">
                          Persentase dari Total THP Bruto (%)
                        </label>
                        <div className="flex items-center space-x-1">
                          {["30", "50", "70", "100"].map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setAddKasbonPercentLimit(p)}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                                addKasbonPercentLimit === p
                                  ? "bg-amber-500 text-slate-950 font-extrabold"
                                  : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                              }`}
                            >
                              {p}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="50"
                          step="any"
                          min="0"
                          max="100"
                          value={addKasbonPercentLimit}
                          onChange={(e) => setAddKasbonPercentLimit(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl py-2 px-3 pr-8 text-xs text-slate-100 font-mono focus:outline-none"
                        />
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 text-xs font-mono font-bold">
                          %
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        💡 <strong>Formula THP:</strong> Plafond kasbon = <strong>{addKasbonPercentLimit || "50"}%</strong> &times; (Total Gaji/Honor + Reimbursement + Tambahan). Sisa gaji bersih yang diterima saat gajian = Total Pendapatan &minus; Kasbon.
                      </p>
                    </div>
                  )}

                  {addKasbonPlafondType === "fixed" && (
                    <div className="pt-2 border-t border-slate-850/60 space-y-1.5">
                      <label className="block text-slate-300 text-[10px] font-semibold uppercase">
                        Nominal Batas Plafond Kasbon Bulanan (Rp)
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 text-xs font-mono">
                          Rp
                        </span>
                        <input
                          type="number"
                          placeholder="Contoh: 2000000"
                          step="any"
                          min="0"
                          value={addKasbonFixedLimit}
                          onChange={(e) => setAddKasbonFixedLimit(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-100 font-mono focus:outline-none"
                        />
                      </div>
                      {addKasbonFixedLimit && Number(addKasbonFixedLimit) > 0 && (
                        <span className="text-[10px] text-indigo-400 font-mono mt-1 block">
                          Terbilang: {formatRupiah(Number(addKasbonFixedLimit))} per bulan
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 5. Nomor WhatsApp & Keterangan Hak Akses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold text-[10px] uppercase tracking-wider mb-1">
                      No. WhatsApp / HP
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                        <Phone className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        placeholder="0812-xxxx-xxxx"
                        value={addPhone}
                        onChange={(e) => setAddPhone(e.target.value)}
                        className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-200 font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold text-[10px] uppercase tracking-wider mb-1">
                      Keterangan Hak Akses
                    </label>
                    <input
                      type="text"
                      placeholder="Otomatis dari peran atau kustom..."
                      value={addAccessLevel}
                      onChange={(e) => setAddAccessLevel(e.target.value)}
                      className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddUserModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={
                      creatingUser ||
                      users.some(
                        (u) =>
                          u.username.toLowerCase() === addUsername.trim().toLowerCase() &&
                          addUsername.trim().length > 0
                      )
                    }
                    className="px-5 py-2 rounded-xl text-xs font-extrabold text-slate-950 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer flex items-center space-x-2 shadow-lg shadow-cyan-500/10"
                  >
                    {creatingUser ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Mendaftarkan ke Firebase...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Daftarkan Anggota Tim</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION MODAL */}
      <AnimatePresence>
        {confirmModal && confirmModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm shadow-2xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0e1117] border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-left"
            >
              <div className="flex items-center space-x-2 text-rose-400">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-sm font-extrabold text-white">{confirmModal.title}</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                {confirmModal.message}
              </p>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-900 transition cursor-pointer"
                >
                  {confirmModal.cancelText}
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="px-3 py-1.5 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-500 transition cursor-pointer"
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
