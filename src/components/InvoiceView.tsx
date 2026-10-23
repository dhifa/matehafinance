import React, { useState, useEffect } from "react";
import { collection, onSnapshot, doc, setDoc, query, orderBy, updateDoc, deleteDoc } from "../lib/firestore";
import { db, sanitizeForFirestore } from "../utils/backend";
import { Invoice, InvoiceItem, formatRupiah, Bank, Client } from "../types";
import { Plus, Trash2, Save, FileText, Eye, Download, Search, X, Loader2, Edit3, Check, ListPlus, ArrowUp, ArrowDown, Building2, Users, UserCheck, Coins, Percent } from "lucide-react";
import InvoicePreview from "./InvoicePreview";
import BankManagementModal from "./BankManagementModal";
import ClientManagement from "./ClientManagement";
import ClientSelector from "./ClientSelector";
import { resolveClientDetails } from "../utils/clientHelper";
import { bulkExport } from "../utils/bulkExport";
import { generateInvoicePdfBlob } from "../utils/pdfGenerator";
import { saveAs } from "file-saver";
import { notify } from "../utils/notification";
import LineItemFields from "./LineItemFields";
import { LineItemDraft, draftFromItem, emptyLineItem, formatQty, formatTime, mainAmount, newItemId, normalizeItem, subItemAmount, validateLineItem } from "../utils/lineItems";

interface InvoiceViewProps {
  onNotify?: (text: string, type?: "success" | "error" | "warning" | "info", title?: string) => void;
}

