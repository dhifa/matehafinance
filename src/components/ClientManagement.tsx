import React, { useState, useEffect } from "react";
import { Client } from "../types";
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, query, orderBy } from "../lib/firestore";
import { db, sanitizeForFirestore } from "../utils/backend";
import { resolveClientDetails } from "../utils/clientHelper";
import { notify } from "../utils/notification";
import { 
  Users, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  User,
  ArrowUpDown,
  Check, 
  X, 
  MessageSquare,
  FileText,
  AlertCircle,
  ExternalLink,
  Calendar
} from "lucide-react";

interface ClientManagementProps {
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onSelectClient?: (client: Client) => void;
  onNotify?: (text: string, type?: "success" | "error" | "warning" | "info", title?: string) => void;
}

export default function ClientManagement({
  isModal = false,
  isOpen = true,
  onClose,
  onSelectClient,
  onNotify,
}: ClientManagementProps) {
  const showNotification = (
    text: string,
    type: "success" | "error" | "warning" | "info" = "success",
    title?: string
  ) => {
    if (onNotify) {
      onNotify(text, type, title);
    } else {
      notify[type === "error" ? "error" : type === "warning" ? "warning" : type === "info" ? "info" : "success"](text, title);
    }
  };
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [company, setCompany] = useState(""); // Nama Perusahaan / Instansi / Event Organizer
  const [pic, setPic] = useState("");         // Nama PIC / Kontak Person
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const qClients = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qClients, (snapshot) => {
      const list: Client[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Client);
      });
      setClients(list);
    });
    return () => unsub();
  }, []);

  if (isModal && !isOpen) return null;

  const resetForm = () => {
    setCompany("");
    setPic("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    setIsAdding(false);
    setEditingId(null);
    setErrorMsg("");
  };

  const handleStartEdit = (client: Client) => {
    const details = resolveClientDetails(client);
    setEditingId(client.id);
    setCompany(details.company);
    setPic(details.pic);
    setPhone(details.phone || client.phone || "");
    setEmail(client.email || "");
    setAddress(client.address || "");
    setNotes(client.notes || "");
    setIsAdding(true);
    setErrorMsg("");
  };

  const handleSwapFormFields = () => {
    const tempCompany = company;
    setCompany(pic);
    setPic(tempCompany);
  };

  const handleQuickSwap = async (client: Client) => {
    const details = resolveClientDetails(client);
    const newCompany = details.pic;
    const newPic = details.company;
    try {
      await updateDoc(doc(db, "clients", client.id), sanitizeForFirestore({
        company: newCompany || undefined,
        pic: newPic || undefined,
        name: newCompany || newPic,
        updatedAt: new Date().toISOString(),
      }));
      showNotification(`Posisi Perusahaan & PIC untuk "${newCompany || newPic}" berhasil ditukar!`, "success", "Database Klien");
    } catch (err: any) {
      console.error("Gagal menukar posisi:", err);
      showNotification("Gagal menukar posisi: " + (err.message || "Error"), "error", "Gagal Menukar Posisi");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const primaryName = (company.trim() || pic.trim());
    if (!primaryName) {
      showNotification("Mohon isi minimal Nama Perusahaan/Instansi atau Nama PIC.", "warning", "Data Belum Lengkap");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const id = editingId || "client_" + Date.now();
      const clientData: Partial<Client> = {
        id,
        name: primaryName,
        createdAt: editingId ? (clients.find(c => c.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (company.trim()) clientData.company = company.trim();
      if (pic.trim()) clientData.pic = pic.trim();
      if (phone.trim()) clientData.phone = phone.trim();
      if (email.trim()) clientData.email = email.trim();
      if (address.trim()) clientData.address = address.trim();
      if (notes.trim()) clientData.notes = notes.trim();

      await setDoc(doc(db, "clients", id), sanitizeForFirestore(clientData));
      showNotification(editingId ? "Data klien berhasil diperbarui!" : "Klien baru berhasil ditambahkan!", "success", "Database Klien");
      resetForm();

      if (onSelectClient) {
        onSelectClient(clientData as Client);
      }
    } catch (err: any) {
      console.error(err);
      showNotification("Gagal menyimpan data klien: " + (err.message || "Error"), "error", "Gagal Menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "clients", id));
      showNotification("Data klien berhasil dihapus!", "success", "Database Klien");
      if (editingId === id) resetForm();
      setConfirmDeleteId(null);
    } catch (err: any) {
      showNotification("Gagal menghapus klien: " + err.message, "error", "Gagal Menghapus");
    }
  };

  const filteredClients = clients.filter((c) => {
    const query = searchQuery.toLowerCase();
    const details = resolveClientDetails(c);
    return (
      details.company.toLowerCase().includes(query) ||
      details.pic.toLowerCase().includes(query) ||
      c.name.toLowerCase().includes(query) ||
      (c.company && c.company.toLowerCase().includes(query)) ||
      (c.pic && c.pic.toLowerCase().includes(query)) ||
      (c.phone && c.phone.includes(query)) ||
      (c.email && c.email.toLowerCase().includes(query)) ||
      (c.notes && c.notes.toLowerCase().includes(query))
    );
  });

  const content = (
    <div className="space-y-5">
      {/* Top action / search bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-900">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama klien, instansi/perusahaan, nomor WhatsApp, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 pl-10 pr-4 py-2.5 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isAdding && (
            <button
              type="button"
              onClick={() => { resetForm(); setIsAdding(true); }}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-cyan-500/10 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Klien Baru</span>
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Add / Edit */}
      {isAdding && (
        <form onSubmit={handleSave} className="bg-[#0b0e14] p-4 sm:p-5 rounded-2xl border border-cyan-500/40 shadow-xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{editingId ? "Edit Data Klien" : "Form Klien Baru (Master Database)"}</span>
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Batal
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-300 font-semibold block">
                  Nama Perusahaan / Instansi / Event Organizer
                </label>
                {(company || pic) && (
                  <button
                    type="button"
                    onClick={handleSwapFormFields}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer bg-cyan-950/40 hover:bg-cyan-900/50 px-2 py-0.5 rounded border border-cyan-800/50 transition"
                    title="Tukar posisi antara Perusahaan dan PIC jika terbalik"
                  >
                    <ArrowUpDown className="w-3 h-3" /> Tukar Posisi
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Contoh: PT Astra International / Kemenperin"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">Ditujukan untuk "Kepada Yth" di Quotation & "Ditagihkan Kepada" di Invoice.</p>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-semibold mb-1 block">
                Nama Kontak Person (PIC Klien)
              </label>
              <input
                type="text"
                placeholder="Contoh: Ibu Rina / Bpk. Hendra"
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">Ditujukan untuk "Up / PIC" di Quotation & Invoice.</p>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-semibold mb-1 block">
                Nomor Telepon / WhatsApp
              </label>
              <input
                type="text"
                placeholder="Contoh: 081234567890 / +62812..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300 font-semibold mb-1 block">
                Email
              </label>
              <input
                type="email"
                placeholder="Contoh: client@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-300 font-semibold mb-1 block">
                Alamat Kantor / Domisili
              </label>
              <textarea
                placeholder="Alamat penagihan atau lokasi kantor..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 p-3 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-300 font-semibold mb-1 block">
                Catatan Tambahan (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Klien langganan live streaming hybrid seminar"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              <Check className="w-4 h-4" />
              <span>{editingId ? "Simpan Perubahan" : "Simpan Klien"}</span>
            </button>
          </div>
        </form>
      )}

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredClients.map((c) => {
          const details = resolveClientDetails(c);
          const cleanPhone = details.phone ? details.phone.replace(/[^0-9]/g, '') : '';
          const waPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
          const hasBoth = details.company && details.pic && details.company !== details.pic;

          return (
            <div
              key={c.id}
              className="bg-slate-950/80 border border-slate-850 hover:border-slate-750 p-4 rounded-2xl transition flex flex-col justify-between space-y-3 group"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-sm group-hover:text-cyan-400 transition flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{details.company || details.pic}</span>
                    </h4>
                    {hasBoth && (
                      <p className="text-xs text-slate-300 font-medium flex items-center gap-1 mt-1">
                        <User className="w-3 h-3 text-cyan-400/80 shrink-0" />
                        <span>PIC: <strong className="text-white">{details.pic}</strong></span>
                      </p>
                    )}
                  </div>

                  {onSelectClient && (
                    <button
                      type="button"
                      onClick={() => { onSelectClient(c); if (onClose) onClose(); }}
                      className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold rounded-lg transition shrink-0"
                    >
                      Pilih
                    </button>
                  )}
                </div>

                <div className="space-y-1 text-xs text-slate-400">
                  {details.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-mono">{details.phone}</span>
                      {cleanPhone && (
                        <a
                          href={`https://wa.me/${waPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded hover:bg-emerald-500/20 transition flex items-center gap-0.5"
                          title="Hubungi via WhatsApp"
                        >
                          <MessageSquare className="w-2.5 h-2.5" />
                          WA
                        </a>
                      )}
                    </div>
                  )}

                  {c.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}

                  {c.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2 text-slate-400 text-[11px]">{c.address}</span>
                    </div>
                  )}

                  {c.notes && (
                    <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 italic mt-2">
                      "{c.notes}"
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-600 font-mono">
                  {c.createdAt ? new Date(c.createdAt).toLocaleDateString('id-ID') : '-'}
                </span>

                <div className="flex items-center gap-1.5">
                  {hasBoth && (
                    <button
                      type="button"
                      onClick={() => handleQuickSwap(c)}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition cursor-pointer"
                      title="Tukar Posisi Perusahaan & PIC (jika terbalik)"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleStartEdit(c)}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title="Edit Klien"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {confirmDeleteId === c.id ? (
                    <div className="flex items-center gap-1 bg-rose-950/80 border border-rose-800/80 px-2 py-1 rounded-lg text-[10px]">
                      <span className="text-rose-300 font-semibold">Hapus?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
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
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Hapus Klien"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredClients.length === 0 && (
          <div className="col-span-full p-10 text-center bg-slate-950/40 border border-dashed border-slate-850 rounded-2xl space-y-3">
            <Users className="w-12 h-12 text-slate-600 mx-auto" />
            <div>
              <p className="text-sm font-bold text-slate-300">
                {searchQuery ? "Tidak ditemukan klien dengan kata kunci tersebut" : "Belum ada data klien di database"}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {searchQuery
                  ? "Coba periksa ejaan atau buat data klien baru."
                  : "Tambahkan kontak klien / instansi agar dapat dipilih cepat saat membuat Quotation, Invoice, atau Kwitansi untuk repeat order."}
              </p>
            </div>
            {!isAdding && (
              <button
                type="button"
                onClick={() => { resetForm(); setIsAdding(true); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Klien Pertama</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-200">
        <div className="bg-[#0c0e14] border border-slate-800 text-slate-100 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Database Master Klien</h2>
                <p className="text-xs text-slate-400">Kelola daftar kontak klien untuk repeat order</p>
              </div>
            </div>
            <button
              onClick={() => { resetForm(); if (onClose) onClose(); }}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1">
            {content}
          </div>

          {/* Modal Footer */}
          <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/80 flex justify-between items-center text-xs">
            <span className="text-slate-500 text-[11px]">
              Total: {clients.length} klien terdaftar di sistem
            </span>
            <button
              type="button"
              onClick={() => { resetForm(); if (onClose) onClose(); }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standalone tab view
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-cyan-400" />
            <span>Database Master Klien</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Daftar lengkap klien, instansi, dan kontak untuk pembuatan Quotation, Invoice, dan Kwitansi otomatis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-xl text-xs text-slate-300 font-mono">
            Total Klien: <span className="text-cyan-400 font-bold">{clients.length}</span>
          </div>
        </div>
      </div>

      {content}
    </div>
  );
}
