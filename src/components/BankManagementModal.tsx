import React, { useState } from "react";
import { Bank } from "../types";
import { doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import { notify } from "../utils/notification";
import { 
  Building2, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Star, 
  CreditCard, 
  AlertCircle,
  Sparkles
} from "lucide-react";

interface BankManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  banks: Bank[];
  onSelectBank?: (bank: Bank) => void;
}

const COMMON_BANKS = [
  "Bank BCA",
  "Bank Mandiri",
  "Bank BRI",
  "Bank BNI",
  "Bank BSI (Syariah)",
  "Bank CIMB Niaga",
  "Bank Permata",
  "Bank Danamon",
  "Bank Jago",
  "SeaBank",
  "Bank BCA Digital (Blu)",
  "Lainnya"
];

export default function BankManagementModal({
  isOpen,
  onClose,
  banks,
  onSelectBank
}: BankManagementModalProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [bankName, setBankName] = useState("Bank BCA");
  const [customBankName, setCustomBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("Dhifa Aksa Hermawan");
  const [isDefault, setIsDefault] = useState(banks.length === 0);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setBankName("Bank BCA");
    setCustomBankName("");
    setAccountNumber("");
    setAccountHolder("Dhifa Aksa Hermawan");
    setIsDefault(banks.length === 0);
    setIsAdding(false);
    setEditingId(null);
    setErrorMsg("");
  };

  const handleStartEdit = (b: Bank) => {
    setEditingId(b.id);
    setIsAdding(true);
    if (COMMON_BANKS.includes(b.name)) {
      setBankName(b.name);
      setCustomBankName("");
    } else {
      setBankName("Lainnya");
      setCustomBankName(b.name);
    }
    setAccountNumber(b.accountNumber);
    setAccountHolder(b.accountHolder);
    setIsDefault(b.isDefault);
    setErrorMsg("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalBankName = bankName === "Lainnya" ? customBankName.trim() : bankName.trim();

    if (!finalBankName) {
      setErrorMsg("Nama bank wajib diisi.");
      return;
    }
    if (!accountNumber.trim()) {
      setErrorMsg("Nomor rekening wajib diisi.");
      return;
    }
    if (!accountHolder.trim()) {
      setErrorMsg("Nama pemilik rekening (atas nama) wajib diisi.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const id = editingId || "bank_" + Date.now();

      // If set as default, remove default from other banks
      if (isDefault) {
        for (const b of banks) {
          if (b.id !== id && b.isDefault) {
            await updateDoc(doc(db, "banks", b.id), { isDefault: false });
          }
        }
      }

      const bankData: Bank = {
        id,
        name: finalBankName,
        accountNumber: accountNumber.trim(),
        accountHolder: accountHolder.trim(),
        isDefault: isDefault || banks.length === 0,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "banks", id), bankData);
      notify.success(editingId ? "Data rekening bank berhasil diperbarui!" : "Rekening bank baru berhasil disimpan!", "Database Bank");
      resetForm();
    } catch (err: any) {
      console.error(err);
      notify.error("Gagal menyimpan rekening bank: " + (err.message || "Unknown error"), "Database Bank");
      setErrorMsg("Gagal menyimpan rekening bank: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "banks", id));
      notify.success("Rekening bank berhasil dihapus!", "Database Bank");
      if (editingId === id) resetForm();
      setConfirmDeleteId(null);
    } catch (err: any) {
      console.error("Gagal menghapus rekening:", err);
      notify.error("Gagal menghapus rekening: " + err.message, "Database Bank");
    }
  };

  const handleSetDefault = async (bankId: string) => {
    try {
      for (const b of banks) {
        await updateDoc(doc(db, "banks", b.id), { isDefault: b.id === bankId });
      }
      notify.success("Rekening bank utama berhasil diatur!", "Database Bank");
    } catch (err: any) {
      notify.error("Gagal mengubah rekening utama: " + err.message, "Database Bank");
    }
  };

  const handleSeedDefaultBca = async () => {
    setSaving(true);
    try {
      const id = "bank_default_bca";
      await setDoc(doc(db, "banks", id), {
        id,
        name: "Bank BCA",
        accountNumber: "1393601552",
        accountHolder: "Dhifa Aksa Hermawan",
        isDefault: true,
        createdAt: new Date().toISOString(),
      });
      notify.success("Rekening BCA default berhasil dibuat!", "Database Bank");
      resetForm();
    } catch (err: any) {
      notify.error("Gagal menambahkan default: " + err.message, "Database Bank");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#0f1218] border border-slate-800 text-slate-100 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Database Rekening Bank Transfer
              </h2>
              <p className="text-xs text-slate-400">
                Kelola rekening resmi Mateha Production untuk Invoice, Quotation, dan Kwitansi
              </p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form Add / Edit Bank */}
          {isAdding ? (
            <form onSubmit={handleSave} className="bg-slate-950/80 p-4 rounded-xl border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  {editingId ? "Edit Rekening Bank" : "Tambah Rekening Bank Baru"}
                </span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  Batal
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Nama Bank</label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {COMMON_BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                {bankName === "Lainnya" && (
                  <div>
                    <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Tulis Nama Bank</label>
                    <input
                      type="text"
                      placeholder="Contoh: Bank BJB / Jenius"
                      value={customBankName}
                      onChange={(e) => setCustomBankName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Nomor Rekening</label>
                  <input
                    type="text"
                    placeholder="Contoh: 1393601552"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9-]/g, ''))}
                    className="w-full bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Atas Nama (Pemilik Rekening)</label>
                  <input
                    type="text"
                    placeholder="Contoh: Dhifa Aksa Hermawan / Mateha Production"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded border-slate-700 text-cyan-500 focus:ring-0 w-4 h-4 bg-slate-900"
                  />
                  <span>Jadikan Rekening Utama / Default</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/20"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{editingId ? "Perbarui" : "Simpan Rekening"}</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-mono">
                Total: {banks.length} Rekening Terdaftar
              </span>
              <button
                type="button"
                onClick={() => { resetForm(); setIsAdding(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Rekening Baru</span>
              </button>
            </div>
          )}

          {/* Banks List */}
          <div className="space-y-2.5">
            {banks.map((b) => (
              <div
                key={b.id}
                className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  b.isDefault
                    ? "bg-slate-950 border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.06)]"
                    : "bg-slate-950/60 border-slate-850 hover:border-slate-750"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{b.name}</span>
                      {b.isDefault && (
                        <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-cyan-400" />
                          Rekening Utama
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono font-bold text-slate-300 mt-0.5 tracking-wider">
                      {b.accountNumber}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      a.n <span className="text-slate-300 font-semibold">{b.accountHolder}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {!b.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(b.id)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition cursor-pointer"
                      title="Jadikan sebagai rekening utama"
                    >
                      Set Utama
                    </button>
                  )}

                  {onSelectBank && (
                    <button
                      type="button"
                      onClick={() => { onSelectBank(b); onClose(); }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 transition cursor-pointer"
                    >
                      Pilih
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleStartEdit(b)}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title="Edit Rekening"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {confirmDeleteId === b.id ? (
                    <div className="flex items-center gap-1 bg-rose-950/80 border border-rose-800/80 px-2 py-1 rounded-lg text-[10px]">
                      <span className="text-rose-300 font-semibold">Hapus?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                      >
                        Ya
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(b.id)}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Hapus Rekening"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {banks.length === 0 && !isAdding && (
              <div className="p-4 sm:p-8 text-center bg-slate-950/40 border border-dashed border-slate-850 rounded-2xl space-y-3">
                <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
                <div>
                  <p className="text-sm font-bold text-slate-300">Belum ada rekening bank yang didaftarkan</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Tambahkan rekening bank transfer resmi agar dapat dipilih otomatis saat membuat Invoice, Quotation, dan Kwitansi.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleSeedDefaultBca}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Tambahkan Default (BCA a.n Dhifa Aksa)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { resetForm(); setIsAdding(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Kustom</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/80 flex justify-between items-center text-xs">
          <span className="text-slate-500 text-[11px]">
            Data tersimpan aman dan tersinkronisasi otomatis di Cloud Firestore.
          </span>
          <button
            type="button"
            onClick={() => { resetForm(); onClose(); }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
