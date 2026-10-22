import React, { useState, useEffect, useRef } from "react";
import { EventProject, BudgetItem, formatRupiah, UserProfile } from "../types";
import { setDoc, doc, collection, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from "../utils/firebase";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Users, 
  ArrowRight, 
  Table, 
  Calendar, 
  MapPin, 
  LogOut, 
  Camera, 
  Sparkles, 
  Loader2, 
  Upload, 
  FileText, 
  X, 
  Eye, 
  CheckCircle2, 
  AlertCircle,
  ImageIcon,
  Store,
  Trash2
} from "lucide-react";
import ReceiptScannerModal from "./ReceiptScannerModal";

interface CollaborationViewProps {
  project: EventProject;
  userEmail: string;
  registeredUsers?: UserProfile[];
  onLogout: () => void;
  onGoToDashboard: () => void;
  onNotify: (text: string, type?: "success" | "error") => void;
}

export default function CollaborationView({
  project,
  userEmail,
  registeredUsers = [],
  onLogout,
  onGoToDashboard,
  onNotify,
}: CollaborationViewProps) {
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [expense, setExpense] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [customPic, setCustomPic] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Real-time team members from "Daftar Anggota Tim" (users collection)
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>(
    registeredUsers.filter(u => u.status !== "nonaktif")
  );
  const [loadingMembers, setLoadingMembers] = useState(registeredUsers.length === 0);
  
  // AI State in form
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [aiDetectedMerchant, setAiDetectedMerchant] = useState<string | null>(null);
  const [aiScanSuccess, setAiScanSuccess] = useState(false);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when registeredUsers prop updates
  useEffect(() => {
    if (registeredUsers && registeredUsers.length > 0) {
      const active = registeredUsers.filter((u) => u.status !== "nonaktif");
      active.sort((a, b) => {
        const nameA = (a.displayName || a.username || "").toLowerCase();
        const nameB = (b.displayName || b.username || "").toLowerCase();
        return nameA.localeCompare(nameB, "id");
      });
      setTeamMembers(active);
      setLoadingMembers(false);
    }
  }, [registeredUsers]);

  // Real-time listener directly to collection "users" (Daftar Anggota Tim)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const list: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as UserProfile;
          if (data && data.username && data.status !== "nonaktif") {
            list.push(data);
          }
        });
        list.sort((a, b) => {
          const nameA = (a.displayName || a.username || "").toLowerCase();
          const nameB = (b.displayName || b.username || "").toLowerCase();
          return nameA.localeCompare(nameB, "id");
        });
        setTeamMembers(list);
        setLoadingMembers(false);
      },
      (error) => {
        console.error("Failed to load registered users in CollaborationView:", error);
        setLoadingMembers(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Handle direct file upload for AI parsing
  const handleFileUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onNotify("File harus berupa gambar struk / nota (JPG, PNG, dll.)", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setReceiptImage(base64);
      processReceiptWithAI(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const processReceiptWithAI = async (base64Data: string, mimeType: string) => {
    setIsScanningAI(true);
    setAiScanSuccess(false);
    setAiDetectedMerchant(null);

    try {
      const response = await fetch("/api/gemini/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: mimeType || "image/jpeg",
        }),
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || "Gagal memproses struk dengan AI");
      }

      const { data } = resJson;
      setDesc(data.description || "Pengeluaran Operasional");
      setQty(data.qty || 1);
      setExpense(data.expense || 0);
      if (data.merchant) {
        setAiDetectedMerchant(data.merchant);
      }
      setAiScanSuccess(true);
      onNotify("Struk berhasil dibaca oleh AI! Silakan pilih PIC penanggung jawab.", "success");
    } catch (err: any) {
      console.error("AI Receipt Error:", err);
      onNotify(err.message || "Gagal menganalisis struk otomatis. Anda dapat mengetik manual.", "error");
    } finally {
      setIsScanningAI(false);
    }
  };

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) {
      onNotify("Deskripsi pengeluaran tidak boleh kosong!", "error");
      return;
    }

    const finalPic = (notes === "__custom__" ? customPic : notes).trim();
    if (!finalPic) {
      onNotify("Silakan pilih atau masukkan penanggung jawab (PIC / PJ)!", "error");
      return;
    }

    const currentCosts = project.realisasi.accommodation || [];
    const nextNum = currentCosts.length > 0
      ? (parseInt(currentCosts[currentCosts.length - 1].num as string) || currentCosts.length) + 1
      : 1;

    const newItem: BudgetItem = {
      id: `collab-ac-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      num: nextNum,
      description: desc.trim(),
      qty: Number(qty) || 1,
      expense: Number(expense) || 0,
      notes: finalPic,
      receiptImage: receiptImage || undefined,
    };

    setSubmitting(true);

    const updatedProject: EventProject = {
      ...project,
      realisasi: {
        ...project.realisasi,
        accommodation: [...currentCosts, newItem],
      },
    };

    try {
      await setDoc(doc(db, "projects", project.id), sanitizeForFirestore(updatedProject));
      onNotify("Sukses! Pengeluaran berhasil ditambahkan ke Realisasi Point B.");
      setDesc("");
      setQty(1);
      setExpense("");
      setNotes("");
      setCustomPic("");
      setReceiptImage(null);
      setAiScanSuccess(false);
      setAiDetectedMerchant(null);
    } catch (err: any) {
      console.error("Save error in CollaborationView:", err);
      onNotify(err?.message ? `Gagal menyimpan: ${err.message}` : "Terjadi kesalahan atau Anda tidak memiliki akses.", "error");
      handleFirestoreError(err, OperationType.WRITE, `projects/${project.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Callback from modal multi-apply
  const handleApplyFromModal = async (items: Array<Omit<BudgetItem, "id" | "num"> & { receiptImage?: string }>) => {
    const currentCosts = project.realisasi.accommodation || [];
    let startNum = currentCosts.length > 0
      ? (parseInt(currentCosts[currentCosts.length - 1].num as string) || currentCosts.length) + 1
      : 1;

    const newItems: BudgetItem[] = items.map((it, idx) => ({
      id: `collab-ac-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      num: startNum + idx,
      description: it.description,
      qty: it.qty,
      expense: it.expense,
      notes: it.notes,
      receiptImage: it.receiptImage,
    }));

    const updatedProject: EventProject = {
      ...project,
      realisasi: {
        ...project.realisasi,
        accommodation: [...currentCosts, ...newItems],
      },
    };

    try {
      await setDoc(doc(db, "projects", project.id), sanitizeForFirestore(updatedProject));
      onNotify(`Sukses! ${newItems.length} item dari struk berhasil ditambahkan ke Realisasi Point B.`);
    } catch (err: any) {
      console.error("Save modal error in CollaborationView:", err);
      onNotify(err?.message ? `Gagal menyimpan data struk: ${err.message}` : "Gagal menyimpan data struk ke database.", "error");
      handleFirestoreError(err, OperationType.WRITE, `projects/${project.id}`);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const currentCosts = project.realisasi.accommodation || [];
    const filtered = currentCosts.filter((it) => it.id !== itemId);
    
    // Re-index item numbering
    const reindexed = filtered.map((it, idx) => ({
      ...it,
      num: idx + 1,
    }));

    const updatedProject: EventProject = {
      ...project,
      realisasi: {
        ...project.realisasi,
        accommodation: reindexed,
      },
    };

    try {
      await setDoc(doc(db, "projects", project.id), sanitizeForFirestore(updatedProject));
      onNotify("Item pengeluaran berhasil dihapus.");
    } catch (err: any) {
      console.error("Delete error in CollaborationView:", err);
      onNotify("Gagal menghapus item.", "error");
      handleFirestoreError(err, OperationType.WRITE, `projects/${project.id}`);
    }
  };

  const isGuest = userEmail.includes("Guest");

  const totalB = (project.realisasi.accommodation || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.expense) || 0),
    0
  );

  const renderPic = (notes?: string) => {
    const noteVal = (notes || "").trim();
    const matched = teamMembers.find(
      (m) =>
        m.username.toLowerCase() === noteVal.toLowerCase() ||
        (m.displayName && m.displayName.toLowerCase() === noteVal.toLowerCase())
    );
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap">
        {matched && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />}
        <span className={`truncate ${matched ? "text-cyan-100 font-semibold" : "text-slate-300"}`}>
          {matched ? matched.displayName || matched.username : noteVal || "-"}
        </span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-100 font-sans selection:bg-cyan-500/20 selection:text-white">
      
      {/* Header */}
      <header className="border-b border-slate-800/70 bg-[#0b0d12]/95 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-6xl mx-auto h-14 px-3 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/favicon.png" alt="Mateha Production" className="w-8 h-8 object-contain shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 leading-tight truncate">Mateha Production · Kolaborasi Lapangan</p>
              <h1 className="text-[15px] font-bold text-white leading-tight truncate">Laporan Realisasi Biaya</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            <span className="hidden md:inline text-slate-500 truncate max-w-[220px]">{userEmail}</span>
            {isGuest ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full text-[11px] font-semibold select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            ) : (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-rose-300 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6 text-left">
        
        {/* EVENT TITLE BLOCK */}
        <div className="bg-[#111317]/60 border border-slate-800 p-4 sm:p-6 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="text-[11px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-md font-semibold">
              Proyek bersama · Realisasi
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white mt-2">{project.name}</h2>
            
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-sm text-slate-400">
              <div className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>{project.date}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>{project.location}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-stretch gap-2.5 sm:gap-3">
            <div className="order-2 sm:order-1 col-span-2 sm:col-span-1">
              <button
                onClick={() => setIsModalOpen(true)}
                className="w-full h-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-200 hover:text-white px-4 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Scan Struk dengan AI</span>
              </button>
            </div>

            <div className="order-1 sm:order-2 col-span-2 sm:col-span-1 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 sm:min-w-[190px] flex flex-col justify-center">
              <span className="text-xs text-slate-500">Total realisasi (Point B)</span>
              <span className="text-xl font-bold text-cyan-300 mt-0.5 tabular-nums">{formatRupiah(totalB)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: ADD NEW ITEM FORM */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900/40 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col space-y-4">
              
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-rose-400" />
                  <span>Tambah Pengeluaran Realisasi</span>
                </h3>
              </div>

              {/* AI RECEIPT UPLOAD / DROPZONE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-cyan-400 font-bold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Upload Struk (AI Auto-Fill)</span>
                  </span>
                  <span className="text-slate-500">Foto / Nota / Bon</span>
                </div>

                {!receiptImage ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-cyan-500/30 hover:border-cyan-500/60 bg-cyan-950/10 hover:bg-cyan-950/20 rounded-xl p-3.5 text-center cursor-pointer transition flex items-center justify-center gap-2.5"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                    />
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                      <Camera className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-white">Pilih Foto Struk / Nota</p>
                      <p className="text-[10px] text-slate-400">AI otomatis isi deskripsi & total harga</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img
                          src={receiptImage}
                          alt="Receipt"
                          className="w-10 h-10 object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-80 transition"
                          onClick={() => setViewingReceipt(receiptImage)}
                        />
                        <div>
                          <p className="text-[11px] font-bold text-white flex items-center gap-1">
                            <span>Foto Struk Terlampir</span>
                            {aiScanSuccess && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                          </p>
                          {aiDetectedMerchant && (
                            <p className="text-[9px] text-cyan-400 font-mono flex items-center gap-1">
                              <Store className="w-2.5 h-2.5" />
                              <span>{aiDetectedMerchant}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingReceipt(receiptImage)}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition cursor-pointer"
                          title="Lihat Struk"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReceiptImage(null);
                            setAiScanSuccess(false);
                            setAiDetectedMerchant(null);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition cursor-pointer"
                          title="Hapus Foto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isScanningAI && (
                      <div className="p-2 bg-cyan-950/30 border border-cyan-500/30 rounded-lg flex items-center gap-2 text-[10px] text-cyan-300 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span>AI sedang menganalisis foto struk...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MANUAL / AI FORM */}
              <form onSubmit={handleAddCost} className="space-y-4 text-xs font-sans">
                <div>
                  <label className="block text-slate-400 font-medium text-xs mb-1.5 flex items-center justify-between">
                    <span>Deskripsi Pengeluaran / Biaya *</span>
                    {aiScanSuccess && (
                      <span className="text-cyan-400 text-[9px] lowercase font-normal italic">
                        ✨ Terisi otomatis oleh AI
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pembelian bensin crew, Sewa genset"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-medium text-xs mb-1.5">
                      Kuantitas (Qty)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value) || 1)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-medium text-xs mb-1.5">
                      Harga Satuan (Rp) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        placeholder="e.g. 50000"
                        min="0"
                        value={expense}
                        onChange={(e) => setExpense(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 font-mono text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* USER MANUAL PIC SELECTION FROM DAFTAR ANGGOTA TIM */}
                <div className="p-3 bg-cyan-950/15 border border-cyan-500/25 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-cyan-200 font-medium text-xs flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Penanggung jawab (PIC) *</span>
                    </label>
                    <span className="shrink-0 text-[10px] bg-cyan-500/15 text-cyan-300 px-1.5 py-0.5 rounded font-semibold">
                      {loadingMembers ? "Memuat..." : `${teamMembers.length} anggota`}
                    </span>
                  </div>

                  <select
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 text-xs"
                  >
                    <option value="">
                      {loadingMembers
                        ? "⏳ Memuat Daftar Anggota Tim..."
                        : teamMembers.length === 0
                        ? "-- Tidak ada anggota tim terdaftar --"
                        : "-- Pilih PIC dari Daftar Anggota Tim --"}
                    </option>
                    {teamMembers.map((member) => (
                      <option key={member.uid || member.username} value={member.username}>
                        {member.displayName && member.displayName !== member.username
                          ? `${member.displayName} (@${member.username})`
                          : member.username}
                        {member.jobTitle ? ` - ${member.jobTitle}` : member.role ? ` (${member.role})` : ""}
                      </option>
                    ))}
                    <option value="__custom__">➕ Masukkan Nama Lain (Custom)...</option>
                  </select>

                  {notes === "__custom__" && (
                    <input
                      type="text"
                      required
                      placeholder="Ketik nama penanggung jawab..."
                      value={customPic}
                      onChange={(e) => setCustomPic(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl p-2 text-slate-100 focus:outline-none text-xs mt-1.5"
                    />
                  )}

                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                    💡 Pengeluaran realisasi ini akan otomatis terhubung ke <strong>Slip Gaji (Staff Payslip)</strong> staf yang dipilih pada tab Reimbursement.
                  </p>
                </div>

                {qty > 0 && Number(expense) > 0 && (
                  <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl flex justify-between items-center font-mono text-xs">
                    <span className="text-slate-500 text-[11px]">Total Penambahan:</span>
                    <span className="font-extrabold text-cyan-400">{formatRupiah(qty * Number(expense))}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || isScanningAI}
                  className="w-full bg-rose-500 hover:bg-rose-400 text-white font-semibold h-12 rounded-xl transition shadow active:scale-[0.98] text-center cursor-pointer text-sm flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <span>Tambah Pengeluaran</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {!isGuest && (
              <button
                onClick={onGoToDashboard}
                className="w-full bg-slate-900/60 hover:bg-slate-800 text-slate-300 font-semibold h-11 border border-slate-800 rounded-xl text-center text-sm cursor-pointer block transition"
              >
                Buka Workspace Utama
              </button>
            )}
          </div>

          {/* RIGHT: LIST OF CURRENT COSTS */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-4 sm:px-5 py-3.5 bg-[#0e1115]/80 border-b border-slate-800/80 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 min-w-0">
                  <Table className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">Daftar Pengeluaran</span>
                  <span className="hidden sm:inline text-slate-500 font-normal">(Akomodasi & Ops)</span>
                </h3>
                <span className="shrink-0 text-[11px] font-semibold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-full">
                  {(project.realisasi.accommodation || []).length} item
                </span>
              </div>

              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-slate-800/70">
                {(project.realisasi.accommodation || []).map((item) => (
                  <div key={item.id} className="px-4 py-3.5 flex gap-3">
                    <span className="mt-0.5 w-6 shrink-0 text-xs text-slate-500 tabular-nums">{item.num}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-100 break-words">{item.description}</p>
                        <p className="shrink-0 text-sm font-bold text-cyan-300 tabular-nums">
                          {formatRupiah((Number(item.qty) || 0) * (Number(item.expense) || 0))}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
                        {item.qty} × {formatRupiah(Number(item.expense) || 0)}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">{renderPic(item.notes)}</div>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.receiptImage && (
                            <button
                              type="button"
                              onClick={() => setViewingReceipt(item.receiptImage!)}
                              className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 text-xs cursor-pointer"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              Struk
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                            aria-label="Hapus baris ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {(project.realisasi.accommodation || []).length === 0 && (
                  <p className="text-center py-8 px-4 text-sm text-slate-500 italic">
                    Belum ada data pengeluaran Point B yang dimasukkan di Realisasi.
                  </p>
                )}
              </div>

              <div className="hidden md:block p-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950/40 border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-2">Deskripsi</th>
                      <th className="py-2.5 px-2 w-28 text-right">Total</th>
                      <th className="py-2.5 px-2 w-32">PIC</th>
                      <th className="py-2.5 px-2 w-14 text-center">Struk</th>
                      <th className="py-2.5 px-2 w-10 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(project.realisasi.accommodation || []).map((item) => (
                      <tr key={item.id} className="border-b border-slate-850/60 hover:bg-[#111317]/50 transition">
                        <td className="py-3 px-3 text-slate-500 text-center tabular-nums">{item.num}</td>
                        <td className="py-3 px-2">
                          <p className="font-semibold text-slate-100 text-[13px] break-words">{item.description}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {item.qty} × {formatRupiah(Number(item.expense) || 0)}
                          </p>
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-cyan-300 whitespace-nowrap tabular-nums">{formatRupiah((Number(item.qty) || 0) * (Number(item.expense) || 0))}</td>
                        <td className="py-3 px-2 text-slate-300 font-medium">
                          {renderPic(item.notes)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {item.receiptImage ? (
                            <button
                              type="button"
                              onClick={() => setViewingReceipt(item.receiptImage!)}
                              className="p-1 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition cursor-pointer"
                              title="Lihat Foto Struk"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-600 text-[10px]">-</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Hapus baris ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(project.realisasi.accommodation || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-500 italic">
                          Belum ada data pengeluaran Point B yang dimasukkan di Realisasi.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* MODAL SCAN STRUK FULL */}
      <ReceiptScannerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onApply={handleApplyFromModal}
        teamMembers={teamMembers}
        staffList={teamMembers.map((m) => m.username)}
      />

      {/* RECEIPT IMAGE LIGHTBOX VIEWER */}
      <AnimatePresence>
        {viewingReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-2xl w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col items-center"
            >
              <div className="w-full flex justify-between items-center pb-3 border-b border-slate-800 mb-3">
                <span className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  <span>Foto Struk / Bukti Pengeluaran</span>
                </span>
                <button
                  onClick={() => setViewingReceipt(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-[75vh] overflow-auto flex items-center justify-center w-full">
                <img
                  src={viewingReceipt}
                  alt="Receipt Preview Full"
                  className="max-h-[70vh] w-auto object-contain rounded-lg shadow"
                />
              </div>

              <div className="w-full pt-3 mt-3 border-t border-slate-800 text-center">
                <button
                  onClick={() => setViewingReceipt(null)}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs uppercase cursor-pointer"
                >
                  Tutup Preview
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="border-t border-slate-800/60 py-5 text-xs text-slate-600 text-center">
        © 2026 Mateha Production · Sistem Keuangan Terpadu
      </footer>

    </div>
  );
}
