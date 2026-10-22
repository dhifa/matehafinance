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

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-100 font-sans selection:bg-cyan-500/20 selection:text-white">
      
      {/* Dynamic Header Space */}
      <header className="border-b border-slate-900 bg-[#0c0e12]/80 backdrop-blur-xl py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500">KOLABORASI REALISASI RAB</span>
              <h1 className="text-xs font-bold font-mono tracking-tight text-white uppercase">MATEHA LAPORAN REALISASI BIAYA</h1>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="hidden sm:inline text-slate-500 font-mono">User: {userEmail}</span>
            {isGuest ? (
              <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wide select-none">
                ● LIVE SYNC
              </span>
            ) : (
              <button
                onClick={onLogout}
                className="flex items-center space-x-1 py-1 px-2.5 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8 text-left">
        
        {/* EVENT TITLE BLOCK */}
        <div className="bg-[#111317]/60 border border-slate-800 p-4 sm:p-6 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
              Shared Project Realisasi
            </span>
            <h2 className="text-xl font-extrabold text-white mt-1.5">{project.name}</h2>
            
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-400 font-mono">
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

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white px-4 py-3 rounded-xl font-mono text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/5"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Modal Scan Struk AI</span>
            </button>

            <div className="bg-slate-950/80 border border-slate-900 rounded-xl px-4 py-3 min-w-[170px] flex flex-col justify-center">
              <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-slate-500">Total B Terkumpul</span>
              <span className="text-lg font-bold font-mono text-cyan-400 mt-0.5">{formatRupiah(totalB)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: ADD NEW ITEM FORM */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900/40 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col space-y-4">
              
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-rose-400" />
                  <span>Tambah Pengeluaran Realisasi</span>
                </h3>
              </div>

              {/* AI RECEIPT UPLOAD / DROPZONE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono">
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
                  <label className="block text-slate-400 font-bold tracking-wide uppercase text-[9px] mb-1 font-mono flex items-center justify-between">
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
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-bold tracking-wide uppercase text-[9px] mb-1 font-mono">
                      Kuantitas (Qty)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value) || 1)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-bold tracking-wide uppercase text-[9px] mb-1 font-mono">
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
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 font-mono text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* USER MANUAL PIC SELECTION FROM DAFTAR ANGGOTA TIM */}
                <div className="p-3 bg-cyan-950/15 border border-cyan-500/25 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-cyan-300 font-bold tracking-wide uppercase text-[9px] font-mono flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Penanggung Jawab / PIC (Daftar Anggota Tim) *</span>
                    </label>
                    <span className="text-[8px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono font-bold">
                      {loadingMembers ? "MEMUAT..." : `${teamMembers.length} ANGGOTA TIM`}
                    </span>
                  </div>

                  <select
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 text-xs"
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
                  className="w-full bg-rose-500 hover:bg-rose-450 text-white font-extrabold p-3 rounded-xl transition shadow active:scale-98 text-center cursor-pointer text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <span>Tambah Pengeluaran Realisasi</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {!isGuest && (
              <button
                onClick={onGoToDashboard}
                className="w-full bg-slate-900/60 hover:bg-slate-850 text-slate-300 font-bold p-3 border border-slate-800 rounded-xl text-center text-xs uppercase cursor-pointer tracking-wider block transition"
              >
                Masuk Ke Workspace Utama Saya
              </button>
            )}
          </div>

          {/* RIGHT: LIST OF CURRENT COSTS */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 bg-[#0e1115]/80 border-b border-slate-800/80 flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
                  <Table className="w-4 h-4 text-cyan-400" />
                  <span>Daftar Pengeluaran Terdaftar (Akomodasi & Ops)</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-500">
                  {(project.realisasi.accommodation || []).length} Item Terdaftar
                </span>
              </div>

              <div className="p-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950/40 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      <th className="py-2.5 px-3 w-10 text-center">Num</th>
                      <th className="py-2.5 px-2">Deskripsi</th>
                      <th className="py-2.5 px-2 w-12 text-center">Qty</th>
                      <th className="py-2.5 px-2 w-24 text-right">Harga</th>
                      <th className="py-2.5 px-2 w-28 text-right">Total</th>
                      <th className="py-2.5 px-2">PIC (PJ)</th>
                      <th className="py-2.5 px-2 w-14 text-center">Struk</th>
                      <th className="py-2.5 px-2 w-10 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(project.realisasi.accommodation || []).map((item) => (
                      <tr key={item.id} className="border-b border-slate-850/60 hover:bg-[#111317]/50 transition">
                        <td className="py-3 px-3 font-mono text-slate-500 text-center">{item.num}</td>
                        <td className="py-3 px-2 font-bold text-slate-200">{item.description}</td>
                        <td className="py-3 px-2 text-center font-mono">{item.qty}</td>
                        <td className="py-3 px-2 text-right font-mono text-slate-400">{formatRupiah(Number(item.expense) || 0)}</td>
                        <td className="py-3 px-2 text-right font-mono font-bold text-cyan-400">{formatRupiah((Number(item.qty) || 0) * (Number(item.expense) || 0))}</td>
                        <td className="py-3 px-2 text-slate-300 font-medium">
                          {(() => {
                            const noteVal = (item.notes || "").trim();
                            const matched = teamMembers.find(
                              (m) =>
                                m.username.toLowerCase() === noteVal.toLowerCase() ||
                                (m.displayName && m.displayName.toLowerCase() === noteVal.toLowerCase())
                            );
                            if (matched) {
                              return (
                                <div className="inline-flex items-center space-x-1.5 bg-slate-900 border border-slate-800/80 px-2 py-0.5 rounded text-[11px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                                  <span className="text-cyan-200 font-bold">
                                    {matched.displayName || matched.username}
                                  </span>
                                  {matched.displayName && matched.displayName !== matched.username && (
                                    <span className="text-slate-500 font-mono text-[9px]">@{matched.username}</span>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[11px]">
                                {noteVal || "-"}
                              </span>
                            );
                          })()}
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
                        <td colSpan={8} className="text-center py-8 text-slate-500 italic">
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

      <footer className="border-t border-slate-950 py-6 text-[10px] font-mono text-slate-600 text-center">
        <span>MATEHA FINANCE SYSTEM • AI RECEIPT OCR & REALISASI SYNC</span>
      </footer>

    </div>
  );
}
