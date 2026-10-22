import React, { useState, useEffect } from "react";
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  query, 
  orderBy, 
  deleteDoc, 
  updateDoc 
} from "../lib/firestore";
import { db, sanitizeForFirestore } from "../utils/backend";
import { Kwitansi, Invoice, formatRupiah, Bank, Client } from "../types";
import KwitansiPreview from "./KwitansiPreview";
import BankManagementModal from "./BankManagementModal";
import ClientManagement from "./ClientManagement";
import ClientSelector from "./ClientSelector";
import { resolveClientDetails } from "../utils/clientHelper";
import { generateKwitansiItemPdfBlob } from "../utils/pdfGenerator";
import { saveAs } from "file-saver";
import { terbilang } from "../utils/numberToWords";
import { notify } from "../utils/notification";
import { 
  Receipt, 
  Plus, 
  FileText, 
  Download, 
  Eye, 
  Trash2, 
  CheckCircle2, 
  Search, 
  Save, 
  Sparkles,
  CreditCard, 
  User, 
  Calendar, 
  DollarSign,
  Building2,
  Users,
  Banknote,
  Edit2
} from "lucide-react";

interface KwitansiViewProps {
  onNotify?: (text: string, type?: "success" | "error" | "warning" | "info", title?: string) => void;
}

