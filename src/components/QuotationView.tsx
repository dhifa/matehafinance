import React, { useState, useEffect } from "react";
import { collection, onSnapshot, doc, setDoc, query, orderBy, updateDoc, deleteDoc } from "../lib/firestore";
import { db, sanitizeForFirestore } from "../utils/backend";
import { Quotation, QuotationItem, Bank, Client, formatRupiah } from "../types";
import { Plus, Trash2, Save, FileText, Eye, Download, CheckCircle, Search, X, Loader2, Edit3, Check, ListPlus, ArrowUp, ArrowDown, Building2, Users, UserCheck } from "lucide-react";
import QuotationPreview from "./QuotationPreview";
import BankManagementModal from "./BankManagementModal";
import ClientManagement from "./ClientManagement";
import ClientSelector from "./ClientSelector";
import { resolveClientDetails } from "../utils/clientHelper";
import { generateQuotationPdfBlob } from "../utils/pdfGenerator";
import { saveAs } from "file-saver";
import { notify } from "../utils/notification";

interface QuotationViewProps {
  onNotify?: (text: string, type?: "success" | "error" | "warning" | "info", title?: string) => void;
}

export default function QuotationView({ onNotify }: QuotationViewProps = {}) {
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmQuo, setDeleteConfirmQuo] = useState<Quotation | null>(null);
  const [acceptConfirmQuo, setAcceptConfirmQuo] = useState<Quotation | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [editModeId, setEditModeId] = useState<string | null>(null);
  const [editingQuotationNumber, setEditingQuotationNumber] = useState<string>("");
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Modals
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  
  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [termsAndConditions, setTermsAndConditions] = useState("Penawaran ini berlaku selama 14 hari kerja sejak diterbitkan.");
  const [saveToClientDb, setSaveToClientDb] = useState(false);

  // Client Approval state
  const [showClientApproval, setShowClientApproval] = useState(false);
  const [clientApprovalName, setClientApprovalName] = useState("");
  const [clientApprovalTitle, setClientApprovalTitle] = useState("");

  // New item draft input
  const [newItem, setNewItem] = useState({ description: "", qty: 1, days: 1, price: 0 });

  // Individual item inline editing state
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editItemDraft, setEditItemDraft] = useState<{ description: string; qty: number; days: number; price: number }>({
    description: "",
    qty: 1,
    days: 1,
    price: 0,
  });

  useEffect(() => {
    const qQuo = query(collection(db, "quotations"), orderBy("createdAt", "desc"));
    const unsubQuo = onSnapshot(qQuo, (snapshot) => {
      const quos: Quotation[] = [];
      snapshot.forEach((doc) => quos.push({ ...doc.data() } as Quotation));
      setQuotations(quos);
    });

    const qBank = collection(db, "banks");
    const unsubBank = onSnapshot(qBank, (snapshot) => {
      const bks: Bank[] = [];
      snapshot.forEach((doc) => bks.push({ id: doc.id, ...doc.data() } as Bank));
      setBanks(bks);
      if (bks.length > 0 && selectedBankIds.length === 0) {
        const defaults = bks.filter(b => b.isDefault).map(b => b.id);
        if (defaults.length > 0) setSelectedBankIds(defaults);
      }
    });

    const qClients = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      const cls: Client[] = [];
      snapshot.forEach((doc) => cls.push({ id: doc.id, ...doc.data() } as Client));
      setClients(cls);
    });
    
    return () => { unsubQuo(); unsubBank(); unsubClients(); };
  }, []);

  const handleSelectClient = (client: Client) => {
    const details = resolveClientDetails(client);
    setCustomerName(details.company || details.pic);
    setCustomerContact(details.pic || "");
    if (details.phone) setCustomerPhone(details.phone);
  };

  const toggleBank = (id: string) => {
    setSelectedBankIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const addItem = () => {
    if (!newItem.description.trim() || newItem.price <= 0) {
      showNotification("Mohon isi deskripsi item dan harga satuan yang valid.", "warning", "Data Item Belum Lengkap");
      return;
    }
    const item: QuotationItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      description: newItem.description.trim(),
      qty: newItem.qty || 1,
      days: newItem.days || 1,
      price: newItem.price,
      total: (newItem.qty || 1) * (newItem.days || 1) * newItem.price,
    };
    setItems([...items, item]);
    setNewItem({ description: "", qty: 1, days: 1, price: 0 });
  };

  const startEditItem = (index: number) => {
    const itm = items[index];
    setEditingItemIndex(index);
    setEditItemDraft({
      description: itm.description,
      qty: itm.qty,
      days: itm.days || 1,
      price: itm.price,
    });
  };

  const saveEditedItem = () => {
    if (editingItemIndex === null) return;
    if (!editItemDraft.description.trim() || editItemDraft.price <= 0) {
      showNotification("Deskripsi dan harga tidak boleh kosong.", "warning", "Data Item Belum Lengkap");
      return;
    }
    const updated = [...items];
    const qty = editItemDraft.qty || 1;
    const days = editItemDraft.days || 1;
    const price = editItemDraft.price || 0;
    updated[editingItemIndex] = {
      ...updated[editingItemIndex],
      description: editItemDraft.description.trim(),
      qty,
      days,
      price,
      total: qty * days * price,
    };
    setItems(updated);
    setEditingItemIndex(null);
  };

  const cancelEditItem = () => {
    setEditingItemIndex(null);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...items];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setItems(updated);
    if (editingItemIndex !== null) setEditingItemIndex(null);
  };

  const insertBulletPoint = (isDraft: boolean) => {
    if (isDraft) {
      const current = newItem.description;
      const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
      setNewItem({ ...newItem, description: current + prefix + "- " });
    } else {
      const current = editItemDraft.description;
      const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
      setEditItemDraft({ ...editItemDraft, description: current + prefix + "- " });
    }
  };

  const generateQuotationNumber = () => {
    const d = new Date(date);
    const yyyy = !isNaN(d.getFullYear()) ? d.getFullYear() : new Date().getFullYear();
    const mm = String(!isNaN(d.getMonth()) ? d.getMonth() + 1 : new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `QUO/MATEHA/${yyyy}/${mm}/`;
    
    const relevantQuotations = quotations.filter(quo => quo.quotationNumber && quo.quotationNumber.startsWith(prefix));
    let nextSeq = 1;
    if (relevantQuotations.length > 0) {
      const sequences = relevantQuotations.map(quo => {
        const parts = quo.quotationNumber.split('/');
        return parseInt(parts[parts.length - 1], 10) || 0;
      });
      nextSeq = Math.max(...sequences) + 1;
    }
    
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  };

  const saveQuotation = async () => {
    if (!customerName.trim()) {
      showNotification("Mohon isi Nama Klien / Perusahaan terlebih dahulu.", "warning", "Nama Klien Wajib Diisi");
      return;
    }

    // Auto-commit active inline item edit
    let currentItems = [...items];
    if (editingItemIndex !== null && editItemDraft.description.trim() && editItemDraft.price > 0) {
      const qty = editItemDraft.qty || 1;
      const days = editItemDraft.days || 1;
      const price = editItemDraft.price || 0;
      currentItems[editingItemIndex] = {
        ...currentItems[editingItemIndex],
        description: editItemDraft.description.trim(),
        qty,
        days,
        price,
        total: qty * days * price,
      };
      setItems(currentItems);
      setEditingItemIndex(null);
    }

    if (currentItems.length === 0) {
      showNotification("Mohon tambahkan minimal 1 item rincian penawaran.", "warning", "Rincian Item Kosong");
      return;
    }

    const sanitizedItems = currentItems.map((item, idx) => ({
      id: item.id || `quo_item_${idx}_${Date.now()}`,
      description: (item.description || "").trim(),
      qty: Number(item.qty) || 1,
      days: Number(item.days) || 1,
      price: Number(item.price) || 0,
      total: (Number(item.qty) || 1) * (Number(item.days) || 1) * (Number(item.price) || 0)
    }));

    const selectedBanks = banks.filter(b => selectedBankIds.includes(b.id));
    const grandTotal = sanitizedItems.reduce((sum, item) => sum + item.total, 0);
    
    try {
      if (editModeId) {
        const existingQuo = quotations.find(q => q.id === editModeId);
        const finalBanks = selectedBanks.length > 0 ? selectedBanks : (existingQuo?.selectedBanks || []);

        const updatedQuotation: Quotation = {
          id: editModeId,
          quotationNumber: editingQuotationNumber || existingQuo?.quotationNumber || generateQuotationNumber(),
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          customerContact: customerContact.trim() || undefined,
          subject: subject.trim() || "Penawaran Kerjasama Acara",
          date,
          validUntil,
          items: sanitizedItems,
          grandTotal,
          status: existingQuo?.status || "draft",
          createdAt: existingQuo?.createdAt || new Date().toISOString(),
          selectedBanks: finalBanks,
          termsAndConditions: termsAndConditions.trim(),
          showClientApproval: !!showClientApproval,
          clientApprovalName: (showClientApproval && clientApprovalName.trim()) ? clientApprovalName.trim() : undefined,
          clientApprovalTitle: (showClientApproval && clientApprovalTitle.trim()) ? clientApprovalTitle.trim() : undefined,
        };

        await setDoc(doc(db, "quotations", editModeId), sanitizeForFirestore(updatedQuotation));

        if (selectedQuotation && selectedQuotation.id === editModeId) {
          setSelectedQuotation(updatedQuotation);
        }

        // If requested, save new client to database
        if (saveToClientDb && customerName.trim()) {
          const clientExists = clients.some(c => {
            const d = resolveClientDetails(c);
            return (
              d.company.toLowerCase() === customerName.trim().toLowerCase() ||
              c.name.toLowerCase() === customerName.trim().toLowerCase() ||
              (c.company && c.company.toLowerCase() === customerName.trim().toLowerCase())
            );
          });
          if (!clientExists) {
            const clientId = "client_" + Date.now();
            const clientDoc: Partial<Client> = {
              id: clientId,
              name: customerName.trim(),
              company: customerName.trim(),
              pic: customerContact.trim() || undefined,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            if (customerPhone.trim()) clientDoc.phone = customerPhone.trim();
            await setDoc(doc(db, "clients", clientId), sanitizeForFirestore(clientDoc));
          }
        }

        showNotification(`Perubahan penawaran ${editingQuotationNumber || ""} berhasil disimpan!`, "success", "Perubahan Disimpan");
        cancelEdit();
      } else {
        const id = Date.now().toString();
        const quotationNumber = generateQuotationNumber();
        const newQuotation: Quotation = {
          id,
          quotationNumber,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerContact: customerContact.trim(),
          subject: subject.trim() || "Penawaran Kerjasama Acara",
          date,
          validUntil,
          items,
          grandTotal,
          status: "draft",
          createdAt: new Date().toISOString(),
          selectedBanks,
          termsAndConditions: termsAndConditions.trim(),
          showClientApproval: !!showClientApproval,
          clientApprovalName: clientApprovalName.trim() || undefined,
          clientApprovalTitle: clientApprovalTitle.trim() || undefined,
        };
        await setDoc(doc(db, "quotations", id), sanitizeForFirestore(newQuotation));
        showNotification(`Surat Penawaran ${quotationNumber} berhasil dibuat dan disimpan!`, "success", "Penawaran Berhasil Dibuat");
        
        {/* If requested, save new client to database */}
        if (saveToClientDb && customerName.trim()) {
          const clientExists = clients.some(c => {
            const d = resolveClientDetails(c);
            return (
              d.company.toLowerCase() === customerName.trim().toLowerCase() ||
              c.name.toLowerCase() === customerName.trim().toLowerCase() ||
              (c.company && c.company.toLowerCase() === customerName.trim().toLowerCase())
            );
          });
          if (!clientExists) {
            const clientId = "client_" + Date.now();
            const clientDoc: Partial<Client> = {
              id: clientId,
              name: customerName.trim(),
              company: customerName.trim(),
              pic: customerContact.trim() || undefined,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            if (customerPhone.trim()) clientDoc.phone = customerPhone.trim();
            await setDoc(doc(db, "clients", clientId), sanitizeForFirestore(clientDoc));
          }
        }

        // Reset form
        setCustomerName("");
        setCustomerPhone("");
        setCustomerContact("");
        setSubject("");
        setItems([]);
        setDate(new Date().toISOString().split("T")[0]);
        setValidUntil("");
        setSelectedBankIds([]);
        setSaveToClientDb(false);
        setTermsAndConditions("Penawaran ini berlaku selama 14 hari kerja sejak diterbitkan.");
        setShowClientApproval(false);
        setClientApprovalName("");
        setClientApprovalTitle("");
      }
    } catch (error: any) {
      console.error("Error saving quotation:", error);
      showNotification("Gagal menyimpan penawaran: " + (error?.message || "Kesalahan koneksi"), "error", "Gagal Menyimpan");
    }
  };

  const handleEditQuotation = (quo: Quotation) => {
    setEditModeId(quo.id);
    setEditingQuotationNumber(quo.quotationNumber);
    setCustomerName(quo.customerName);
    setCustomerPhone(quo.customerPhone || "");
    setCustomerContact(quo.customerContact || "");
    setSubject(quo.subject || "");
    setDate(quo.date);
    setValidUntil(quo.validUntil || "");
    setItems(quo.items ? JSON.parse(JSON.stringify(quo.items)) : []);
    setSelectedBankIds(quo.selectedBanks ? quo.selectedBanks.map(b => b.id) : []);
    setTermsAndConditions(quo.termsAndConditions || "Penawaran ini berlaku selama 14 hari kerja sejak diterbitkan.");
    setShowClientApproval(!!quo.showClientApproval);
    setClientApprovalName(quo.clientApprovalName || "");
    setClientApprovalTitle(quo.clientApprovalTitle || "");
    setEditingItemIndex(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditModeId(null);
    setEditingQuotationNumber("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerContact("");
    setSubject("");
    setItems([]);
    setDate(new Date().toISOString().split("T")[0]);
    setValidUntil("");
    setSelectedBankIds([]);
    setTermsAndConditions("Penawaran ini berlaku selama 14 hari kerja sejak diterbitkan.");
    setShowClientApproval(false);
    setClientApprovalName("");
    setClientApprovalTitle("");
    setEditingItemIndex(null);
    setSaveToClientDb(false);
  };

  const handleDeleteSingle = (quo: Quotation) => {
    setDeleteConfirmQuo(quo);
  };

  const executeDeleteSingle = async () => {
    if (!deleteConfirmQuo) return;
    try {
      await deleteDoc(doc(db, "quotations", deleteConfirmQuo.id));
      if (editModeId === deleteConfirmQuo.id) cancelEdit();
      if (selectedQuotation?.id === deleteConfirmQuo.id) setSelectedQuotation(null);
    } catch (err) {
      console.error("Error deleting quotation:", err);
    } finally {
      setDeleteConfirmQuo(null);
    }
  };

  const handleConfirmDeleteAll = async () => {
    for (const quo of quotations) {
      await deleteDoc(doc(db, "quotations", quo.id));
    }
    setShowDeleteConfirm(false);
    cancelEdit();
  };

  const executeAcceptQuotation = async () => {
    if (!acceptConfirmQuo) return;
    const quo = acceptConfirmQuo;
    try {
      const invoiceId = Date.now().toString();
      const invoiceNumber = quo.quotationNumber.replace("QUO", "INV");
      const newInvoice = {
        id: invoiceId,
        invoiceNumber,
        customerName: quo.customerName,
        customerPhone: quo.customerPhone || "",
        customerContact: quo.customerContact || "",
        date: new Date().toISOString().split("T")[0],
        dueDate: "",
        subject: quo.subject || "Pembayaran Acara",
        items: quo.items.map(i => ({ ...i, id: Date.now().toString() + Math.random().toString(36).substring(2, 6) })),
        grandTotal: quo.grandTotal,
        status: "draft" as const,
        createdAt: new Date().toISOString(),
        selectedBanks: quo.selectedBanks || [],
        termsAndConditions: quo.termsAndConditions || "Pelunasan invoice wajib dibayarkan selambat-lambatnya pada hari H acara.",
      };
      await setDoc(doc(db, "invoices", invoiceId), sanitizeForFirestore(newInvoice));
      await updateDoc(doc(db, "quotations", quo.id), { status: "accepted" });
    } catch (error) {
      console.error("Error converting quotation to invoice:", error);
    } finally {
      setAcceptConfirmQuo(null);
    }
  };

  const downloadPdfDirect = async (quo: Quotation) => {
    setDownloadingId(quo.id);
    try {
      const blob = await generateQuotationPdfBlob(quo);
      const cleanFileName = `Quotation_${quo.quotationNumber.replace(/\//g, '_')}_${quo.customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      saveAs(blob, cleanFileName);
    } catch (err: any) {
      console.error("Error exporting quotation PDF:", err);
      showNotification("Gagal mengunduh PDF. Silakan coba lagi.", "error", "Unduh Gagal");
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredQuotations = quotations.filter(q => 
    q.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (q.subject && q.subject.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const grandTotalAll = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="text-white space-y-6">
      {selectedQuotation && (
        <QuotationPreview 
          quotation={selectedQuotation} 
          onClose={() => setSelectedQuotation(null)} 
          onDelete={(quo) => setDeleteConfirmQuo(quo)}
        />
      )}
      
      {/* Bank Management Modal */}
      <BankManagementModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        banks={banks}
        onSelectBank={(b) => {
          if (!selectedBankIds.includes(b.id)) {
            setSelectedBankIds([...selectedBankIds, b.id]);
          }
        }}
      />

      {/* Client Management Modal */}
      <ClientManagement
        isModal={true}
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onSelectClient={handleSelectClient}
      />

      {/* Single Quotation Delete Confirmation Modal */}
      {deleteConfirmQuo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-700 max-w-sm w-full shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold mb-1.5 text-white">Hapus Quotation</h3>
            <p className="text-slate-400 text-xs mb-5 leading-relaxed">
              Apakah Anda yakin ingin menghapus surat penawaran <strong className="text-white font-mono">{deleteConfirmQuo.quotationNumber}</strong> ({deleteConfirmQuo.customerName})? Dokumen ini akan dihilangkan dari sistem.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button 
                type="button" 
                onClick={() => setDeleteConfirmQuo(null)} 
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={executeDeleteSingle} 
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accept Quotation & Generate Invoice Modal */}
      {acceptConfirmQuo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-700 max-w-sm w-full shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
              <CheckCircle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold mb-1.5 text-white">Setujui Penawaran</h3>
            <p className="text-slate-400 text-xs mb-5 leading-relaxed">
              Setujui penawaran <strong className="text-white font-mono">{acceptConfirmQuo.quotationNumber}</strong> untuk <strong>{acceptConfirmQuo.customerName}</strong>? Sistem akan otomatis membuatkan faktur tagihan invoice baru.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button 
                type="button" 
                onClick={() => setAcceptConfirmQuo(null)} 
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={executeAcceptQuotation} 
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Ya, Setujui & Buat Invoice</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-700 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold mb-2 text-white">Hapus Semua Penawaran</h3>
            <p className="text-slate-400 text-xs mb-6 leading-relaxed">Apakah Anda yakin ingin menghapus seluruh riwayat quotation? Tindakan ini tidak dapat dibatalkan.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer">Batal</button>
              <button onClick={handleConfirmDeleteAll} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950 cursor-pointer">Hapus Semua</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/50 p-4 sm:p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-cyan-400" />
            <span>Manajemen Quotation (Penawaran)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Buat, kelola, cetak, edit rincian item, dan ekspor penawaran harga resmi Mateha Production.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* Quick Bank Database Button */}
          <button
            type="button"
            onClick={() => setIsBankModalOpen(true)}
            className="flex items-center space-x-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-cyan-400 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
            title="Kelola daftar rekening bank transfer resmi"
          >
            <Building2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Database Bank ({banks.length})</span>
          </button>

          {/* Quick Client Database Button */}
          <button
            type="button"
            onClick={() => setIsClientModalOpen(true)}
            className="flex items-center space-x-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-cyan-400 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
            title="Kelola daftar database klien untuk repeat order"
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>Database Klien ({clients.length})</span>
          </button>

          {quotations.length > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua Quotation</span>
            </button>
          )}
        </div>
      </div>

      {/* CREATE / EDIT FORM */}
      <div className={`p-6 rounded-2xl border shadow-xl space-y-6 transition ${
        editModeId 
          ? "bg-slate-900/90 border-cyan-500/50 ring-1 ring-cyan-500/30" 
          : "bg-slate-900/60 border-slate-800"
      }`}>
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${editModeId ? "bg-amber-400 animate-pulse" : "bg-cyan-400"}`} />
            <div>
              <h2 className="text-base font-bold text-white">
                {editModeId ? "Mode Edit Penawaran Harga" : "Buat Penawaran Harga Baru"}
              </h2>
              {editModeId && (
                <p className="text-xs font-mono text-cyan-400 font-semibold">{editingQuotationNumber}</p>
              )}
            </div>
          </div>
          {editModeId && (
            <button
              onClick={cancelEdit}
              className="text-xs bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Batal Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mb-1.5">
              <label className="whitespace-nowrap text-slate-400 font-semibold block">Nama Klien / Perusahaan *</label>
              <ClientSelector
                clients={clients}
                onSelectClient={handleSelectClient}
                onOpenClientManager={() => setIsClientModalOpen(true)}
                selectedClientName={customerName}
              />
            </div>
            <input
              type="text"
              placeholder="Contoh: PT Astra International / CV Maju Bersama"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <p className="text-[10px] text-slate-500 mt-1">Dicetak sebagai "Kepada Yth" (Nama Perusahaan / Instansi).</p>
            {customerName && !clients.some(c => c.name.toLowerCase() === customerName.toLowerCase()) && (
              <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-cyan-400/90 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToClientDb}
                  onChange={(e) => setSaveToClientDb(e.target.checked)}
                  className="rounded border-slate-750 text-cyan-500 focus:ring-0 w-3.5 h-3.5 bg-slate-900"
                />
                <span>Simpan "{customerName}" ke Database Klien</span>
              </label>
            )}
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">Perihal / Deskripsi Acara</label>
            <input
              type="text"
              placeholder="Contoh: Penawaran Sound System & Lighting Gathering 2026"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">No. Telepon / WhatsApp</label>
            <input
              type="text"
              placeholder="0812-xxxx-xxxx"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">Kontak Person (Nama PIC Klien)</label>
            <input
              type="text"
              placeholder="Contoh: Ibu Rina / Bpk. Hendra"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              value={customerContact}
              onChange={(e) => setCustomerContact(e.target.value)}
            />
            <p className="text-[10px] text-slate-500 mt-1">Dicetak sebagai "Up / PIC" di surat penawaran.</p>
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">Tanggal Penawaran</label>
            <input
              type="date"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">Berlaku Hingga</label>
            <input
              type="date"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>

        {/* Bank accounts select */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
            <label className="text-xs text-slate-400 font-semibold block">Pilih Rekening Pembayaran yang Dicantumkan:</label>
            <button
              type="button"
              onClick={() => setIsBankModalOpen(true)}
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              <Building2 className="w-3 h-3" />
              <span>+ Kelola Database Bank</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {banks.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBank(b.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedBankIds.includes(b.id)
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {b.name} - {b.accountNumber} ({b.accountHolder})
              </button>
            ))}
            {banks.length === 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 italic">Belum ada data rekening bank.</span>
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(true)}
                  className="text-xs text-cyan-400 font-bold hover:underline"
                >
                  + Tambah Rekening Bank Sekarang
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Terms and Conditions */}
        <div>
          <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Syarat dan Ketentuan Penawaran</label>
          <textarea
            className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
            value={termsAndConditions}
            onChange={(e) => setTermsAndConditions(e.target.value)}
            rows={2}
            placeholder="Ketentuan pembayaran, instalasi, pembatalan, dsb."
          />
        </div>

        {/* Items Input & Manager */}
        <div className="bg-slate-950/70 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <span>Rincian Layanan & Peralatan</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-cyan-400 text-[11px] font-mono">
                {items.length} Item
              </span>
            </h3>
            <span className="hidden sm:inline text-[11px] text-slate-400">Deskripsi dapat diedit langsung per item</span>
          </div>
          
          {/* New Item Form */}
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">Tambah Item Baru:</span>
              <button
                type="button"
                onClick={() => insertBulletPoint(true)}
                className="flex items-center space-x-1 text-[10px] text-slate-400 hover:text-cyan-300 transition bg-slate-950 px-2 py-1 rounded-md border border-slate-800 cursor-pointer"
                title="Tambahkan baris poin (- )"
              >
                <ListPlus className="w-3 h-3" />
                <span>+ Poin (-)</span>
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-start">
              <textarea
                placeholder="Deskripsi spesifikasi/alat (Bisa multi-baris, gunakan '-' untuk poin rincian)..."
                className="flex-1 bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none min-h-[68px]"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={2}
              />
              <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <div className="w-20">
                  <label className="text-[10px] text-slate-400 font-semibold mb-1 block">Qty</label>
                  <input
                    type="number"
                    placeholder="Qty"
                    min="1"
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-xs text-white text-center focus:border-cyan-500 focus:outline-none font-semibold"
                    value={newItem.qty || ""}
                    onChange={(e) => setNewItem({ ...newItem, qty: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="w-20">
                  <label className="text-[10px] text-slate-400 font-semibold mb-1 block">Hari</label>
                  <input
                    type="number"
                    placeholder="Hari"
                    min="1"
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-xs text-white text-center focus:border-cyan-500 focus:outline-none font-semibold"
                    value={newItem.days || ""}
                    onChange={(e) => setNewItem({ ...newItem, days: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="w-36">
                  <label className="text-[10px] text-slate-400 font-semibold mb-1 block">Harga Satuan (Rp)</label>
                  <input
                    type="number"
                    placeholder="Harga"
                    min="0"
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
                    value={newItem.price || ""}
                    onChange={(e) => setNewItem({ ...newItem, price: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="self-end pt-5">
                  <button
                    type="button"
                    onClick={addItem}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-cyan-950 cursor-pointer h-[38px]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Items List with Interactive Editing */}
          {items.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs italic bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
              Belum ada item layanan. Masukkan deskripsi item dan harga di atas.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const isEditingThis = editingItemIndex === idx;

                if (isEditingThis) {
                  return (
                    <div
                      key={item.id || idx}
                      className="bg-slate-900 border-2 border-cyan-500/70 p-4 rounded-xl shadow-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-400">Edit Rincian Item #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => insertBulletPoint(false)}
                          className="flex items-center space-x-1 text-[10px] text-slate-300 hover:text-cyan-300 transition bg-slate-950 px-2 py-0.5 rounded border border-slate-700 cursor-pointer"
                        >
                          <ListPlus className="w-3 h-3" />
                          <span>+ Poin (-)</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-400 font-semibold block">Deskripsi Isi / Spesifikasi:</label>
                        <textarea
                          className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-xs text-white focus:border-cyan-400 focus:outline-none"
                          value={editItemDraft.description}
                          onChange={(e) => setEditItemDraft({ ...editItemDraft, description: e.target.value })}
                          rows={3}
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                        <div>
                          <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Qty:</label>
                          <input
                            type="number"
                            min="1"
                            className="w-full bg-slate-950 border border-slate-700 p-2 rounded-xl text-xs text-white text-center focus:border-cyan-400 focus:outline-none font-bold"
                            value={editItemDraft.qty || ""}
                            onChange={(e) => setEditItemDraft({ ...editItemDraft, qty: parseInt(e.target.value) || 0 })}
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Hari:</label>
                          <input
                            type="number"
                            min="1"
                            className="w-full bg-slate-950 border border-slate-700 p-2 rounded-xl text-xs text-white text-center focus:border-cyan-400 focus:outline-none font-bold"
                            value={editItemDraft.days || ""}
                            onChange={(e) => setEditItemDraft({ ...editItemDraft, days: parseInt(e.target.value) || 0 })}
                          />
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                          <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Harga Satuan (Rp):</label>
                          <input
                            type="number"
                            min="0"
                            className="w-full bg-slate-950 border border-slate-700 p-2 rounded-xl text-xs text-white focus:border-cyan-400 focus:outline-none font-mono"
                            value={editItemDraft.price || ""}
                            onChange={(e) => setEditItemDraft({ ...editItemDraft, price: parseInt(e.target.value) || 0 })}
                          />
                        </div>

                        <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={cancelEditItem}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Batal
                          </button>
                          <button
                            type="button"
                            onClick={saveEditedItem}
                            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Simpan Item
                          </button>
                        </div>
                      </div>

                      <div className="text-right text-[11px] text-cyan-300 font-mono">
                        Subtotal perkiraan: <strong>{formatRupiah((editItemDraft.qty || 1) * (editItemDraft.days || 1) * (editItemDraft.price || 0))}</strong>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id || idx}
                    className="flex flex-col sm:flex-row sm:items-start justify-between bg-slate-900/90 hover:bg-slate-900 px-4 py-3 rounded-xl border border-slate-800/90 text-xs gap-3 transition"
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <span className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center font-mono font-bold text-[11px] text-slate-400 shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-1">
                        <div className="font-semibold text-slate-100 whitespace-pre-line leading-relaxed">
                          {item.description}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Qty: <strong className="text-slate-300">{item.qty}</strong>{(item.days || 1) > 1 && <> × <strong className="text-slate-300">{item.days} hari</strong></>} @ <span className="font-mono">{formatRupiah(item.price)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                      <span className="font-bold text-cyan-400 font-mono text-sm">
                        {formatRupiah(item.total)}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(idx, 'up')}
                          disabled={idx === 0}
                          className="text-slate-500 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                          title="Pindah ke Atas"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(idx, 'down')}
                          disabled={idx === items.length - 1}
                          className="text-slate-500 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                          title="Pindah ke Bawah"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditItem(idx)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-xs font-semibold transition cursor-pointer border border-slate-700"
                          title="Edit Deskripsi Item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          title="Hapus Baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-between items-center px-4 py-3 bg-slate-900/95 rounded-xl border border-slate-700/80 mt-3">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">TOTAL ESTIMASI PENAWARAN:</span>
                <span className="text-base font-extrabold text-cyan-400 font-mono">{formatRupiah(grandTotalAll)}</span>
              </div>
            </div>
          )}
        </div>

        {/* PENGATURAN APPROVAL KLIEN */}
        <div className="bg-slate-950/70 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-800/50 text-cyan-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Approval / Lembar Pengesahan Klien
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tampilkan kolom tanda tangan persetujuan klien di surat penawaran
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer self-start sm:self-auto">
              <input
                type="checkbox"
                checked={showClientApproval}
                onChange={(e) => {
                  const val = e.target.checked;
                  setShowClientApproval(val);
                  if (val && !clientApprovalName && customerContact) {
                    setClientApprovalName(customerContact);
                    if (!clientApprovalTitle) setClientApprovalTitle("PIC / Penanggung Jawab");
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
              <span className="ml-2.5 text-xs font-semibold text-slate-300">
                {showClientApproval ? "Aktif (Ditampilkan)" : "Nonaktif (Sembunyikan)"}
              </span>
            </label>
          </div>

          {showClientApproval && (
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300 font-semibold">Identitas Penandatangan Klien:</span>
                {customerContact && (
                  <button
                    type="button"
                    onClick={() => {
                      setClientApprovalName(customerContact);
                      if (!clientApprovalTitle) setClientApprovalTitle("PIC / Penanggung Jawab");
                    }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 hover:border-cyan-700 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>Sama dengan PIC ({customerContact})</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] text-slate-400 font-semibold mb-1 block">
                    Nama Approval / Penandatangan Klien
                  </label>
                  <input
                    type="text"
                    placeholder={customerContact || "Contoh: Bpk. Bambang Sutrisno / Ibu Rina"}
                    value={clientApprovalName}
                    onChange={(e) => setClientApprovalName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Bisa sama dengan PIC atau nama pejabat/atasan klien yang berbeda.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 font-semibold mb-1 block">
                    Jabatan / Keterangan Klien (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Manager Operasional / Project Leader / Klien"
                    value={clientApprovalTitle}
                    onChange={(e) => setClientApprovalTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Ditampilkan di bawah nama penandatangan klien.
                  </p>
                </div>
              </div>

              <div className="bg-cyan-950/30 border border-cyan-900/40 rounded-lg p-2.5 flex items-center gap-2 text-[11px] text-cyan-300">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Kolom pengesahan klien akan tercetak berdampingan dengan tanda tangan Mateha Production di lembar penawaran.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          {editModeId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Batal
            </button>
          )}
          <button
            type="button"
            onClick={saveQuotation}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-6 py-2.5 rounded-xl font-bold text-xs text-white transition shadow-lg shadow-emerald-950 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{editModeId ? "Simpan Perubahan Penawaran" : "Terbitkan Quotation"}</span>
          </button>
        </div>
      </div>

      {/* LIST OF QUOTATIONS */}
      <div className="bg-slate-900/50 p-4 sm:p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>Daftar Dokumen Penawaran</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs font-mono">{quotations.length}</span>
          </h2>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari no. quotation / klien..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 pl-8 pr-3 py-2 rounded-xl text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        {filteredQuotations.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
            Tidak ada dokumen penawaran yang ditemukan.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredQuotations.map((quo) => {
              const isAccepted = quo.status === "accepted";
              const isDownloading = downloadingId === quo.id;

              return (
                <div
                  key={quo.id}
                  className="flex flex-col md:flex-row md:items-center justify-between bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700 transition gap-3"
                >
                  <div className="flex-1 cursor-pointer" onClick={() => setSelectedQuotation(quo)}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-white text-sm">{quo.quotationNumber}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-semibold text-cyan-300 text-sm">{quo.customerName}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                        isAccepted 
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}>
                        {isAccepted ? "Disetujui / Invoice" : "Draft / Menunggu"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      <span>Tanggal: {quo.date}</span>
                      {quo.subject && <span>| {quo.subject}</span>}
                      <span>| Total: <strong className="text-slate-200 font-mono">{formatRupiah(quo.grandTotal)}</strong></span>
                      {quo.validUntil && <span>| Berlaku s/d: {quo.validUntil}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                    <button
                      onClick={() => setSelectedQuotation(quo)}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                      title="Lihat Pratinjau"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat</span>
                    </button>

                    <button
                      onClick={() => downloadPdfDirect(quo)}
                      disabled={isDownloading}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                      title="Unduh PDF Resmi"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>PDF...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </>
                      )}
                    </button>

                    {!isAccepted && (
                      <button
                        onClick={() => setAcceptConfirmQuo(quo)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-xs font-bold transition cursor-pointer"
                        title="Setujui dan buat Invoice otomatis"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Setujui</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleEditQuotation(quo)}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                      title="Edit Dokumen Penawaran"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSingle(quo);
                      }}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 border border-slate-800 hover:border-rose-700 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
