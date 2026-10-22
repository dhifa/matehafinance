import React, { useState, useRef } from "react";
import { formatRupiah, BudgetItem, UserProfile } from "../types";
import { 
  Camera, 
  Upload, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  User, 
  FileText, 
  DollarSign, 
  Calendar, 
  Store,
  Layers,
  ArrowRight,
  ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: Array<Omit<BudgetItem, "id" | "num"> & { receiptImage?: string }>) => void;
  staffList?: string[];
  teamMembers?: UserProfile[];
  defaultPic?: string;
}

export default function ReceiptScannerModal({
  isOpen,
  onClose,
  onApply,
  staffList = [],
  teamMembers = [],
  defaultPic = ""
}: ReceiptScannerModalProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // AI Extracted Data
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [expense, setExpense] = useState<number | "">("");
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState("");
  const [detectedItems, setDetectedItems] = useState<Array<{ description: string; qty: number; expense: number; total: number }>>([]);
  const [mode, setMode] = useState<"single" | "multiple">("single");

  // User Manual PIC
  const [pic, setPic] = useState(defaultPic || "");
  const [customPic, setCustomPic] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setImagePreview(null);
    setIsAnalyzing(false);
    setErrorMsg(null);
    setSuccessMsg(null);
    setDesc("");
    setQty(1);
    setExpense("");
    setMerchant("");
    setDate("");
    setDetectedItems([]);
    setMode("single");
    setPic(defaultPic || "");
    setCustomPic("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileSelect = (file: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("File harus berupa gambar (JPG, PNG, WEBP, dll.)");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      setImagePreview(base64Data);
      analyzeReceiptWithAI(base64Data, file.type);
    };
    reader.readAsDataURL(file);
  };

  const analyzeReceiptWithAI = async (base64Data: string, mimeType: string) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch("/api/gemini/parse-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      setMerchant(data.merchant || "");
      setDate(data.date || "");
      
      if (Array.isArray(data.items) && data.items.length > 1) {
        setDetectedItems(data.items);
      } else {
        setDetectedItems([]);
      }

      setSuccessMsg("Struk berhasil dibaca oleh AI! Silakan pilih PIC penanggung jawab di bawah.");
    } catch (err: any) {
      console.error("Error analyzing receipt:", err);
      setErrorMsg(err.message || "Gagal menganalisis struk. Anda dapat mengisi form secara manual.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPic = (pic === "__custom__" ? customPic : pic).trim();

    if (!finalPic) {
      setErrorMsg("Harap pilih atau masukkan nama PIC (Penanggung Jawab)!");
      return;
    }

    if (mode === "multiple" && detectedItems.length > 1) {
      const itemsToApply = detectedItems.map((item) => ({
        description: item.description,
        qty: Number(item.qty) || 1,
        expense: Number(item.expense) || 0,
        notes: finalPic,
        receiptImage: imagePreview || undefined,
      }));
      onApply(itemsToApply);
    } else {
      if (!desc.trim()) {
        setErrorMsg("Deskripsi pengeluaran tidak boleh kosong!");
        return;
      }
      onApply([
        {
          description: desc.trim(),
          qty: Number(qty) || 1,
          expense: Number(expense) || 0,
          notes: finalPic,
          receiptImage: imagePreview || undefined,
        },
      ]);
    }

    handleClose();
  };

  if (!isOpen) return null;

  const totalCalculated = (Number(qty) || 1) * (Number(expense) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-[#0c0e12] border border-slate-800/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#11141a] border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase font-mono tracking-tight flex items-center gap-1.5">
                <span>Scan Struk & Nota Pengeluaran (AI)</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-mono">
                Deskripsi & nominal diisi otomatis oleh AI • PIC diisi manual oleh Anda
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-grow text-xs">
          
          {/* Upload & Preview Zone */}
          {!imagePreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-slate-700/80 hover:border-cyan-500/60 bg-slate-950/60 hover:bg-slate-900/40 rounded-2xl p-4 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 group-hover:bg-cyan-500/20 border border-cyan-500/20 flex items-center justify-center mb-3 transition">
                <Upload className="w-7 h-7 text-cyan-400 group-hover:scale-110 transition" />
              </div>
              <p className="text-sm font-bold text-white">Upload Foto Struk / Nota / Bon</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                Klik untuk memilih file atau seret foto struk ke area ini (Mendukung kamera HP)
              </p>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">SPBU Bensin</span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">Konsumsi / Makan</span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">Sewa Alat / Tol</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              {/* Image Preview Box */}
              <div className="md:col-span-4 bg-slate-950 p-2 border border-slate-800 rounded-2xl relative group">
                <img
                  src={imagePreview}
                  alt="Receipt Preview"
                  className="w-full h-44 md:h-52 object-contain rounded-xl bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-4 right-4 bg-slate-900/90 hover:bg-slate-800 text-white text-[10px] font-mono px-2.5 py-1 rounded-lg border border-slate-700 shadow flex items-center gap-1 transition cursor-pointer"
                >
                  <Camera className="w-3 h-3 text-cyan-400" />
                  <span>Ganti Foto</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />
              </div>

              {/* Status / OCR Summary Box */}
              <div className="md:col-span-8 space-y-3">
                {isAnalyzing ? (
                  <div className="p-4 sm:p-6 bg-cyan-950/20 border border-cyan-500/30 rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    <div>
                      <h3 className="font-bold text-white text-xs font-mono uppercase">AI Sedang Membaca Struk...</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Mengekstrak deskripsi item, kuantitas, dan total nominal harga pengeluaran
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {merchant && (
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="flex items-center gap-1 text-slate-400">
                          <Store className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Merchant / Toko:</span>
                        </span>
                        <span className="font-bold text-white bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                          {merchant}
                        </span>
                        {date && (
                          <span className="text-slate-500 text-[10px] ml-auto">
                            Tgl: {date}
                          </span>
                        )}
                      </div>
                    )}

                    {detectedItems.length > 1 && (
                      <div className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between">
                        <span className="text-[11px] text-slate-300 font-medium">
                          Terdeteksi <strong>{detectedItems.length} item</strong> pada struk:
                        </span>
                        <div className="flex gap-1.5 text-[10px] font-mono">
                          <button
                            type="button"
                            onClick={() => setMode("single")}
                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-bold ${
                              mode === "single"
                                ? "bg-cyan-500 text-slate-950"
                                : "bg-slate-800 text-slate-400 hover:text-white"
                            }`}
                          >
                            Gabung (1 Total)
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode("multiple")}
                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-bold ${
                              mode === "multiple"
                                ? "bg-cyan-500 text-slate-950"
                                : "bg-slate-800 text-slate-400 hover:text-white"
                            }`}
                          >
                            Pisah Tiap Item ({detectedItems.length})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form Fields (AI Auto-Filled + Manual PIC) */}
          {imagePreview && !isAnalyzing && (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {mode === "single" || detectedItems.length <= 1 ? (
                <>
                  {/* AI Filled: Description */}
                  <div>
                    <label className="block text-slate-400 font-bold uppercase text-[9px] mb-1 font-mono flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3 text-cyan-400" />
                        <span>Deskripsi Pengeluaran (Diisi AI) *</span>
                      </span>
                      <span className="text-cyan-400 text-[9px] lowercase font-normal italic">
                        ✨ dapat Anda sesuaikan
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="e.g. Pembelian Bensin Crew, Konsumsi Makan Siang"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                    />
                  </div>

                  {/* AI Filled: Qty & Expense */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-bold uppercase text-[9px] mb-1 font-mono">
                        Kuantitas (Qty) (Diisi AI)
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={qty}
                        onChange={(e) => setQty(Number(e.target.value) || 1)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl p-2.5 text-slate-100 font-mono text-center focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-bold uppercase text-[9px] mb-1 font-mono">
                        Harga Satuan / Biaya (Diisi AI) *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={expense}
                        onChange={(e) => setExpense(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Nominal Rp"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/60 rounded-xl p-2.5 text-slate-100 font-mono text-right focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>
                  </div>

                  {/* Calculated Subtotal Card */}
                  <div className="p-3 bg-slate-950/80 border border-slate-900 rounded-xl flex justify-between items-center font-mono">
                    <span className="text-slate-400 text-[11px]">Total Pengeluaran Struk:</span>
                    <span className="font-extrabold text-cyan-400 text-sm">
                      {formatRupiah(totalCalculated)}
                    </span>
                  </div>
                </>
              ) : (
                /* Multiple items table preview */
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <div className="p-2.5 bg-slate-900/80 border-b border-slate-800 text-[11px] font-bold text-slate-200">
                    Rincian Item yang akan dimasukkan:
                  </div>
                  <div className="divide-y divide-slate-850 max-h-48 overflow-y-auto">
                    {detectedItems.map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-900/30">
                        <div className="flex-1 pr-2">
                          <p className="font-medium text-white">{item.description}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {item.qty} x {formatRupiah(item.expense)}
                          </p>
                        </div>
                        <span className="font-bold font-mono text-cyan-400">
                          {formatRupiah(item.total || item.qty * item.expense)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* USER MANUAL: PIC (Penanggung Jawab) */}
              <div className="pt-2 p-3.5 bg-cyan-950/15 border border-cyan-500/30 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-cyan-300 font-bold uppercase text-[10px] font-mono flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Penanggung Jawab / Nama PIC (Diisi Manual oleh User) *</span>
                  </label>
                  <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono font-bold">
                    WAJIB DIISI
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={pic}
                    onChange={(e) => {
                      setPic(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 text-xs"
                  >
                    <option value="">-- Pilih PIC dari Anggota Tim --</option>
                    {teamMembers && teamMembers.length > 0
                      ? teamMembers.map((member) => (
                          <option key={member.uid || member.username} value={member.username}>
                            {member.displayName && member.displayName !== member.username
                              ? `${member.displayName} (@${member.username})`
                              : member.username}
                            {member.jobTitle ? ` - ${member.jobTitle}` : member.role ? ` (${member.role})` : ""}
                          </option>
                        ))
                      : staffList.map((member) => (
                          <option key={member} value={member}>
                            {member}
                          </option>
                        ))}
                    <option value="__custom__">➕ Tulis Nama PIC Lainnya (Custom)...</option>
                  </select>

                  {pic === "__custom__" && (
                    <input
                      type="text"
                      required
                      placeholder="Masukkan nama PIC..."
                      value={customPic}
                      onChange={(e) => setCustomPic(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
                    />
                  )}
                </div>
              </div>

              {/* Messages */}
              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-[11px] font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() => analyzeReceiptWithAI(imagePreview, "image/jpeg")}
                      className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 rounded-lg text-[10px] font-mono font-bold transition shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-rose-300" />
                      <span>Coba Scan Ulang AI</span>
                    </button>
                  )}
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-[11px] font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold rounded-xl transition cursor-pointer text-center text-xs uppercase"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-2 py-3 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold rounded-xl transition shadow-lg shadow-cyan-500/20 cursor-pointer text-center text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <span>Simpan ke Realisasi Point B</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

        </div>
      </motion.div>
    </div>
  );
}