export default function KwitansiView({ onNotify }: KwitansiViewProps = {}) {
  const [kwitansiList, setKwitansiList] = useState<Kwitansi[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedKwitansi, setSelectedKwitansi] = useState<Kwitansi | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteConfirmId, setShowDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modals state
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  // Form states
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [paymentFor, setPaymentFor] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  
  // Payment Method Selection: 'cash' | 'transfer' | 'custom'
  const [paymentType, setPaymentType] = useState<"cash" | "transfer" | "custom">("transfer");
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [customPaymentMethod, setCustomPaymentMethod] = useState("");

  const [receiverName, setReceiverName] = useState("Dhifa Aksa Hermawan");
  const [receiverTitle, setReceiverTitle] = useState("CEO Mateha Production");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [saveToClientDb, setSaveToClientDb] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Load Kwitansi, Invoices, Banks & Clients from Firestore
  useEffect(() => {
    const qKwt = query(collection(db, "kwitansi"), orderBy("createdAt", "desc"));
    const unsubKwt = onSnapshot(qKwt, (snapshot) => {
      const list: Kwitansi[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Kwitansi);
      });
      setKwitansiList(list);
    });

    const qInv = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      const invs: Invoice[] = [];
      snapshot.forEach((doc) => {
        invs.push({ id: doc.id, ...doc.data() } as Invoice);
      });
      setInvoices(invs);
    });

    const qBanks = collection(db, "banks");
    const unsubBanks = onSnapshot(qBanks, (snapshot) => {
      const bks: Bank[] = [];
      snapshot.forEach((doc) => {
        bks.push({ id: doc.id, ...doc.data() } as Bank);
      });
      setBanks(bks);
      if (bks.length > 0 && !selectedBankId) {
        const def = bks.find(b => b.isDefault) || bks[0];
        setSelectedBankId(def.id);
      }
    });

    const qClients = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      const cls: Client[] = [];
      snapshot.forEach((doc) => {
        cls.push({ id: doc.id, ...doc.data() } as Client);
      });
      setClients(cls);
    });

    return () => {
      unsubKwt();
      unsubInv();
      unsubBanks();
      unsubClients();
    };
  }, []);

  const triggerNotification = (msg: string, type: "success" | "error" | "info" = "success") => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
    if (onNotify) {
      onNotify(msg, type, type === "error" ? "Gagal" : "Kwitansi");
    } else {
      notify[type === "error" ? "error" : "success"](msg, type === "error" ? "Gagal" : "Kwitansi");
    }
  };

  // Generate sequential Kwitansi Number
  const generateKwitansiNumber = () => {
    const d = new Date(date);
    const yyyy = !isNaN(d.getFullYear()) ? d.getFullYear() : new Date().getFullYear();
    const mm = String(!isNaN(d.getMonth()) ? d.getMonth() + 1 : new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `KWT/MATEHA/${yyyy}/${mm}/`;

    const relevant = kwitansiList.filter(k => k.kwitansiNumber && k.kwitansiNumber.startsWith(prefix));
    let nextSeq = 1;
    if (relevant.length > 0) {
      const sequences = relevant.map(k => {
        const parts = k.kwitansiNumber.split('/');
        return parseInt(parts[parts.length - 1], 10) || 0;
      });
      nextSeq = Math.max(...sequences) + 1;
    }
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  };

  // Autofill from chosen Client
  const handleSelectClient = (client: Client) => {
    const details = resolveClientDetails(client);
    const displayName = details.company && details.pic && details.company !== details.pic
      ? `${details.company} (PIC: ${details.pic})`
      : (details.company || details.pic);
    setCustomerName(displayName);
    triggerNotification(`Data klien "${displayName}" berhasil dipilih.`);
  };

  // Autofill from chosen Invoice
  const handleSelectInvoice = (invId: string) => {
    setSelectedInvoiceId(invId);
    if (!invId) return;

    const inv = invoices.find(i => i.id === invId);
    if (inv) {
      setCustomerName(inv.customerName);
      setAmount(inv.grandTotal);
      setPaymentFor(inv.subject || `Pelunasan Invoice No. ${inv.invoiceNumber}`);
      if (inv.date) setDate(inv.date);
      triggerNotification(`Data otomatis disalin dari Invoice ${inv.invoiceNumber}`);
    }
  };

  // Computed payment method string
  const getComputedPaymentMethod = () => {
    if (paymentType === "cash") {
      return "Tunai / Cash";
    }
    if (paymentType === "transfer") {
      const bank = banks.find(b => b.id === selectedBankId);
      if (bank) {
        return `Transfer ${bank.name} (${bank.accountNumber} a.n ${bank.accountHolder})`;
      }
      return "Transfer Bank";
    }
    return customPaymentMethod.trim() || "Transfer Bank";
  };

  const handleSaveKwitansi = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof amount === "number" ? amount : parseFloat(amount as string) || 0;

    if (!customerName.trim() || numAmount <= 0 || !paymentFor.trim()) {
      triggerNotification("Harap lengkapi nama customer, nominal uang, dan perihal pembayaran!");
      return;
    }

    setSaving(true);
    try {
      const id = Date.now().toString();
      const kwitansiNumber = generateKwitansiNumber();
      const terbilangText = terbilang(numAmount);
      const computedPaymentMethod = getComputedPaymentMethod();

      // If requested, save new client to client database if not already existing
      if (saveToClientDb && customerName.trim()) {
        const clientExists = clients.some(c => c.name.toLowerCase() === customerName.trim().toLowerCase());
        if (!clientExists) {
          const clientId = "client_" + Date.now();
          await setDoc(doc(db, "clients", clientId), sanitizeForFirestore({
            id: clientId,
            name: customerName.trim(),
            createdAt: new Date().toISOString(),
          }));
        }
      }

      const newKwitansi: Partial<Kwitansi> = {
        id,
        kwitansiNumber,
        customerName: customerName.trim(),
        amount: numAmount,
        terbilangText,
        paymentFor: paymentFor.trim(),
        date,
        paymentMethod: computedPaymentMethod,
        receiverName: receiverName.trim() || "Dhifa Aksa Hermawan",
        receiverTitle: receiverTitle.trim() || "CEO Mateha Production",
        createdAt: new Date().toISOString(),
      };

      if (selectedInvoiceId) {
        newKwitansi.invoiceId = selectedInvoiceId;
        const invObj = invoices.find(i => i.id === selectedInvoiceId);
        if (invObj?.invoiceNumber) {
          newKwitansi.invoiceNumber = invObj.invoiceNumber;
        }
      }

      await setDoc(doc(db, "kwitansi", id), sanitizeForFirestore(newKwitansi));

      // If associated with invoice, mark invoice as paid if not already
      if (selectedInvoiceId) {
        await updateDoc(doc(db, "invoices", selectedInvoiceId), { status: "paid" });
      }

      // Reset form
      setCustomerName("");
      setAmount("");
      setPaymentFor("");
      setSelectedInvoiceId("");
      setSaveToClientDb(false);
      setDate(new Date().toISOString().split("T")[0]);

      triggerNotification(`Kwitansi resmi ${kwitansiNumber} berhasil diterbitkan!`, "success");
    } catch (err: any) {
      console.error(err);
      triggerNotification("Gagal menyimpan kwitansi: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKwitansi = async (id: string) => {
    try {
      await deleteDoc(doc(db, "kwitansi", id));
      setShowDeleteConfirmId(null);
      triggerNotification("Kwitansi berhasil dihapus.", "success");
    } catch (err: any) {
      console.error(err);
      triggerNotification("Gagal menghapus kwitansi: " + err.message, "error");
    }
  };

  const handleExportPdf = async (kwt: Kwitansi) => {
    try {
      const blob = await generateKwitansiItemPdfBlob(kwt);
      saveAs(blob, `Kwitansi_${kwt.kwitansiNumber.replace(/\//g, '_')}.pdf`);
      triggerNotification(`Mengunduh PDF ${kwt.kwitansiNumber}...`);
    } catch (err: any) {
      console.error(err);
      triggerNotification("Gagal mengunduh PDF: " + err.message);
    }
  };

  const currentNumberPreview = generateKwitansiNumber();
  const currentNumericAmount = typeof amount === "number" ? amount : (parseFloat(amount as string) || 0);
  const currentTerbilang = currentNumericAmount > 0 ? terbilang(currentNumericAmount) + " Rupiah" : "-";

  const filteredKwitansi = kwitansiList.filter(k => 
    k.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.kwitansiNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.paymentFor.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="text-white space-y-6 max-w-5xl mx-auto text-left">
      
      {/* Kwitansi Preview Modal */}
      {selectedKwitansi && (
        <KwitansiPreview 
          kwitansi={selectedKwitansi} 
          onClose={() => setSelectedKwitansi(null)} 
        />
      )}

      {/* Bank Management Modal */}
      <BankManagementModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        banks={banks}
        onSelectBank={(b) => {
          setSelectedBankId(b.id);
          setPaymentType("transfer");
        }}
      />

      {/* Client Management Modal */}
      <ClientManagement
        isModal={true}
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onSelectClient={handleSelectClient}
      />

      {/* Floating Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-cyan-500 text-slate-950 px-4 py-2.5 rounded-xl font-bold shadow-2xl flex items-center space-x-2 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-[#0c0e12]/80 border border-slate-800/80 p-5 sm:p-6 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center space-x-2">
              <span>Manajemen & Input Kwitansi Pembayaran</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Terbitkan tanda terima bukti pembayaran resmi berstempel dan tanda tangan Mateha Production.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Bank Database Button */}
          <button
            type="button"
            onClick={() => setIsBankModalOpen(true)}
            className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
            title="Kelola daftar rekening bank transfer resmi"
          >
            <Building2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Database Bank ({banks.length})</span>
          </button>

          {/* Quick Client Database Button */}
          <button
            type="button"
            onClick={() => setIsClientModalOpen(true)}
            className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
            title="Kelola daftar database klien untuk repeat order"
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>Database Klien ({clients.length})</span>
          </button>
        </div>
      </div>

      {/* INPUT FORM: BUAT KWITANSI BARU */}
      <div className="bg-[#0c0e12]/60 border border-slate-800/90 p-5 sm:p-6 rounded-3xl shadow-xl relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-slate-800/80 gap-3">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-extrabold text-white uppercase tracking-wider font-mono">
              Input Lembar Kwitansi Baru
            </h2>
          </div>
          <div className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 py-1 px-2.5 rounded-lg self-start sm:self-auto">
            Nomor: <strong className="text-white">{currentNumberPreview}</strong>
          </div>
        </div>

        {/* Quick autofill from existing invoices */}
        {invoices.length > 0 && (
          <div className="mb-5 bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 text-slate-300">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Otomatis salin rincian dari Invoice yang sudah dibuat:</span>
            </div>
            <select
              value={selectedInvoiceId}
              onChange={(e) => handleSelectInvoice(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 text-cyan-300 font-semibold py-1.5 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-xs cursor-pointer max-w-xs"
            >
              <option value="">-- Pilih Invoice Terkait (Opsional) --</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} - {inv.customerName} ({formatRupiah(inv.grandTotal)}) [{inv.status.toUpperCase()}]
                </option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleSaveKwitansi} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer name & Client Selector */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mb-1">
                <label className="whitespace-nowrap block text-slate-400 font-bold uppercase tracking-wider text-[10px] font-mono">
                  1. Telah Terima Dari (Nama Klien / Perusahaan) *
                </label>
                <ClientSelector
                  clients={clients}
                  onSelectClient={handleSelectClient}
                  onOpenClientManager={() => setIsClientModalOpen(true)}
                  selectedClientName={customerName}
                />
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT Astra International / Ibu Maya Sari"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-slate-100 font-sans focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
              {customerName && !clients.some(c => c.name.toLowerCase() === customerName.toLowerCase()) && (
                <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-cyan-400/90 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveToClientDb}
                    onChange={(e) => setSaveToClientDb(e.target.checked)}
                    className="rounded border-slate-750 text-cyan-500 focus:ring-0 w-3.5 h-3.5 bg-slate-900"
                  />
                  <span>Simpan "{customerName}" ke Database Klien untuk pesanan berikutnya</span>
                </label>
              )}
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[10px] font-mono">
                2. Jumlah Uang Pembayaran (Rp) *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <DollarSign className="w-4 h-4" />
                </span>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="Contoh: 15000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
            </div>
          </div>

          {/* Terbilang Live Box */}
          <div className="bg-emerald-950/20 border border-emerald-500/20 p-3 rounded-2xl flex items-center space-x-2 text-xs">
            <span className="text-slate-400 uppercase font-mono text-[10px] font-bold shrink-0">Terbilang:</span>
            <span className="font-semibold text-emerald-300 italic truncate">
              # {currentTerbilang} #
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[10px] font-mono">
                3. Untuk Pembayaran (Perihal / Rincian Acara) *
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Pelunasan Jasa EO & Sound System Event BCA Gathering 2026"
                value={paymentFor}
                onChange={(e) => setPaymentFor(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-slate-100 font-sans focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[10px] font-mono">
                4. Tanggal Kwitansi *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Calendar className="w-4 h-4" />
                </span>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-slate-100 font-sans focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
            </div>
          </div>

          {/* 5. METODE PEMBAYARAN: CASH ATAU REKENING BANK DARI DATABASE */}
          <div className="bg-slate-950/90 border border-slate-800/90 p-4 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-slate-300 font-bold uppercase tracking-wider text-[10px] font-mono flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                <span>5. Metode Pembayaran & Rekening Tujuan</span>
              </label>

              <button
                type="button"
                onClick={() => setIsBankModalOpen(true)}
                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>+ Tambah / Kelola Bank</span>
              </button>
            </div>

            {/* Selection Buttons: Tunai / Cash vs Transfer Bank vs Custom */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Option 1: Cash */}
              <button
                type="button"
                onClick={() => setPaymentType("cash")}
                className={`p-3 rounded-xl border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                  paymentType === "cash"
                    ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold">💵 Tunai / Cash</p>
                  <p className="text-[10px] text-slate-400 font-normal">Diterima langsung tunai</p>
                </div>
              </button>

              {/* Option 2: Transfer Bank */}
              <button
                type="button"
                onClick={() => setPaymentType("transfer")}
                className={`p-3 rounded-xl border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                  paymentType === "transfer"
                    ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold">🏦 Transfer Bank</p>
                  <p className="text-[10px] text-slate-400 font-normal">Pilih dari Database Bank</p>
                </div>
              </button>

              {/* Option 3: Custom */}
              <button
                type="button"
                onClick={() => setPaymentType("custom")}
                className={`p-3 rounded-xl border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                  paymentType === "custom"
                    ? "bg-purple-500/15 border-purple-500/50 text-purple-300 font-bold"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <CreditCard className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold">✏️ Kustom / Lainnya</p>
                  <p className="text-[10px] text-slate-400 font-normal">QRIS, Cek, Giro, dll</p>
                </div>
              </button>
            </div>

            {/* Transfer Bank Detail Selector */}
            {paymentType === "transfer" && (
              <div className="pt-2 space-y-2">
                <label className="text-[11px] text-slate-400 font-semibold block">
                  Pilih Rekening Bank Penerima:
                </label>
                {banks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {banks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBankId(b.id)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          selectedBankId === b.id
                            ? "bg-cyan-500/20 border-cyan-500/60 text-cyan-200 shadow-sm"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white">{b.name}</span>
                          {b.isDefault && (
                            <span className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-mono">
                              Utama
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono font-bold text-cyan-300 mt-0.5">{b.accountNumber}</p>
                        <p className="text-[10px] text-slate-400">a.n {b.accountHolder}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-900 border border-dashed border-slate-800 rounded-xl text-center space-y-2">
                    <p className="text-xs text-slate-400">Belum ada rekening bank yang didaftarkan.</p>
                    <button
                      type="button"
                      onClick={() => setIsBankModalOpen(true)}
                      className="px-3 py-1.5 bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-cyan-400 transition cursor-pointer"
                    >
                      + Buka Database Bank & Tambah Rekening
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Custom Payment text */}
            {paymentType === "custom" && (
              <div className="pt-2">
                <input
                  type="text"
                  placeholder="Contoh: QRIS BCA / Cek Giro Bank BNI No. 8839"
                  value={customPaymentMethod}
                  onChange={(e) => setCustomPaymentMethod(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 px-3.5 py-2.5 rounded-xl text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            )}

            <div className="pt-1 text-[11px] text-slate-400 bg-slate-900/50 p-2.5 rounded-xl font-mono">
              <span className="text-slate-500 font-bold uppercase text-[9px] block">Akan tercetak di Kwitansi:</span>
              <span className="text-cyan-300 font-semibold">{getComputedPaymentMethod()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[10px] font-mono">
                6. Nama Penandatangan (Penerima)
              </label>
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="Dhifa Aksa Hermawan"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-slate-100 font-sans focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[10px] font-mono">
                7. Jabatan Penerima
              </label>
              <input
                type="text"
                value={receiverTitle}
                onChange={(e) => setReceiverTitle(e.target.value)}
                placeholder="CEO Mateha Production"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-3 text-slate-100 font-sans focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-2.5 px-6 rounded-xl transition shadow-lg flex items-center space-x-2 text-xs uppercase tracking-wide cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Menerbitkan..." : "Terbitkan Kwitansi Resmi"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* DAFTAR KWITANSI TERBIT */}
      <div className="bg-[#0c0e12]/60 border border-slate-800/80 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 bg-[#0f1115]/80 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Riwayat Kwitansi Terbit ({filteredKwitansi.length})
            </h3>
          </div>

          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Cari kwitansi / klien..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-800/60">
          {filteredKwitansi.map((kwt) => (
            <div key={kwt.id} className="p-4 sm:p-5 hover:bg-slate-900/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-cyan-400 text-xs">{kwt.kwitansiNumber}</span>
                  {kwt.invoiceNumber && (
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                      Ref: {kwt.invoiceNumber}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(kwt.date).toLocaleDateString("id-ID")}
                  </span>
                </div>
                <h4 className="font-bold text-white text-sm">{kwt.customerName}</h4>
                <p className="text-xs text-slate-400">{kwt.paymentFor}</p>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] text-slate-400 font-mono">Metode: {kwt.paymentMethod || 'Transfer Bank'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end space-x-4">
                <div className="text-left sm:text-right">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Jumlah Uang</span>
                  <span className="text-base font-extrabold text-emerald-400 font-mono">
                    {formatRupiah(kwt.amount)}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setSelectedKwitansi(kwt)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer"
                    title="Pratinjau Kwitansi"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleExportPdf(kwt)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-slate-800 transition cursor-pointer"
                    title="Unduh PDF Kwitansi"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setShowDeleteConfirmId(kwt.id)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 border border-slate-800 transition cursor-pointer"
                    title="Hapus Kwitansi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Confirm Delete Popup */}
              {showDeleteConfirmId === kwt.id && (
                <div className="w-full bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl flex items-center justify-between text-xs text-rose-300 mt-2">
                  <span>Yakin ingin menghapus kwitansi <strong>{kwt.kwitansiNumber}</strong>?</span>
                  <div className="space-x-2">
                    <button
                      onClick={() => handleDeleteKwitansi(kwt.id)}
                      className="px-2.5 py-1 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition cursor-pointer"
                    >
                      Hapus
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirmId(null)}
                      className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {filteredKwitansi.length === 0 && (
            <div className="p-10 text-center text-slate-500 text-xs">
              Tidak ada kwitansi yang sesuai dengan pencarian.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