export default function InvoiceView({ onNotify }: InvoiceViewProps = {}) {
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
  const [deleteConfirmInv, setDeleteConfirmInv] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [editModeId, setEditModeId] = useState<string | null>(null);
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Modals state
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  // Form states
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [termsAndConditions, setTermsAndConditions] = useState("Pelunasan invoice wajib dibayarkan selambat-lambatnya pada hari H acara.");
  const [saveToClientDb, setSaveToClientDb] = useState(false);

  // Client Approval state
  const [showClientApproval, setShowClientApproval] = useState(false);
  const [clientApprovalName, setClientApprovalName] = useState("");
  const [clientApprovalTitle, setClientApprovalTitle] = useState("");

  // DP (Down Payment) states
  const [isDp, setIsDp] = useState(false);
  const [dpMode, setDpMode] = useState<"percentage" | "nominal">("percentage");
  const [dpPercent, setDpPercent] = useState<number>(50);
  const [dpAmountManual, setDpAmountManual] = useState<number>(0);

  // New item draft input
  const [newItem, setNewItem] = useState<LineItemDraft>(emptyLineItem());

  // Individual item inline editing state
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editItemDraft, setEditItemDraft] = useState<LineItemDraft>(emptyLineItem());

  useEffect(() => {
    const qInv = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      const invs: Invoice[] = [];
      snapshot.forEach((doc) => invs.push({ ...doc.data() } as Invoice));
      setInvoices(invs);
    });

    const qBank = collection(db, "banks");
    const unsubBank = onSnapshot(qBank, (snapshot) => {
      const bks: Bank[] = [];
      snapshot.forEach((doc) => bks.push({ id: doc.id, ...doc.data() } as Bank));
      setBanks(bks);
      // Auto-select default bank if none selected yet
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

    return () => { unsubInv(); unsubBank(); unsubClients(); };
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
    const problem = validateLineItem(newItem);
    if (problem) {
      showNotification(problem, "warning", "Data Item Belum Lengkap");
      return;
    }
    setItems([...items, normalizeItem(newItem, newItemId())]);
    setNewItem(emptyLineItem());
  };

  const startEditItem = (index: number) => {
    setEditingItemIndex(index);
    setEditItemDraft(draftFromItem(items[index]));
  };

  const saveEditedItem = () => {
    if (editingItemIndex === null) return;
    const problem = validateLineItem(editItemDraft);
    if (problem) {
      showNotification(problem, "warning", "Data Item Belum Lengkap");
      return;
    }
    const updated = [...items];
    updated[editingItemIndex] = normalizeItem(editItemDraft, updated[editingItemIndex].id);
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

  const generateInvoiceNumber = () => {
    const d = new Date(date);
    const yyyy = !isNaN(d.getFullYear()) ? d.getFullYear() : new Date().getFullYear();
    const mm = String(!isNaN(d.getMonth()) ? d.getMonth() + 1 : new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `INV/MATEHA/${yyyy}/${mm}/`;
    
    const relevantInvoices = invoices.filter(inv => inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix));
    let nextSeq = 1;
    if (relevantInvoices.length > 0) {
      const sequences = relevantInvoices.map(inv => {
        const parts = inv.invoiceNumber.split('/');
        return parseInt(parts[parts.length - 1], 10) || 0;
      });
      nextSeq = Math.max(...sequences) + 1;
    }
    
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  };

  const updateInvoiceStatus = async (id: string, newStatus: "draft" | "sent" | "paid") => {
    await updateDoc(doc(db, "invoices", id), { status: newStatus });
  };

  const handleConfirmDelete = async () => {
    for (const inv of invoices) {
      await deleteDoc(doc(db, "invoices", inv.id));
    }
    setShowDeleteConfirm(false);
    cancelEdit();
  };

  const handleDeleteSingle = (inv: Invoice) => {
    setDeleteConfirmInv(inv);
  };

  const executeDeleteSingle = async () => {
    if (!deleteConfirmInv) return;
    try {
      await deleteDoc(doc(db, "invoices", deleteConfirmInv.id));
      if (editModeId === deleteConfirmInv.id) cancelEdit();
      if (selectedInvoice?.id === deleteConfirmInv.id) setSelectedInvoice(null);
    } catch (err) {
      console.error("Error deleting invoice:", err);
    } finally {
      setDeleteConfirmInv(null);
    }
  };

  const editInvoice = (inv: Invoice) => {
    setEditModeId(inv.id);
    setEditingInvoiceNumber(inv.invoiceNumber);
    setCustomerName(inv.customerName);
    setCustomerPhone(inv.customerPhone || "");
    setCustomerContact(inv.customerContact || "");
    setSubject(inv.subject || "");
    setDate(inv.date);
    setDueDate(inv.dueDate || "");
    setItems(inv.items ? JSON.parse(JSON.stringify(inv.items)) : []);
    setSelectedBankIds(inv.selectedBanks ? inv.selectedBanks.map(b => b.id) : []);
    setTermsAndConditions(inv.termsAndConditions || "Pelunasan invoice wajib dibayarkan selambat-lambatnya pada hari H acara.");
    setShowClientApproval(!!inv.showClientApproval);
    setClientApprovalName(inv.clientApprovalName || "");
    setClientApprovalTitle(inv.clientApprovalTitle || "");
    // DP state
    setIsDp(!!inv.isDp);
    setDpMode(inv.dpMode || "percentage");
    setDpPercent(inv.dpPercent || 50);
    setDpAmountManual(inv.dpAmount || (inv.isDp ? inv.grandTotal : 0));
    setEditingItemIndex(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditModeId(null);
    setEditingInvoiceNumber("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerContact("");
    setSubject("");
    setItems([]);
    setDate(new Date().toISOString().split("T")[0]);
    setDueDate("");
    setSelectedBankIds([]);
    setTermsAndConditions("Pelunasan invoice wajib dibayarkan selambat-lambatnya pada hari H acara.");
    setShowClientApproval(false);
    setClientApprovalName("");
    setClientApprovalTitle("");
    setIsDp(false);
    setDpMode("percentage");
    setDpPercent(50);
    setDpAmountManual(0);
    setEditingItemIndex(null);
    setSaveToClientDb(false);
  };

  const saveInvoice = async () => {
    if (!customerName.trim()) {
      showNotification("Mohon isi Nama Klien / Perusahaan terlebih dahulu.", "warning", "Nama Klien Wajib Diisi");
      return;
    }

    // Auto-commit any currently active inline item edit
    let currentItems = [...items];
    if (editingItemIndex !== null && !validateLineItem(editItemDraft)) {
      currentItems[editingItemIndex] = normalizeItem(editItemDraft, currentItems[editingItemIndex].id);
      setItems(currentItems);
      setEditingItemIndex(null);
    }

    if (currentItems.length === 0) {
      showNotification("Mohon tambahkan minimal 1 item rincian tagihan.", "warning", "Item Tagihan Kosong");
      return;
    }

    const sanitizedItems = currentItems.map((item, idx) => normalizeItem(item, item.id || `item_${idx}_${Date.now()}`));

    const selectedBanks = banks.filter(b => selectedBankIds.includes(b.id));
    const subtotalItems = sanitizedItems.reduce((sum, item) => sum + item.total, 0);

    const finalIsDp = !!isDp;
    let finalGrandTotal = subtotalItems;
    let finalDpPercent: number | undefined = undefined;
    let finalDpAmount: number | undefined = undefined;
    let finalTotalAmount: number | undefined = undefined;
    let finalRemainingAmount: number | undefined = undefined;
    let finalDpMode: "percentage" | "nominal" | undefined = undefined;

    if (finalIsDp) {
      finalDpMode = dpMode;
      if (dpMode === "percentage") {
        finalDpPercent = Math.max(1, Math.min(100, Number(dpPercent) || 50));
        finalDpAmount = Math.round((subtotalItems * finalDpPercent) / 100);
      } else {
        finalDpAmount = Math.max(0, Math.min(subtotalItems, Number(dpAmountManual) || 0));
        finalDpPercent = subtotalItems > 0 ? Number(((finalDpAmount / subtotalItems) * 100).toFixed(1)) : 0;
      }
      finalGrandTotal = finalDpAmount;
      finalTotalAmount = subtotalItems;
      finalRemainingAmount = Math.max(0, subtotalItems - finalDpAmount);
    }
    
    try {
      if (editModeId) {
        const existingInv = invoices.find(inv => inv.id === editModeId);
        const finalBanks = selectedBanks.length > 0 ? selectedBanks : (existingInv?.selectedBanks || []);

        const updatedInvoice: Invoice = {
          id: editModeId,
          invoiceNumber: editingInvoiceNumber || existingInv?.invoiceNumber || generateInvoiceNumber(),
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          customerContact: customerContact.trim() || undefined,
          subject: subject.trim() || "Tagihan Layanan Event",
          date,
          dueDate: dueDate || "",
          items: sanitizedItems,
          grandTotal: finalGrandTotal,
          status: existingInv?.status || "draft",
          createdAt: existingInv?.createdAt || new Date().toISOString(),
          selectedBanks: finalBanks,
          termsAndConditions: termsAndConditions.trim(),
          notes: existingInv?.notes || undefined,
          showClientApproval: !!showClientApproval,
          clientApprovalName: (showClientApproval && clientApprovalName.trim()) ? clientApprovalName.trim() : undefined,
          clientApprovalTitle: (showClientApproval && clientApprovalTitle.trim()) ? clientApprovalTitle.trim() : undefined,
          isDp: finalIsDp,
          dpMode: finalIsDp ? finalDpMode : undefined,
          dpPercent: finalIsDp ? finalDpPercent : undefined,
          dpAmount: finalIsDp ? finalDpAmount : undefined,
          totalAmount: finalIsDp ? finalTotalAmount : undefined,
          remainingAmount: finalIsDp ? finalRemainingAmount : undefined,
        };

        await setDoc(doc(db, "invoices", editModeId), sanitizeForFirestore(updatedInvoice));

        if (selectedInvoice && selectedInvoice.id === editModeId) {
          setSelectedInvoice(updatedInvoice);
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

        showNotification(`Perubahan invoice ${editingInvoiceNumber || ""} berhasil disimpan!`, "success", "Perubahan Disimpan");
        cancelEdit();
      } else {
        const id = Date.now().toString();
        const invoiceNumber = generateInvoiceNumber();
        const newInvoice: Invoice = {
          id,
          invoiceNumber,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          customerContact: customerContact.trim() || undefined,
          subject: subject.trim() || "Tagihan Layanan Event",
          date,
          dueDate: dueDate || "",
          items: sanitizedItems,
          grandTotal: finalGrandTotal,
          status: "draft",
          createdAt: new Date().toISOString(),
          selectedBanks,
          termsAndConditions: termsAndConditions.trim(),
          showClientApproval: !!showClientApproval,
          clientApprovalName: (showClientApproval && clientApprovalName.trim()) ? clientApprovalName.trim() : undefined,
          clientApprovalTitle: (showClientApproval && clientApprovalTitle.trim()) ? clientApprovalTitle.trim() : undefined,
          isDp: finalIsDp,
          dpMode: finalIsDp ? finalDpMode : undefined,
          dpPercent: finalIsDp ? finalDpPercent : undefined,
          dpAmount: finalIsDp ? finalDpAmount : undefined,
          totalAmount: finalIsDp ? finalTotalAmount : undefined,
          remainingAmount: finalIsDp ? finalRemainingAmount : undefined,
        };
        await setDoc(doc(db, "invoices", id), sanitizeForFirestore(newInvoice));
        showNotification(`Faktur Invoice ${invoiceNumber} berhasil dibuat dan disimpan!`, "success", "Invoice Berhasil Diterbitkan");
        
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
        setDueDate("");
        setSelectedBankIds([]);
        setSaveToClientDb(false);
        setTermsAndConditions("Pelunasan invoice wajib dibayarkan selambat-lambatnya pada hari H acara.");
      }
    } catch (error: any) {
      console.error("Error saving invoice:", error);
      showNotification("Gagal menyimpan invoice: " + (error?.message || "Kesalahan koneksi"), "error", "Gagal Menyimpan");
    }
  };

  const downloadPdfDirect = async (inv: Invoice) => {
    setDownloadingId(inv.id);
    try {
      const blob = await generateInvoicePdfBlob(inv);
      const cleanFileName = `Invoice_${inv.invoiceNumber.replace(/\//g, '_')}_${inv.customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      saveAs(blob, cleanFileName);
    } catch (err: any) {
      console.error("Error exporting invoice PDF:", err);
      showNotification("Gagal mengunduh PDF. Silakan coba lagi.", "error", "Unduh Gagal");
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (inv.subject && inv.subject.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const grandTotalAll = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="text-white space-y-6">
      {selectedInvoice && (
        <InvoicePreview 
          invoice={selectedInvoice} 
          onClose={() => setSelectedInvoice(null)} 
          onDelete={(inv) => setDeleteConfirmInv(inv)}
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

      {/* Single Invoice Delete Confirmation Modal */}
      {deleteConfirmInv && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-700 max-w-sm w-full shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold mb-1.5 text-white">Hapus Invoice</h3>
            <p className="text-slate-400 text-xs mb-5 leading-relaxed">
              Apakah Anda yakin ingin menghapus invoice <strong className="text-white font-mono">{deleteConfirmInv.invoiceNumber}</strong> ({deleteConfirmInv.customerName})? Dokumen tagihan ini akan dihilangkan secara permanen.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button 
                type="button" 
                onClick={() => setDeleteConfirmInv(null)} 
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

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-700 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold mb-2 text-white">Hapus Semua Invoice</h3>
            <p className="text-slate-400 text-xs mb-6 leading-relaxed">Apakah Anda yakin ingin menghapus semua invoice? Tindakan ini tidak dapat dibatalkan.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer">Batal</button>
              <button onClick={handleConfirmDelete} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950 cursor-pointer">Hapus Semua</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/50 p-4 sm:p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-blue-400" />
            <span>Manajemen Invoice Tagihan</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Buat, kelola, cetak, edit rincian item, dan ekspor invoice tagihan resmi Mateha Production.</p>
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

          {selectedInvoices.length > 0 && (
            <button
              onClick={() => bulkExport(selectedInvoices, invoices)}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-950 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Bulk Export ({selectedInvoices.length})</span>
            </button>
          )}

          {invoices.length > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua</span>
            </button>
          )}
        </div>
      </div>

      {/* CREATE / EDIT FORM */}
      <div className={`p-6 rounded-2xl border shadow-xl space-y-6 transition ${
        editModeId 
          ? "bg-slate-900/90 border-blue-500/50 ring-1 ring-blue-500/30" 
          : "bg-slate-900/60 border-slate-800"
      }`}>
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${editModeId ? "bg-amber-400 animate-pulse" : "bg-blue-400"}`} />
            <div>
              <h2 className="text-base font-bold text-white">
                {editModeId ? "Mode Edit Invoice Tagihan" : "Buat Invoice Tagihan Baru"}
              </h2>
              {editModeId && (
                <p className="text-xs font-mono text-blue-400 font-semibold">{editingInvoiceNumber}</p>
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
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-blue-500 focus:outline-none"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <p className="text-[10px] text-slate-500 mt-1">Dicetak sebagai "Ditagihkan Kepada" (Nama Perusahaan / Instansi).</p>
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
            <label className="text-slate-400 font-semibold mb-1.5 block">Perihal / Deskripsi Tagihan</label>
            <input
              type="text"
              placeholder="Contoh: Tagihan Sewa Sound System & LED Screen"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-blue-500 focus:outline-none"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">No. Telepon / WhatsApp</label>
            <input
              type="text"
              placeholder="0812-xxxx-xxxx"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-blue-500 focus:outline-none"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">Kontak Person (Nama PIC Klien)</label>
            <input
              type="text"
              placeholder="Contoh: Ibu Rina / Bpk. Hendra"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-blue-500 focus:outline-none"
              value={customerContact}
              onChange={(e) => setCustomerContact(e.target.value)}
            />
            <p className="text-[10px] text-slate-500 mt-1">Dicetak sebagai "PIC" di faktur invoice.</p>
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">Tanggal Invoice</label>
            <input
              type="date"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-blue-500 focus:outline-none"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1.5 block">Jatuh Tempo (Opsional)</label>
            <input
              type="date"
              className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-white focus:border-blue-500 focus:outline-none"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        {/* Bank accounts select */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
            <label className="text-xs text-slate-400 font-semibold block">Pilih Rekening Pembayaran Resmi:</label>
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
                    ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
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
          <label className="text-xs text-slate-400 font-semibold mb-1.5 block">Syarat dan Ketentuan Pembayaran</label>
          <textarea
            className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none"
            value={termsAndConditions}
            onChange={(e) => setTermsAndConditions(e.target.value)}
            rows={2}
            placeholder="Instruksi transfer, batas waktu pelunasan, konfirmasi bukti bayar..."
          />
        </div>

        {/* Items Input & Manager */}
        <div className="bg-slate-950/70 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <span>Rincian Item Tagihan</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-blue-400 text-[11px] font-mono">
                {items.length} Item
              </span>
            </h3>
            <span className="hidden sm:inline text-[11px] text-slate-400">Deskripsi dapat diedit langsung per item</span>
          </div>
          
          {/* New Item Form */}
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Tambah Item Baru:</span>
            </div>

            <div className="space-y-3">
              <textarea
                placeholder="Nama item tagihan, mis. Sound System 7000 watt (rincian isi di Poin rincian)"
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none min-h-[68px]"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={2}
              />
              <LineItemFields draft={newItem} onChange={setNewItem} accent="blue" idPrefix="new-InvoiceView" />
              <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addItem}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-blue-950 cursor-pointer h-[38px]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah</span>
                  </button>
              </div>
            </div>
          </div>

          {/* Items List with Interactive Editing */}
          {items.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs italic bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
              Belum ada item tagihan. Masukkan deskripsi item dan harga di atas.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const isEditingThis = editingItemIndex === idx;

                if (isEditingThis) {
                  return (
                    <div
                      key={item.id || idx}
                      className="bg-slate-900 border-2 border-blue-500/70 p-4 rounded-xl shadow-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-400">Edit Rincian Item #{idx + 1}</span>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-400 font-semibold block">Deskripsi Isi Item:</label>
                        <textarea
                          className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-xs text-white focus:border-blue-400 focus:outline-none"
                          value={editItemDraft.description}
                          onChange={(e) => setEditItemDraft({ ...editItemDraft, description: e.target.value })}
                          rows={3}
                        />
                      </div>

                      <LineItemFields draft={editItemDraft} onChange={setEditItemDraft} accent="blue" idPrefix="edit-InvoiceView" />

                      <div className="flex items-center justify-end gap-2 pt-1">
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
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-950 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Simpan Item
                          </button>
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
                          <strong className="text-slate-300">{formatQty(item.qty, item.unit)}</strong>{((item.days || 1) > 1 || item.timeUnit) && <> × <strong className="text-slate-300">{formatTime(item.days, item.timeUnit)}</strong></>} @ <span className="font-mono">{formatRupiah(item.price)}</span>
                          {(item.subItems?.length ?? 0) > 0 && <span className="text-slate-500"> = {formatRupiah(mainAmount(item))}</span>}
                        </div>
                        {(item.subItems || []).map((sub) => (
                          <div key={sub.id} className="flex justify-between gap-3 pl-3 text-[11px] text-slate-400 border-l border-slate-700">
                            <span>{sub.description} <span className="text-slate-500">({formatQty(sub.qty, sub.unit)})</span></span>
                            {subItemAmount(sub) > 0 && <span className="font-mono text-amber-300 shrink-0">+ {formatRupiah(subItemAmount(sub))}</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                      <span className="font-bold text-blue-400 font-mono text-sm">
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
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-blue-500/20 text-slate-300 hover:text-blue-300 text-xs font-semibold transition cursor-pointer border border-slate-700"
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

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 py-3 bg-slate-900/95 rounded-xl border border-slate-700/80 mt-3 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    {isDp ? "TOTAL YANG DITAGIHKAN (DP):" : "TOTAL TAGIHAN:"}
                  </span>
                  {isDp && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                      DP {dpMode === "percentage" ? `${dpPercent}%` : `${grandTotalAll > 0 ? ((dpAmountManual / grandTotalAll) * 100).toFixed(1) : 0}%`}
                    </span>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-base font-extrabold text-blue-400 font-mono">
                    {formatRupiah(isDp ? (dpMode === "percentage" ? Math.round((grandTotalAll * (dpPercent || 50)) / 100) : Math.min(grandTotalAll, dpAmountManual || 0)) : grandTotalAll)}
                  </span>
                  {isDp && (
                    <p className="text-[10px] text-slate-400 font-mono">
                      Total Kontrak: {formatRupiah(grandTotalAll)} • Sisa: {formatRupiah(Math.max(0, grandTotalAll - (dpMode === "percentage" ? Math.round((grandTotalAll * (dpPercent || 50)) / 100) : Math.min(grandTotalAll, dpAmountManual || 0))))}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PENGATURAN INVOICE UANG MUKA / DP */}
        <div className="bg-slate-950/70 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-800/50 text-amber-400">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Pengaturan Uang Muka / Invoice DP (Down Payment)
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                    Fitur DP
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Terbitkan invoice DP dengan kalkulasi otomatis persentase (%) atau input manual oleh pengguna (Rp)
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer self-start sm:self-auto">
              <input
                type="checkbox"
                checked={isDp}
                onChange={(e) => {
                  const val = e.target.checked;
                  setIsDp(val);
                  if (val && dpAmountManual === 0 && grandTotalAll > 0) {
                    setDpAmountManual(Math.round((grandTotalAll * (dpPercent || 50)) / 100));
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
              <span className="ml-2.5 text-xs font-semibold text-slate-300">
                {isDp ? "Invoice DP Aktif" : "Bukan DP (Tagihan Penuh)"}
              </span>
            </label>
          </div>

          {isDp && (
            <div className="bg-slate-900/80 p-4 rounded-xl border border-amber-900/40 space-y-4">
              {/* Pilihan Metode: Auto (%) vs By User / Manual (Rp) */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-300">Metode Penentuan Nilai DP:</span>
                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setDpMode("percentage")}
                    className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      dpMode === "percentage"
                        ? "bg-amber-600 text-white shadow-md shadow-amber-950"
                        : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>Hitung Auto (%)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDpMode("nominal");
                      if (!dpAmountManual && grandTotalAll > 0) {
                        setDpAmountManual(Math.round((grandTotalAll * (dpPercent || 50)) / 100));
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      dpMode === "nominal"
                        ? "bg-amber-600 text-white shadow-md shadow-amber-950"
                        : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>By User (Nominal Rp)</span>
                  </button>
                </div>
              </div>

              {/* Mode Auto: Persentase */}
              {dpMode === "percentage" ? (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Pilih Persentase Cepat atau Ketik %:
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[20, 30, 40, 50, 70].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            setDpPercent(pct);
                            setDpAmountManual(Math.round((grandTotalAll * pct) / 100));
                          }}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition cursor-pointer ${
                            dpPercent === pct
                              ? "bg-amber-500 text-slate-950 ring-2 ring-amber-400"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-[200px]">
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={dpPercent || ""}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(99, Number(e.target.value) || 0));
                          setDpPercent(val);
                          setDpAmountManual(Math.round((grandTotalAll * val) / 100));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500 pr-8"
                        placeholder="50"
                      />
                      <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Otomatis dihitung: <strong className="text-amber-400 font-mono">{formatRupiah(Math.round((grandTotalAll * (dpPercent || 50)) / 100))}</strong>
                    </p>
                  </div>
                </div>
              ) : (
                /* Mode By User: Nominal Manual */
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Ketik Nominal DP Bebas (Rupiah):
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[25, 50, 75].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            const amt = Math.round((grandTotalAll * pct) / 100);
                            setDpAmountManual(amt);
                            setDpPercent(pct);
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        >
                          Set {pct}% ({formatRupiah(Math.round((grandTotalAll * pct) / 100))})
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-500 font-mono">Rp</span>
                      <input
                        type="number"
                        min="0"
                        max={grandTotalAll}
                        value={dpAmountManual || ""}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setDpAmountManual(val);
                          if (grandTotalAll > 0) {
                            setDpPercent(Number(((val / grandTotalAll) * 100).toFixed(1)));
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                        placeholder="Contoh: 5000000"
                      />
                    </div>
                    <div className="bg-slate-950/80 px-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-center justify-between sm:justify-start gap-2">
                      <span>Setara:</span>
                      <strong className="text-amber-400 font-mono">
                        {grandTotalAll > 0 ? ((dpAmountManual / grandTotalAll) * 100).toFixed(1) : 0}% dari total
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Rangkuman Live Perhitungan DP */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Nilai Kontrak / Item</p>
                  <p className="text-sm font-extrabold text-white font-mono mt-0.5">{formatRupiah(grandTotalAll)}</p>
                </div>
                <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-800/60">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-amber-300 uppercase font-bold">Tagihan DP Faktur Ini</p>
                    <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 px-1.5 rounded">
                      {dpMode === "percentage" ? `${dpPercent}%` : `${grandTotalAll > 0 ? ((dpAmountManual / grandTotalAll) * 100).toFixed(1) : 0}%`}
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-amber-400 font-mono mt-0.5">
                    {formatRupiah(dpMode === "percentage" ? Math.round((grandTotalAll * (dpPercent || 50)) / 100) : Math.min(grandTotalAll, dpAmountManual || 0))}
                  </p>
                </div>
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Sisa Pelunasan Nanti</p>
                  <p className="text-sm font-extrabold text-slate-300 font-mono mt-0.5">
                    {formatRupiah(Math.max(0, grandTotalAll - (dpMode === "percentage" ? Math.round((grandTotalAll * (dpPercent || 50)) / 100) : Math.min(grandTotalAll, dpAmountManual || 0))))}
                  </p>
                </div>
              </div>

              {/* Bantuan Otomasi Teks */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400">Bantuan Teks Otomatis:</span>
                <button
                  type="button"
                  onClick={() => {
                    const currentDpAmt = dpMode === "percentage" ? Math.round((grandTotalAll * (dpPercent || 50)) / 100) : Math.min(grandTotalAll, dpAmountManual || 0);
                    const currentRemaining = Math.max(0, grandTotalAll - currentDpAmt);
                    const currentPct = dpMode === "percentage" ? dpPercent : (grandTotalAll > 0 ? ((currentDpAmt / grandTotalAll) * 100).toFixed(0) : 0);
                    setTermsAndConditions(
                      `Pembayaran Uang Muka (DP ${currentPct}%) sebesar ${formatRupiah(currentDpAmt)} wajib dibayarkan selambat-lambatnya sesuai tanggal jatuh tempo. Sisa pelunasan sebesar ${formatRupiah(currentRemaining)} dibayarkan selambat-lambatnya pada saat H-1 acara.`
                    );
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold transition cursor-pointer border border-slate-700"
                >
                  Salin Syarat Pembayaran DP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentPct = dpMode === "percentage" ? dpPercent : (grandTotalAll > 0 ? Math.round((dpAmountManual / grandTotalAll) * 100) : 0);
                    const cleanSubj = subject.replace(/^Tagihan Uang Muka \(DP [^)]+\) - /, "").replace(/^Tagihan Uang Muka \(DP\) - /, "");
                    setSubject(`Tagihan Uang Muka (DP ${currentPct}%) - ${cleanSubj || "Layanan Event"}`);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold transition cursor-pointer border border-slate-700"
                >
                  Set Subjek: Tagihan Uang Muka (DP)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PENGATURAN APPROVAL KLIEN */}
        <div className="bg-slate-950/70 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-950/60 border border-blue-800/50 text-blue-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Approval / Lembar Pengesahan Klien
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tampilkan kolom tanda tangan persetujuan / tanda terima klien di invoice
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
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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
                    className="text-[11px] text-blue-400 hover:text-blue-300 bg-blue-950/60 border border-blue-800/60 hover:border-blue-700 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
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
                    className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none"
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
                    placeholder="Contoh: Finance Manager / Penanggung Jawab Acara / Klien"
                    value={clientApprovalTitle}
                    onChange={(e) => setClientApprovalTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Ditampilkan di bawah nama penandatangan klien.
                  </p>
                </div>
              </div>

              <div className="bg-blue-950/30 border border-blue-900/40 rounded-lg p-2.5 flex items-center gap-2 text-[11px] text-blue-300">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Kolom pengesahan klien akan tercetak berdampingan dengan tanda tangan Mateha Production di lembar invoice.
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
            onClick={saveInvoice}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-6 py-2.5 rounded-xl font-bold text-xs text-white transition shadow-lg shadow-emerald-950 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{editModeId ? "Simpan Perubahan Invoice" : "Terbitkan Invoice"}</span>
          </button>
        </div>
      </div>

      {/* LIST OF INVOICES */}
      <div className="bg-slate-900/50 p-4 sm:p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>Daftar Dokumen Tagihan</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs font-mono">{invoices.length}</span>
          </h2>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari no. invoice / klien..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 pl-8 pr-3 py-2 rounded-xl text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
            Tidak ada invoice yang ditemukan.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredInvoices.map((inv) => {
              const isDownloading = downloadingId === inv.id;
              const isSelected = selectedInvoices.includes(inv.id);

              return (
                <div
                  key={inv.id}
                  className={`flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border transition gap-3 ${
                    isSelected ? "bg-slate-900 border-blue-500/60" : "bg-slate-950/80 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedInvoices(prev => prev.includes(inv.id) ? prev.filter(i => i !== inv.id) : [...prev, inv.id]);
                      }}
                      className="rounded border-slate-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />

                    <div className="flex-1 cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-white text-sm">{inv.invoiceNumber}</span>
                        <span className="text-slate-400">•</span>
                        <span className="font-semibold text-blue-300 text-sm">{inv.customerName}</span>
                        {inv.isDp && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide bg-amber-500/25 text-amber-300 border border-amber-500/40 font-mono">
                            DP {inv.dpPercent ? `(${inv.dpPercent}%)` : ''}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                          inv.status === "paid" 
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                            : inv.status === "sent"
                            ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}>
                          {inv.status === "paid" ? "Lunas" : inv.status === "sent" ? "Terkirim" : "Draft"}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span>Tanggal: {inv.date}</span>
                        {inv.subject && <span>| {inv.subject}</span>}
                        {inv.isDp ? (
                          <>
                            <span>| Tagihan DP: <strong className="text-amber-300 font-mono">{formatRupiah(inv.grandTotal)}</strong></span>
                            {inv.totalAmount && <span>| Kontrak: <strong className="text-slate-300 font-mono">{formatRupiah(inv.totalAmount)}</strong></span>}
                            {inv.remainingAmount !== undefined && <span>| Sisa: <strong className="text-slate-400 font-mono">{formatRupiah(inv.remainingAmount)}</strong></span>}
                          </>
                        ) : (
                          <span>| Total: <strong className="text-slate-200 font-mono">{formatRupiah(inv.grandTotal)}</strong></span>
                        )}
                        {inv.dueDate && <span className="text-rose-400">| Jatuh Tempo: {inv.dueDate}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                    {inv.status === "draft" && (
                      <button
                        onClick={() => updateInvoiceStatus(inv.id, "sent")}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-700/60 text-sky-300 text-xs font-semibold transition cursor-pointer"
                        title="Tandai Terkirim"
                      >
                        Kirim
                      </button>
                    )}
                    {inv.status !== "paid" && (
                      <button
                        onClick={() => updateInvoiceStatus(inv.id, "paid")}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-xs font-bold transition cursor-pointer"
                        title="Tandai Lunas"
                      >
                        Set Lunas
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                      title="Lihat Pratinjau"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat</span>
                    </button>

                    <button
                      onClick={() => downloadPdfDirect(inv)}
                      disabled={isDownloading}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 text-blue-300 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                      title="Unduh PDF"
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

                    <button
                      onClick={() => editInvoice(inv)}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                      title="Edit Dokumen Invoice"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSingle(inv);
                      }}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 border border-slate-800 hover:border-rose-700 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                      title="Hapus Invoice"
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
