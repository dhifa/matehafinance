import React, { useState, useEffect } from "react";
import { ProjectBudget, BudgetItem, SharingRatio, StaffRolePreset, formatRupiah, UserProfile } from "../types";
import { calculateProjectBudget } from "../utils/math";
import { Trash2, Plus, Copy, RotateCcw, RotateCw, Layers, Share2, Check, Lock, Unlock, Sparkles, Camera, ImageIcon, X, Eye } from "lucide-react";
import { db } from "../utils/firebase";
import { collection, onSnapshot, doc } from "firebase/firestore";
import ReceiptScannerModal from "./ReceiptScannerModal";

interface EditableBudgetTableProps {
  title: string;
  theme: "green" | "red";
  budget: ProjectBudget;
  projectMetadata: { name: string; date: string; location: string };
  onChange: (updatedBudget: ProjectBudget) => void;
  onCopyFromRAB?: () => void; // Provided on Realisasi side to copy whole RAB setup
  onSharePointB?: () => void; // Provided on Section B sharing link
  onSave?: () => void; // Added for explicit save
  userRole?: "admin" | "staff";
  staffPresets?: StaffRolePreset[];
  isPointBClosed?: boolean;
  onTogglePointB?: () => void;
  isGuestView?: boolean;
}

export default function EditableBudgetTable({
  title,
  theme,
  budget,
  projectMetadata,
  onChange,
  onCopyFromRAB,
  onSharePointB,
  onSave,
  userRole = "admin",
  staffPresets = [],
  isPointBClosed = false,
  onTogglePointB,
  isGuestView = false,
}: EditableBudgetTableProps) {
  // Normalize budget input to satisfy legacy Firestore schema structures
  const rawSharing = budget?.sharingRatio;
  const safeSharingRatio = {
    mateha: (rawSharing && rawSharing.mateha !== undefined && rawSharing.mateha !== null) ? Number(rawSharing.mateha) : 25,
    staff: (rawSharing && rawSharing.staff !== undefined && rawSharing.staff !== null) ? Number(rawSharing.staff) : 70,
    investor: (rawSharing && rawSharing.investor !== undefined && rawSharing.investor !== null) ? Number(rawSharing.investor) : 5,
  };

  const safeBudget: ProjectBudget = {
    income: budget?.income || [],
    accommodation: budget?.accommodation || [],
    sharingRatio: safeSharingRatio,
    feeDistribution: budget?.feeDistribution || [],
    picBonusRatio: budget?.picBonusRatio !== undefined ? budget?.picBonusRatio : 5,
    picBonusStaff: budget?.picBonusStaff || "",
  };

  const calc = calculateProjectBudget(safeBudget);

  // States for Undo/Redo tracking
  const [history, setHistory] = useState<ProjectBudget[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const lastPushTimeRef = React.useRef<number>(0);

  // Initialize and synchronize local history stack with parent database value
  useEffect(() => {
    const budgetStr = JSON.stringify(safeBudget);
    
    if (history.length === 0) {
      setHistory([safeBudget]);
      setHistoryIndex(0);
      return;
    }

    const currentInHistoryStr = JSON.stringify(history[historyIndex]);
    if (currentInHistoryStr !== budgetStr) {
      const cleanHistory = history.slice(0, historyIndex + 1);
      const updated = [...cleanHistory, safeBudget];
      if (updated.length > 50) updated.shift();
      setHistory(updated);
      setHistoryIndex(updated.length - 1);
    }
  }, [budget]);

  // Command handler to track changes with intelligent debouncing/collapsing
  const updateBudget = (newBudget: ProjectBudget, forceNewState: boolean = false) => {
    const now = Date.now();
    const isQuickFollowup = !forceNewState && (now - lastPushTimeRef.current < 1200);
    lastPushTimeRef.current = now;

    let updatedHistory;
    if (isQuickFollowup && historyIndex > 0) {
      updatedHistory = [...history];
      updatedHistory[historyIndex] = newBudget;
    } else {
      const cleanHistory = history.slice(0, historyIndex + 1);
      updatedHistory = [...cleanHistory, newBudget];
      if (updatedHistory.length > 50) {
        updatedHistory.shift();
      }
    }

    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
    onChange(newBudget);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      onChange(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      onChange(history[nextIndex]);
    }
  };

  // States for live registered staff list and notes inline picker
  const [dbUsers, setDbUsers] = useState<UserProfile[]>([]);
  const [dbPresets, setDbPresets] = useState<StaffRolePreset[]>([]);
  const [dbMembers, setDbMembers] = useState<string[]>([]);
  const [openStaffPicker, setOpenStaffPicker] = useState<string | null>(null);

  useEffect(() => {
    // 1. Subscribe to registered users
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const list: UserProfile[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as UserProfile);
        });
        setDbUsers(list);
      },
      (error) => {
        console.error("Failed to fetch users in EditableBudgetTable:", error);
      }
    );

    // 2. Subscribe to global staff presets / roster
    const unsubPresets = onSnapshot(
      doc(db, "settings", "staff_presets"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDbPresets(data.presets || []);
          setDbMembers(data.members || []);
        } else {
          setDbPresets([]);
          setDbMembers([]);
        }
      },
      (error) => {
        console.error("Failed to fetch staff presets in EditableBudgetTable:", error);
      }
    );

    return () => {
      unsubUsers();
      unsubPresets();
    };
  }, []);

  // Compute available staff names list STRICTLY from Daftar Anggota Tim (dbUsers) only
  const availableStaffNames = React.useMemo(() => {
    const uniques = new Set<string>();
    
    // Only active registered users from Daftar Anggota Tim in Firestore
    dbUsers.forEach((u) => {
      const name = u.username?.trim();
      if (name && u.status !== "nonaktif") {
        uniques.add(name);
      }
    });

    return Array.from(uniques).sort((a, b) => a.localeCompare(b, "id"));
  }, [dbUsers]);

  // AI Receipt Scanner State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [viewingReceiptImage, setViewingReceiptImage] = useState<string | null>(null);

  const handleApplyReceiptItems = (items: Array<Omit<BudgetItem, "id" | "num"> & { receiptImage?: string }>) => {
    const currentAccom = [...safeBudget.accommodation];
    const startNum = currentAccom.length > 0
      ? (parseInt(currentAccom[currentAccom.length - 1].num as string) || currentAccom.length) + 1
      : 1;

    const newRows: BudgetItem[] = items.map((it, idx) => ({
      id: `ac-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      num: startNum + idx,
      description: it.description,
      qty: it.qty,
      expense: it.expense,
      notes: it.notes,
      receiptImage: it.receiptImage,
    }));

    updateBudget({
      ...safeBudget,
      accommodation: [...currentAccom, ...newRows],
    }, true);
  };

  // States to add custom items for staff
  const [showFormA, setShowFormA] = useState(false);
  const [showFormB, setShowFormB] = useState(false);
  
  const [newA, setNewA] = useState({ description: "", qty: 1, expense: "", notes: "" });
  const [newB, setNewB] = useState({ description: "", qty: 1, expense: "", notes: "" });

  // Theme-specific colors
  const bannerColor = theme === "green" ? "bg-emerald-600" : "bg-rose-500";
  const accentBorderColor = theme === "green" ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500" : "border-rose-300 focus:border-rose-500 focus:ring-rose-500";
  const hoverRowBg = theme === "green" ? "hover:bg-emerald-50/20" : "hover:bg-rose-50/20";
  const badgeColor = theme === "green" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800";

  // Helper to trigger budget changes
  const updateBudgetSection = (
    sectionKey: "income" | "accommodation" | "feeDistribution",
    index: number,
    field: keyof BudgetItem,
    value: any
  ) => {
    const list = [...(safeBudget[sectionKey] || [])];
    const updatedItem = { ...list[index] };

    if (field === "qty" || field === "expense") {
      const numVal = parseFloat(value) || 0;
      updatedItem[field] = numVal;
    } else {
      updatedItem[field] = value;
    }

    list[index] = updatedItem;
    updateBudget({
      ...safeBudget,
      [sectionKey]: list,
    }, false);
  };

  const addRow = (sectionKey: "income" | "accommodation" | "feeDistribution") => {
    const list = [...(safeBudget[sectionKey] || [])];
    const nextNum = list.length > 0 ? (parseInt(list[list.length - 1].num as string) || list.length) + 1 : 1;
    const newItem: BudgetItem = {
      id: `${theme}-${sectionKey}-${Date.now()}`,
      num: nextNum,
      description: "",
      qty: 1,
      expense: 0,
      notes: "",
    };
    updateBudget({
      ...safeBudget,
      [sectionKey]: [...list, newItem],
    }, true);
  };

  const addCustomRow = (
    sectionKey: "income" | "accommodation",
    itemDetails: { description: string; qty: number; expense: number; notes: string }
  ) => {
    const list = [...(safeBudget[sectionKey] || [])];
    const nextNum = list.length > 0 ? (parseInt(list[list.length - 1].num as string) || list.length) + 1 : 1;
    const newItem: BudgetItem = {
      id: `${theme}-${sectionKey}-${Date.now()}`,
      num: nextNum,
      description: itemDetails.description,
      qty: itemDetails.qty,
      expense: itemDetails.expense,
      notes: itemDetails.notes,
    };
    updateBudget({
      ...safeBudget,
      [sectionKey]: [...list, newItem],
    }, true);
  };

  const deleteRow = (sectionKey: "income" | "accommodation" | "feeDistribution", index: number) => {
    const list = (safeBudget[sectionKey] || []).filter((_, i) => i !== index);
    updateBudget({
      ...safeBudget,
      [sectionKey]: list,
    }, true);
  };

  const handleSelectPreset = (idx: number, presetId: string) => {
    const activePresetsList = dbPresets.length > 0 ? dbPresets : (staffPresets || []);
    const selectedPreset = activePresetsList.find(p => p.id === presetId);
    if (!selectedPreset) return;

    const list = [...(safeBudget.feeDistribution || [])];
    const updatedItem = {
      ...list[idx],
      description: selectedPreset.roleName,
      notes: (selectedPreset.defaultNames && availableStaffNames.includes(selectedPreset.defaultNames.trim()))
        ? selectedPreset.defaultNames.trim()
        : (list[idx].notes || ""),
    };
    if (selectedPreset.defaultExpense && selectedPreset.defaultExpense > 0) {
      updatedItem.expense = selectedPreset.defaultExpense;
    }

    list[idx] = updatedItem;
    updateBudget({
      ...safeBudget,
      feeDistribution: list,
    }, true);
  };

  const handleRatioChange = (field: keyof SharingRatio, value: string) => {
    const num = parseFloat(value) || 0;
    const updatedRatio = { ...(safeBudget.sharingRatio || { mateha: 25, staff: 70, investor: 5 }), [field]: num };
    updateBudget({
      ...safeBudget,
      sharingRatio: updatedRatio,
    }, false);
  };

  const handlePicBonusStaffChange = (value: string) => {
    updateBudget({
      ...safeBudget,
      picBonusStaff: value,
    }, true);
  };

  const handlePicBonusRatioChange = (value: string) => {
    const num = parseFloat(value) || 0;
    updateBudget({
      ...safeBudget,
      picBonusRatio: num,
    }, false);
  };

  // Check budget splits warning
  const totalSplitRatio = (safeBudget.sharingRatio?.mateha || 0) + (safeBudget.sharingRatio?.staff || 0) + (safeBudget.sharingRatio?.investor || 0);
  const showRatioWarning = totalSplitRatio !== 100;

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
      {/* Upper Sheet Banner */}
      <div className={`p-5 border-b border-slate-800/60 text-white flex justify-between items-center bg-slate-950/40`}>
        <div className="flex items-center space-x-3">
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${theme === "green" ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)] animate-pulse"}`}></span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {theme === "green" ? "Rencana Anggaran (RAB)" : "Laporan Realisasi Biaya"}
              </span>
            </div>
            <h1 className="text-lg font-extrabold font-sans text-slate-100 tracking-tight mt-0.5">{title}</h1>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* UNDO / REDO CONTROLS */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-1 shadow-inner shrink-0 mr-1.5 font-sans">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="flex items-center space-x-1 p-1.5 px-3 rounded-lg text-xs font-semibold select-none transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-slate-300 hover:text-white hover:bg-slate-800/80 active:scale-95 disabled:active:scale-100"
              title="Mundur / Batalkan perubahan terakhir (Undo)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase font-bold tracking-tight">Undo</span>
            </button>
            <div className="w-px h-4 bg-slate-800 self-center mx-1"></div>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="flex items-center space-x-1 p-1.5 px-3 rounded-lg text-xs font-semibold select-none transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-slate-300 hover:text-white hover:bg-slate-800/80 active:scale-95 disabled:active:scale-100"
              title="Maju / Terapkan kembali perubahan (Redo)"
            >
              <span className="text-[10px] uppercase font-bold tracking-tight">Redo</span>
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {onSave && (
            <button
              onClick={onSave}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-bold py-1.5 px-4 rounded-xl text-xs transition duration-150 active:scale-95 whitespace-nowrap shadow-lg shadow-emerald-900/20"
              title="Simpan semua perubahan pada tabel ini."
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan Semua</span>
            </button>
          )}
          {onCopyFromRAB && (
            <button
              onClick={onCopyFromRAB}
              id="btn-copy-from-rab"
              className="flex items-center space-x-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold py-1.5 px-3 rounded-xl text-xs transition duration-150 active:scale-95 whitespace-nowrap"
              title="Salin seluruh item rancangan anggaran (RAB) ke lembar realisasi ini."
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin dari RAB</span>
            </button>
          )}
        </div>
      </div>

      {/* Sheet Subtitle (Row 1 Info) */}
      <div className="bg-[#0b0d10]/40 border-b border-slate-800/50 px-5 py-3 flex flex-wrap justify-between items-center text-xs text-slate-400 font-mono gap-2">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-slate-300">Event:</span>
          <span className="text-slate-100 font-sans">{projectMetadata.name || "-"}</span>
        </div>
        <div className="flex items-center space-x-4">
          <div>
            <span className="font-semibold text-slate-300">Tanggal: </span>
            <span className="text-slate-200">{projectMetadata.date || "-"}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-300">Lokasi: </span>
            <span className="text-slate-200">{projectMetadata.location || "-"}</span>
          </div>
        </div>
      </div>

      {/* Spreadsheet Main Grid Container */}
      <div className="p-5 space-y-6 overflow-x-auto">
        
        {/* SECTION A: INCOME */}
        <div>
          <div className="flex justify-between items-center mb-3 bg-[#111317]/80 border border-slate-800/40 p-2.5 rounded-xl">
            <span className="font-sans font-bold text-xs text-slate-200 uppercase tracking-wide">
              A. Income <span className="text-[10px] font-normal text-slate-400 lowercase italic">(pendapatan event)</span>
            </span>
            {userRole === "staff" ? (
              <button
                onClick={() => setShowFormA(!showFormA)}
                className="flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 font-bold border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 rounded-xl hover:bg-emerald-500/10 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showFormA ? "Batal Tambah" : "Tambah Item Income"}</span>
              </button>
            ) : (
              <button
                onClick={() => addRow("income")}
                className="flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris</span>
              </button>
            )}
          </div>

          {/* Inline Addition Form for Staff in Section A */}
          {userRole === "staff" && showFormA && (
            <div className="bg-slate-950/80 border border-emerald-500/20 p-4 rounded-xl mb-4 text-xs space-y-3 shadow-lg">
              <div className="flex justify-between items-center border-b border-slate-800/65 pb-2">
                <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-[10px]">Form Input Item Income Pendapatan</h4>
                <span className="text-[10px] text-slate-500 italic">Isi data dan tekan simpan untuk menambahkan baris baru</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium block">Deskripsi Pendapatan</label>
                  <input
                    type="text"
                    placeholder="e.g. Tiket Sponsor, Live Stream"
                    value={newA.description}
                    onChange={(e) => setNewA({...newA, description: e.target.value})}
                    className="w-full bg-[#080a0f] border border-slate-800/80 focus:border-emerald-500 rounded-lg py-1.5 px-2.5 text-slate-200 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium block">Kuantitas (Qty)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={newA.qty}
                    onChange={(e) => setNewA({...newA, qty: Math.max(1, parseInt(e.target.value) || 1)})}
                    className="w-full bg-[#080a0f] border border-slate-800/80 focus:border-emerald-500 rounded-lg py-1.5 px-2.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium block">Harga Satuan (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newA.expense}
                    onChange={(e) => setNewA({...newA, expense: e.target.value})}
                    className="w-full bg-[#080a0f] border border-slate-800/80 focus:border-emerald-500 rounded-lg py-1.5 px-2.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium block">Catatan / Keterangan</label>
                  <input
                    type="text"
                    placeholder="e.g. sponsor x, dsb."
                    value={newA.notes}
                    onChange={(e) => setNewA({...newA, notes: e.target.value})}
                    className="w-full bg-[#080a0f] border border-slate-800/80 focus:border-emerald-500 rounded-lg py-1.5 px-2.5 text-slate-200 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={!newA.description.trim()}
                  onClick={() => {
                    addCustomRow("income", {
                      description: newA.description.trim(),
                      qty: newA.qty,
                      expense: Number(newA.expense) || 0,
                      notes: newA.notes.trim()
                    });
                    setNewA({ description: "", qty: 1, expense: "", notes: "" });
                    setShowFormA(false);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold px-4 py-1.5 rounded-lg transition text-xs uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Simpan Item Baru
                </button>
              </div>
            </div>
          )}

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
                <th className="py-2 px-3 w-12 text-center">Num</th>
                <th className="py-2 px-2 min-w-[200px]">Description</th>
                <th className="py-2 px-2 w-16 text-center">Qty</th>
                <th className="py-2 px-2 w-32 min-w-[120px]">Expense (Rp)</th>
                <th className="py-2 px-2 w-32 text-right">Total (Rp)</th>
                <th className="py-2 px-2 min-w-[120px]">Notes</th>
                <th className="py-2 px-2 w-10 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {safeBudget.income.map((item, idx) => (
                <tr key={item.id} className={`border-b border-slate-800/50 ${hoverRowBg} group transition duration-150`}>
                  <td className="p-1.5 text-center">
                    <input
                      type="text"
                      value={item.num}
                      disabled={userRole === "staff"}
                      onChange={(e) => updateBudgetSection("income", idx, "num", e.target.value)}
                      className="w-full bg-slate-950/20 text-center border border-transparent hover:border-slate-800/50 focus:border-slate-700 text-slate-400 font-mono focus:bg-slate-950/80 focus:ring-0 rounded py-1 disabled:opacity-80 disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      value={item.description}
                      disabled={userRole === "staff"}
                      placeholder="e.g. Tiket Sponsor, Live Stream"
                      onChange={(e) => updateBudgetSection("income", idx, "description", e.target.value)}
                      className="w-full bg-transparent text-slate-100 border border-transparent hover:border-slate-800 focus:border-slate-700 rounded py-1 px-1.5 focus:outline-none disabled:text-slate-400 disabled:bg-slate-950/5 disabled:border-transparent"
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    <input
                      type="number"
                      value={item.qty}
                      disabled={userRole === "staff"}
                      min="0"
                      onChange={(e) => updateBudgetSection("income", idx, "qty", e.target.value)}
                      className="w-full bg-slate-950/20 text-center border border-transparent hover:border-slate-800 focus:border-slate-700 text-slate-200 focus:bg-slate-950/80 rounded py-1 font-mono disabled:text-slate-400 disabled:bg-slate-950/5 disabled:border-transparent disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center space-x-1">
                      <span className="text-slate-500 font-mono">Rp</span>
                      <input
                        type="number"
                        value={item.expense === 0 ? "" : item.expense}
                        disabled={userRole === "staff"}
                        placeholder="0"
                        min="0"
                        onChange={(e) => updateBudgetSection("income", idx, "expense", e.target.value)}
                        className="w-full bg-transparent text-slate-200 border border-transparent hover:border-slate-800 focus:border-slate-700 rounded py-1 font-mono disabled:text-slate-400 disabled:bg-slate-950/5 disabled:border-transparent"
                      />
                    </div>
                  </td>
                  <td className="p-1.5 text-right font-mono text-slate-300 font-medium px-2">
                    {formatRupiah(item.qty * item.expense)}
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      value={item.notes}
                      disabled={userRole === "staff"}
                      placeholder="Catatan..."
                      onChange={(e) => updateBudgetSection("income", idx, "notes", e.target.value)}
                      className="w-full bg-transparent text-slate-400 border border-transparent hover:border-slate-800 focus:border-slate-700 rounded py-1 px-1 focus:outline-none disabled:text-slate-500 disabled:bg-slate-950/5 disabled:border-transparent"
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    {userRole !== "staff" && (
                      <button
                        onClick={() => deleteRow("income", idx)}
                        className="text-rose-450 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 duration-150 p-1.5 rounded-lg cursor-pointer inline-flex items-center justify-center border border-rose-500/10"
                        title="Hapus Baris"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {safeBudget.income.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-500 italic">
                    Belum ada pendapatan. Tambahkan baris baru di atas.
                  </td>
                </tr>
              )}
              {/* TOTAL A ROW */}
              <tr className="bg-slate-900/30 border-t border-slate-800 font-medium text-slate-200">
                <td colSpan={2} className="py-2.5 px-3 text-right text-slate-400 uppercase tracking-wider text-[10px] font-bold">Total A (Income)</td>
                <td className="py-2.5 px-1 text-center font-mono">
                  {safeBudget.income.reduce((sum, item) => sum + item.qty, 0)}
                </td>
                <td className="py-2.5 px-1 text-center text-slate-600">-</td>
                <td className="py-2.5 px-2 text-right text-emerald-400 font-mono tracking-tight font-bold text-sm">
                  {formatRupiah(calc.totalIncome)}
                </td>
                <td colSpan={2} className="py-2.5 px-2 text-slate-500 text-[10px] uppercase font-bold tracking-wider pl-4">
                  Akumulasi total omset proyek
                </td>
              </tr>
            </tbody>
          </table>
        </div>


        {/* SECTION B: DETAILS OF ACCOMMODATION AND OTHER COSTS */}
        <div>
          <div className="flex justify-between items-center mb-3 bg-[#111317]/80 border border-slate-800/40 p-2.5 rounded-xl flex-wrap gap-2">
            <span className="font-sans font-bold text-xs text-slate-200 uppercase tracking-wide">
              B. Details of Accommodation and Other Costs <span className="text-[10px] font-normal text-slate-400 lowercase italic">(biaya operasional & vendor)</span>
            </span>
            <div className="flex items-center flex-wrap gap-2.5 text-xs">
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="flex items-center space-x-1.5 bg-gradient-to-r from-cyan-500/15 to-emerald-500/15 hover:from-cyan-500/25 hover:to-emerald-500/25 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded-xl font-semibold hover:text-white transition cursor-pointer"
                title="Upload foto struk/nota dengan AI untuk mengisi deskripsi & nominal otomatis"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Scan Struk (AI)</span>
              </button>

              {onSharePointB && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={onSharePointB}
                    className="flex items-center space-x-1.5 bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 px-2.5 py-1 rounded-xl font-semibold hover:text-white transition cursor-pointer"
                    title="Bagikan link agar orang lain dapat membantu mengisi pengeluaran Point B"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>Bagikan Link Point B</span>
                  </button>

                  {userRole === "admin" && onTogglePointB && (
                    <button
                      onClick={onTogglePointB}
                      className={`flex items-center space-x-1.5 border px-2.5 py-1 rounded-xl font-semibold transition cursor-pointer ${
                        isPointBClosed
                          ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-950"
                          : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-950"
                      }`}
                      title={
                        isPointBClosed
                          ? "Status: DITUTUP. Link share publik dinonaktifkan dan event ini TIDAK MUNCUL di pilihan catat reimburse staf di Slip Gaji. Klik untuk membuka kembali."
                          : "Status: TERBUKA. Link share publik aktif dan staf dapat memilih event ini untuk mencatat reimburse di Slip Gaji. Klik untuk menutup."
                      }
                    >
                      {isPointBClosed ? <Lock className="w-3 h-3 text-rose-400" /> : <Unlock className="w-3 h-3 text-emerald-400" />}
                      <span>{isPointBClosed ? "Akses & Reimburse: Ditutup" : "Akses & Reimburse: Terbuka"}</span>
                    </button>
                  )}
                </div>
              )}
              {userRole === "staff" ? (
                isPointBClosed ? (
                  <span
                    className="flex items-center space-x-1 text-rose-400/80 font-bold border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 rounded-xl text-[11px]"
                    title="Pengisian Point B dan pengajuan reimburse untuk event ini telah ditutup oleh Admin"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Point B Ditutup Admin</span>
                  </span>
                ) : (
                  <button
                    onClick={() => setShowFormB(!showFormB)}
                    className="flex items-center space-x-1 text-rose-400 hover:text-rose-350 font-bold border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 rounded-xl hover:bg-rose-500/10 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showFormB ? "Batal Tambah" : "Tambah Item Akomodasi"}</span>
                  </button>
                )
              ) : (
                <button
                  onClick={() => addRow("accommodation")}
                  className="flex items-center space-x-1 text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Baris</span>
                </button>
              )}
            </div>
          </div>

          {/* NOTIFIKASI STATUS AKSES POINT B JIKA DITUTUP */}
          {isPointBClosed && (
            <div className="mb-3 p-2.5 bg-rose-950/20 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-[11px] leading-relaxed">
                  <strong>Akses Point B & Pengajuan Reimburse Ditutup:</strong> Tautan kolaborasi publik dinonaktifkan, dan event ini disembunyikan dari pilihan formulir <em>"Catat Reimburse"</em> di halaman Slip Gaji staf.
                </span>
              </div>
              {userRole === "admin" && onTogglePointB && (
                <button
                  type="button"
                  onClick={onTogglePointB}
                  className="text-[10px] font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 px-2.5 py-1 rounded-lg transition border border-rose-500/35 shrink-0 whitespace-nowrap cursor-pointer"
                >
                  Buka Kembali Akses
                </button>
              )}
            </div>
          )}

          {/* Inline Addition Form for Staff in Section B */}
          {userRole === "staff" && showFormB && (
            <div className="bg-slate-950/80 border border-rose-500/20 p-4 rounded-xl mb-4 text-xs space-y-3 shadow-lg">
              <div className="flex justify-between items-center border-b border-slate-800/65 pb-2">
                <h4 className="font-bold text-rose-400 uppercase tracking-wider text-[10px]">Form Input Item Akomodasi & Biaya Vendor</h4>
                <span className="text-[10px] text-slate-500 italic">Isi data dan tekan simpan untuk menambahkan baris baru</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium block">Deskripsi Pengeluaran</label>
                  <input
                    type="text"
                    placeholder="e.g. Bensin, Konsumsi, Sewa Alat"
                    value={newB.description}
                    onChange={(e) => setNewB({...newB, description: e.target.value})}
                    className="w-full bg-[#080a0f] border border-slate-800/80 focus:border-rose-500 rounded-lg py-1.5 px-2.5 text-slate-200 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium block">Kuantitas (Qty)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={newB.qty}
                    onChange={(e) => setNewB({...newB, qty: Math.max(1, parseInt(e.target.value) || 1)})}
                    className="w-full bg-[#080a0f] border border-slate-800/80 focus:border-rose-500 rounded-lg py-1.5 px-2.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium block">Biaya / Harga (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newB.expense}
                    onChange={(e) => setNewB({...newB, expense: e.target.value})}
                    className="w-full bg-[#080a0f] border border-slate-800/80 focus:border-rose-500 rounded-lg py-1.5 px-2.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium block">Nama PIC / Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. bensin l-300, vendor sound"
                    value={newB.notes}
                    list="staff-list-new-accommodation"
                    onChange={(e) => setNewB({...newB, notes: e.target.value})}
                    className="w-full bg-[#080a0f] border border-slate-800/80 focus:border-rose-500 rounded-lg py-1.5 px-2.5 text-slate-200 focus:outline-none"
                  />
                  <datalist id="staff-list-new-accommodation">
                    {availableStaffNames.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={!newB.description.trim()}
                  onClick={() => {
                    addCustomRow("accommodation", {
                      description: newB.description.trim(),
                      qty: newB.qty,
                      expense: Number(newB.expense) || 0,
                      notes: newB.notes.trim()
                    });
                    setNewB({ description: "", qty: 1, expense: "", notes: "" });
                    setShowFormB(false);
                  }}
                  className="bg-rose-500 hover:bg-rose-400 text-slate-950 font-extrabold px-4 py-1.5 rounded-lg transition text-xs uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Simpan Item Baru
                </button>
              </div>
            </div>
          )}

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
                <th className="py-2 px-3 w-12 text-center">Num</th>
                <th className="py-2 px-2 min-w-[200px]">Description</th>
                <th className="py-2 px-2 w-16 text-center">Qty</th>
                <th className="py-2 px-2 w-32 min-w-[120px]">Expense (Rp)</th>
                <th className="py-2 px-2 w-32 text-right">Total (Rp)</th>
                <th className="py-2 px-2 min-w-[150px]">Nama PIC / Notes</th>
                <th className="py-2 px-2 w-10 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {safeBudget.accommodation.map((item, idx) => (
                <tr key={item.id} className={`border-b border-slate-800/50 ${hoverRowBg} group transition duration-150`}>
                  <td className="p-1.5 text-center">
                    <input
                      type="text"
                      value={item.num}
                      disabled={userRole === "staff"}
                      onChange={(e) => updateBudgetSection("accommodation", idx, "num", e.target.value)}
                      className="w-full bg-slate-950/20 text-center border border-transparent hover:border-slate-800/50 focus:border-slate-700 text-slate-400 font-mono focus:bg-slate-950/80 rounded py-1 disabled:opacity-80 disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      value={item.description}
                      disabled={userRole === "staff"}
                      placeholder="e.g. Bensin, Sewa Kamera, Konsumsi"
                      onChange={(e) => updateBudgetSection("accommodation", idx, "description", e.target.value)}
                      className="w-full bg-transparent text-slate-100 border border-transparent hover:border-slate-800 focus:border-slate-700 rounded py-1 px-1.5 focus:outline-none disabled:text-slate-400 disabled:bg-slate-950/5 disabled:border-transparent"
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    <input
                      type="number"
                      value={item.qty}
                      disabled={userRole === "staff"}
                      min="0"
                      onChange={(e) => updateBudgetSection("accommodation", idx, "qty", e.target.value)}
                      className="w-full bg-slate-950/20 text-center border border-transparent hover:border-slate-800 focus:border-slate-700 text-slate-200 focus:bg-slate-950/80 rounded py-1 font-mono disabled:text-slate-400 disabled:bg-slate-950/5 disabled:border-transparent disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center space-x-1">
                      <span className="text-slate-500 font-mono">Rp</span>
                      <input
                        type={isGuestView ? "text" : "number"}
                        value={isGuestView ? "****" : (item.expense === 0 ? "" : item.expense)}
                        disabled={isGuestView || userRole === "staff"}
                        placeholder={isGuestView ? "****" : "0"}
                        min="0"
                        onChange={(e) => updateBudgetSection("accommodation", idx, "expense", e.target.value)}
                        className="w-full bg-transparent text-slate-200 border border-transparent hover:border-slate-800 focus:border-slate-700 rounded py-1 font-mono disabled:text-slate-400 disabled:bg-slate-950/5 disabled:border-transparent"
                      />
                    </div>
                  </td>
                  <td className="p-1.5 text-right font-mono text-slate-300 font-medium px-2">
                    {isGuestView ? "****" : formatRupiah(item.qty * item.expense)}
                  </td>
                  <td className="p-1.5">
                    <div className="relative flex items-center bg-slate-950/40 rounded px-1.5 border border-slate-800/80 hover:border-slate-700 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-505 transition-all">
                      <input
                        type="text"
                        value={isGuestView ? "****" : (item.notes || "")}
                        disabled={isGuestView || userRole === "staff"}
                        list={`staff-list-accommodation-${item.id}`}
                        placeholder={isGuestView ? "****" : "Nama PIC (Multi-select) ..."}
                        onChange={(e) => updateBudgetSection("accommodation", idx, "notes", e.target.value)}
                        className="w-full bg-transparent text-slate-200 py-1 focus:outline-none placeholder-slate-600 text-[11px] font-mono disabled:opacity-80 disabled:cursor-not-allowed"
                      />
                      
                      {/* Native suggestion dropdown */}
                      <datalist id={`staff-list-accommodation-${item.id}`}>
                        {availableStaffNames.map(name => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </datalist>
                      
                      {/* Single-select: simply set the note to the selected name */}
                      {userRole !== "staff" && (
                        <div className="relative flex items-center pointer-events-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenStaffPicker(openStaffPicker === item.id ? null : item.id);
                            }}
                            className="bg-slate-900 duration-150 hover:bg-slate-800 text-slate-400 hover:text-rose-400 p-0.5 px-1.5 ml-1 rounded text-[10px] flex items-center space-x-0.5 shrink-0 focus:outline-none select-none border border-slate-800 cursor-pointer"
                            title="Pilih Staf Terdaftar"
                          >
                            <span>👥</span>
                            <span className="text-[8px] font-bold">Pilih</span>
                          </button>
                          
                          {openStaffPicker === item.id && (
                            <div className="absolute right-0 top-7 z-50 w-56 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-2.5 text-slate-300 animate-in fade-in zoom-in-95 duration-100">
                              <div className="flex justify-between items-center mb-1.5 pb-1 border-b border-slate-800/60">
                                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Pilih PIC / Roster</span>
                                <button
                                  type="button"
                                  onClick={() => setOpenStaffPicker(null)}
                                  className="text-[9px] text-rose-400 hover:text-rose-350 font-bold cursor-pointer"
                                >
                                  Tutup
                                </button>
                              </div>
                              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 font-sans text-left">
                                {availableStaffNames.length === 0 ? (
                                  <div className="p-2 text-center text-slate-600 text-[10px] italic">
                                    Belum ada roster staff diatur oleh Admin di tab Keanggotaan.
                                  </div>
                                ) : (
                                  availableStaffNames.map((name) => {
                                    return (
                                      <label
                                        key={name}
                                        className="flex items-center space-x-2 p-1.5 rounded hover:bg-slate-900/80 cursor-pointer text-[11px] transition select-none"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          updateBudgetSection("accommodation", idx, "notes", name);
                                          setOpenStaffPicker(null);
                                        }}
                                      >
                                        <input
                                          type="radio"
                                          checked={item.notes === name}
                                          readOnly
                                          className="rounded-full border-slate-800 text-rose-500 focus:ring-0 w-3.5 h-3.5 bg-slate-900 cursor-pointer"
                                        />
                                        <span className="font-semibold text-slate-200 capitalize font-sans">{name}</span>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                              <div className="text-[8px] text-slate-500 mt-2 border-t border-slate-800/60 pt-1.5 leading-relaxed font-sans text-left">
                                Info: Pilih nama PIC.
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {item.receiptImage && (
                        <button
                          type="button"
                          onClick={() => setViewingReceiptImage(item.receiptImage!)}
                          className="text-cyan-400 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 p-1.5 rounded-lg border border-cyan-500/25 cursor-pointer transition"
                          title="Lihat Foto Struk Pengeluaran"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {userRole !== "staff" && (
                        <button
                          onClick={() => deleteRow("accommodation", idx)}
                          className="text-rose-450 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 duration-150 p-1.5 rounded-lg cursor-pointer inline-flex items-center justify-center border border-rose-500/10"
                          title="Hapus Baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {safeBudget.accommodation.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-500 italic">
                    Belum ada biaya akomodasi. Tambahkan baris baru di atas.
                  </td>
                </tr>
              )}
              {/* TOTAL B ROW */}
              <tr className="bg-slate-900/30 border-t border-slate-800 font-medium text-slate-200">
                <td colSpan={2} className="py-2.5 px-3 text-right text-slate-400 uppercase tracking-wider text-[10px] font-bold">Total B (Accommodation & Costs)</td>
                <td className="py-2.5 px-1 text-center font-mono">
                  {safeBudget.accommodation.reduce((sum, item) => sum + item.qty, 0)}
                </td>
                <td className="py-2.5 px-1 text-center text-slate-600">-</td>
                <td className="py-2.5 px-2 text-right text-rose-450 font-mono tracking-tight font-bold text-sm">
                  {formatRupiah(calc.totalAccommodation)}
                </td>
                <td colSpan={2} className="py-2.5 px-2 text-slate-500 text-[10px] uppercase font-bold tracking-wider pl-4">
                  Total biaya operasional & pengeluaran di lapangan
                </td>
              </tr>
            </tbody>
          </table>
        </div>


        {/* SECTION C: INCOME SHARING MATHEHA X STAF */}
        {userRole !== "staff" && (
          <div>
            <div className="flex justify-between items-center mb-3 bg-[#111317]/80 border border-slate-800/40 p-2.5 rounded-xl">
            <span className="font-sans font-bold text-xs text-slate-200 uppercase tracking-wide">
              C. Income Sharing (Mateha x Staf) <span className="text-[10px] font-normal text-slate-400 lowercase italic">(pembagian profit bersih)</span>
            </span>
            <div className="flex items-center text-xxs text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-lg gap-1 border border-amber-500/15">
              <span className="font-semibold uppercase tracking-wider text-[9px]">Formula:</span>
              <span>Net Income = Total A - Total B</span>
            </div>
          </div>

          {/* NET INCOME INDICATOR */}
          <div className="bg-[#0b0d10]/60 border border-slate-800 p-4 rounded-xl flex justify-between items-center text-xs mb-3">
            <div className="text-slate-300 font-semibold uppercase tracking-wider text-[10px]">
              Nilai Bersih untuk Distribusi (Net Income):
            </div>
            <div className="font-mono font-bold text-cyan-400 text-base">
              {formatRupiah(calc.netIncome)}
            </div>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
                <th className="py-2 px-3 w-12 text-center">Num</th>
                <th className="py-2 px-2 min-w-[200px]">Description & Split %</th>
                <th className="py-2 px-2 w-16 text-center">Qty</th>
                <th className="py-2 px-2 w-32 text-center">Allocation %</th>
                <th className="py-2 px-2 w-32 text-right">Total Share (Rp)</th>
                <th className="py-2 px-2 min-w-[120px]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {/* MATEHA PORTION */}
              <tr className="border-b border-slate-800/50 hover:bg-slate-900/10 transition duration-150">
                <td className="p-3.5 text-center text-slate-500 font-mono">1</td>
                <td className="p-3.5 text-slate-100 font-bold text-xs">Mateha (Company Share)</td>
                <td className="p-3.5 text-center font-mono text-slate-500">1</td>
                <td className="p-1.5 text-center">
                  <div className="inline-flex items-center bg-slate-950/80 px-2 py-1 rounded-xl border border-slate-800 max-w-[85px] focus-within:border-slate-600">
                    <input
                      type="number"
                      value={safeBudget.sharingRatio?.mateha ?? 0}
                      onChange={(e) => handleRatioChange("mateha", e.target.value)}
                      className="w-full bg-transparent text-center text-amber-400 font-mono font-semibold focus:outline-none"
                    />
                    <span className="text-slate-500 font-mono text-xs">%</span>
                  </div>
                </td>
                <td className="p-3.5 text-right font-mono text-emerald-400 font-bold text-sm">
                  {formatRupiah(calc.matehaShare)}
                </td>
                <td className="p-3.5 text-slate-400 italic">
                  {safeBudget.sharingRatio?.mateha ?? 0}% of Net Income (Netto)
                </td>
              </tr>

              {/* STAFF PORTION */}
              <tr className="border-b border-slate-800/50 hover:bg-slate-900/10 transition duration-150">
                <td className="p-3.5 text-center text-slate-500 font-mono">2</td>
                <td className="p-3.5 text-slate-100 font-bold text-xs">Production Staff Fees (Staff Budget Pool)</td>
                <td className="p-3.5 text-center font-mono text-slate-500">1</td>
                <td className="p-1.5 text-center">
                  <div className="inline-flex items-center bg-slate-950/80 px-2 py-1 rounded-xl border border-slate-800 max-w-[85px] focus-within:border-slate-600">
                    <input
                      type="number"
                      value={safeBudget.sharingRatio?.staff ?? 0}
                      onChange={(e) => handleRatioChange("staff", e.target.value)}
                      className="w-full bg-transparent text-center text-amber-400 font-mono font-semibold focus:outline-none"
                    />
                    <span className="text-slate-500 font-mono text-xs">%</span>
                  </div>
                </td>
                <td className="p-3.5 text-right font-mono text-indigo-400 font-bold text-sm">
                  {formatRupiah(calc.staffPool)}
                </td>
                <td className="p-3.5 text-slate-400 italic">
                  {safeBudget.sharingRatio?.staff ?? 0}% of Net Income (Netto)
                </td>
              </tr>

              {/* INVESTOR PORTION */}
              <tr className="border-b border-slate-800/50 hover:bg-slate-900/10 transition duration-150">
                <td className="p-3.5 text-center text-slate-500 font-mono">3</td>
                <td className="p-3.5 text-slate-100 font-bold text-xs">Investor Portion</td>
                <td className="p-3.5 text-center font-mono text-slate-500">1</td>
                <td className="p-1.5 text-center">
                  <div className="inline-flex items-center bg-slate-950/80 px-2 py-1 rounded-xl border border-slate-800 max-w-[85px] focus-within:border-slate-600">
                    <input
                      type="number"
                      value={safeBudget.sharingRatio?.investor ?? 0}
                      onChange={(e) => handleRatioChange("investor", e.target.value)}
                      className="w-full bg-transparent text-center text-amber-400 font-mono font-semibold focus:outline-none"
                    />
                    <span className="text-slate-500 font-mono text-xs">%</span>
                  </div>
                </td>
                <td className="p-3.5 text-right font-mono text-pink-400 font-bold text-sm">
                  {formatRupiah(calc.investorShare)}
                </td>
                <td className="p-3.5 text-slate-400 italic">
                  {safeBudget.sharingRatio?.investor ?? 0}% of Net Income (Netto)
                </td>
              </tr>

              {/* RATIO RATIFIER WARNING */}
              {showRatioWarning && (
                <tr className="bg-amber-500/5 border-b border-slate-800/50">
                  <td colSpan={6} className="p-3.5 text-amber-500 text-center font-semibold text-xs animate-pulse">
                    ⚠️ Peringatan: Total pembagian hasil tidak bernilai 100% (Saat ini: {totalSplitRatio}%). Harap pastikan jumlah split adalah 100%.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}


        {/* SECTION D: DETAILS OF FEE DISTRIBUTION */}
        {userRole !== "staff" && (
          <div>
            <div className="flex justify-between items-center mb-3 bg-[#111317]/80 border border-slate-800/40 p-2.5 rounded-xl">
            <span className="font-sans font-bold text-xs text-slate-200 uppercase tracking-wide">
              D. Details of Fee Distribution <span className="text-[10px] font-normal text-slate-400 lowercase italic">(pembagian gaji staf dari budget pool)</span>
            </span>
            <button
              onClick={() => addRow("feeDistribution")}
              className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Staf / Fee</span>
            </button>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
                <th className="py-2 px-3 w-12 text-center">Num</th>
                <th className="py-2 px-2 min-w-[200px]">Staff Role</th>
                <th className="py-2 px-2 w-16 text-center">Qty</th>
                <th className="py-2 px-2 w-32 min-w-[120px]">Expense per Person</th>
                <th className="py-2 px-2 w-32 text-right">Total (Rp)</th>
                <th className="py-2 px-2 min-w-[140px]">Nama PIC (Anggota Tim)</th>
                <th className="py-2 px-2 w-10 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {safeBudget.feeDistribution.map((item, idx) => (
                <tr key={item.id} className={`border-b border-slate-800/50 ${hoverRowBg} group transition duration-150`}>
                  <td className="p-1.5 text-center">
                    <input
                      type="text"
                      value={item.num}
                      onChange={(e) => updateBudgetSection("feeDistribution", idx, "num", e.target.value)}
                      className="w-full bg-slate-950/20 text-center border border-transparent hover:border-slate-800 focus:border-slate-700 text-slate-400 font-mono focus:bg-slate-950/80 rounded py-1"
                    />
                  </td>
                  <td className="p-1.5">
                    {(() => {
                      const activePresets = dbPresets.length > 0 ? dbPresets : (staffPresets || []);
                      return (
                        <div className="space-y-1 font-sans">
                          <select
                            value={activePresets.some(p => p.roleName === item.description) ? activePresets.find(p => p.roleName === item.description)?.id : ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "custom") {
                                updateBudgetSection("feeDistribution", idx, "description", "");
                                updateBudgetSection("feeDistribution", idx, "notes", "");
                              } else if (val) {
                                handleSelectPreset(idx, val);
                              } else {
                                updateBudgetSection("feeDistribution", idx, "description", "");
                              }
                            }}
                            className="w-full bg-slate-950/80 border border-slate-800/80 focus:border-indigo-500 rounded py-1 px-1.5 text-slate-200 focus:outline-none text-[11px] font-medium cursor-pointer"
                          >
                            <option value="">-- Pilih Peran Staf --</option>
                            {activePresets.map(preset => (
                              <option key={preset.id} value={preset.id}>
                                {preset.roleName}
                              </option>
                            ))}
                            <option value="custom">✍️ Tulis Custom... </option>
                          </select>
                          
                          {/* Custom input that displays if current value is NOT inside presets or if "custom" is triggered */}
                          {(!activePresets.some(p => p.roleName === item.description) || !item.description) && (
                            <input
                              type="text"
                              value={item.description}
                              placeholder="Tulis peran kustom..."
                              onChange={(e) => updateBudgetSection("feeDistribution", idx, "description", e.target.value)}
                              className="w-full bg-slate-950/20 text-slate-100 border border-slate-800/40 hover:border-slate-700/80 focus:border-indigo-500 rounded py-1 px-1.5 text-[11px] focus:outline-none font-medium mt-1.5 placeholder-slate-600 focus:bg-slate-950"
                            />
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-1.5 text-center">
                    <input
                      type="number"
                      value={item.qty}
                      min="0"
                      onChange={(e) => updateBudgetSection("feeDistribution", idx, "qty", e.target.value)}
                      className="w-full bg-slate-950/20 text-center border border-transparent hover:border-slate-800 focus:border-slate-700 text-slate-200 focus:bg-slate-950/80 rounded py-1 font-mono"
                    />
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center space-x-1">
                    <div className="flex items-center space-x-1">
                      <span className="text-slate-500 font-mono">Rp</span>
                      <input
                        type={isGuestView ? "text" : "number"}
                        value={isGuestView ? "****" : (item.expense === 0 ? "" : item.expense)}
                        placeholder={isGuestView ? "****" : "0"}
                        disabled={!!isGuestView || ((userRole as string) === "staff")}
                        min="0"
                        onChange={(e) => updateBudgetSection("feeDistribution", idx, "expense", e.target.value)}
                        className="w-full bg-transparent text-slate-200 border border-transparent hover:border-slate-800 focus:border-slate-700 rounded py-1 font-mono"
                      />
                    </div>
                    </div>
                  </td>
                  <td className="p-1.5 text-right font-mono text-slate-300 font-medium px-2">
                    {isGuestView ? "****" : formatRupiah(item.qty * item.expense)}
                  </td>
                  <td className="p-1.5 min-w-[150px]">
                    <select
                      value={isGuestView ? "" : (item.notes || "")}
                      disabled={!!isGuestView || ((userRole as string) === "staff")}
                      onChange={(e) => updateBudgetSection("feeDistribution", idx, "notes", e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 px-2 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-sans transition"
                    >
                      <option value="">{isGuestView ? "****" : "-- Pilih PIC dari Anggota Tim --"}</option>
                      {availableStaffNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      {item.notes && !availableStaffNames.includes(item.notes) && (
                        <option value={item.notes}>{item.notes} (Lama)</option>
                      )}
                    </select>
                  </td>
                  <td className="p-1.5 text-center">
                    <button
                      onClick={() => deleteRow("feeDistribution", idx)}
                      className="text-rose-450 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 duration-150 p-1.5 rounded-lg cursor-pointer inline-flex items-center justify-center border border-rose-500/10"
                      title="Hapus Staf"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* PIC BONUS AUTO-CALCULATED ROW FROM SYSTEM */}
              <tr className="border-b border-slate-800/50 bg-[#161d2d]/30 font-medium text-slate-100">
                <td className="p-2 text-center text-slate-500 font-mono">
                  {safeBudget.feeDistribution.length + 1}
                </td>
                <td className="p-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-200 font-bold">PIC Bonus</span>
                    <span className="text-slate-550 text-xxs font-normal">(Auto)</span>
                    <div className="inline-flex items-center bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800 max-w-[55px] focus-within:border-slate-600">
                      <input
                        type="number"
                        value={safeBudget.picBonusRatio ?? 0}
                        min="0"
                        max="100"
                        onChange={(e) => handlePicBonusRatioChange(e.target.value)}
                        className="w-full bg-transparent text-center text-indigo-400 font-mono focus:outline-none"
                      />
                      <span className="text-slate-500 font-mono text-xxs">%</span>
                    </div>
                    <span className="text-slate-500 text-xxs font-normal">of Staff pool</span>
                  </div>
                </td>
                <td className="p-2 text-center font-mono text-slate-400">1</td>
                <td className="p-2 text-center text-slate-500 font-mono">-</td>
                <td className="p-2 text-right font-mono text-indigo-400 font-bold text-sm px-2">
                  {formatRupiah(calc.picBonus)}
                </td>
                <td className="p-2 w-[260px] relative">
                  {/* Notes / PIC Name for PIC Bonus from Daftar Anggota Tim */}
                  <div className="flex flex-col space-y-1">
                    <span className="text-slate-400 text-[9px] font-mono uppercase tracking-wider">
                      Penerima PIC Bonus:
                    </span>
                    <select
                      value={safeBudget.picBonusStaff || ""}
                      onChange={(e) => handlePicBonusStaffChange(e.target.value)}
                      className="w-full bg-slate-950/90 border border-slate-800 rounded-lg py-1 px-2 text-xs text-indigo-300 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">-- Pilih PIC dari Anggota Tim --</option>
                      {availableStaffNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      {safeBudget.picBonusStaff && !availableStaffNames.includes(safeBudget.picBonusStaff) && (
                        <option value={safeBudget.picBonusStaff}>{safeBudget.picBonusStaff} (Terdahulu)</option>
                      )}
                    </select>
                  </div>
                </td>
              </tr>

              {/* TOTAL D ROW */}
              <tr className="bg-slate-900/30 border-t border-slate-800 font-medium text-slate-200">
                <td colSpan={2} className="py-2.5 px-3 text-right text-slate-400 uppercase tracking-wider text-[10px] font-bold">Total D (Details of Fee Distribution)</td>
                <td className="py-2.5 px-1 text-center font-mono">
                  {safeBudget.feeDistribution.reduce((sum, item) => sum + item.qty, 0) + 1}
                </td>
                <td className="py-2.5 px-1 text-center text-slate-600">-</td>
                <td className="py-2.5 px-2 text-right text-indigo-400 font-mono tracking-tight font-bold text-sm">
                  {formatRupiah(calc.totalFeeDistribution)}
                </td>
                <td colSpan={2} className="py-2.5 px-2 text-slate-400 text-xxs font-semibold flex items-center justify-between pl-4">
                  <span>Total alokasi biaya staf</span>
                  <span className="text-indigo-300 font-bold bg-indigo-950/40 border border-indigo-550/10 rounded-lg px-2 py-0.5">
                    Pool: {formatRupiah(calc.staffPool)}
                  </span>
                </td>
              </tr>

              {/* Leftover Allocation check */}
              <tr className="bg-slate-950/50 border-t border-slate-800/60 text-xxs">
                <td colSpan={4} className="p-3 text-slate-400 text-right font-semibold">
                  Sisa Saldo Gaji Staf yang belum terbagi (Kembali ke Mateha):
                </td>
                <td className={`p-3 text-right font-mono font-bold text-sm ${calc.leftoverStaffPool >= 0 ? 'text-amber-400' : 'text-rose-500'}`}>
                  {formatRupiah(calc.leftoverStaffPool)}
                </td>
                <td colSpan={2} className="p-3 text-slate-500 italic">
                  {calc.leftoverStaffPool >= 0
                    ? "Sisa pool positif masuk ke keuntungan tambahan perusahaan"
                    : "Overbudget! Staff payout melebihi pool staf!"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        )}


        {/* TURQUOISE ROW: TOTAL MATEHA'S PROFIT */}
        {userRole !== "staff" && (
          <div id="mateha-profit-section" className="bg-[#051c24]/40 backdrop-blur-md border border-cyan-500/20 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0 shadow-lg shadow-cyan-950/10">
          <div className="flex flex-col">
            <span className="text-cyan-400 font-extrabold text-xs tracking-wider uppercase font-sans">
              TOTAL MATEHA'S NET PROFIT
            </span>
            <div className="text-[11px] text-slate-400 max-w-lg mt-1 font-sans">
              Perhitungan: Perusahaan Share ({formatRupiah(calc.matehaShare)}) + Sisa Allocation Pool Staf ({formatRupiah(calc.leftoverStaffPool)})
            </div>
          </div>
          <div className="flex items-baseline space-x-1 font-mono">
            <span className="text-cyan-400 font-extrabold text-2xl tracking-tight">
              {formatRupiah(calc.matehaProfit)}
            </span>
          </div>
        </div>
        )}

      </div>

      {/* AI RECEIPT SCANNER MODAL */}
      <ReceiptScannerModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        onApply={handleApplyReceiptItems}
        staffList={availableStaffNames}
        teamMembers={dbUsers.filter(u => u.status !== "nonaktif")}
      />

      {/* LIGHTBOX RECEIPT VIEWER */}
      {viewingReceiptImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative max-w-2xl w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col items-center">
            <div className="w-full flex justify-between items-center pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-cyan-400" />
                <span>Foto Struk / Bukti Pengeluaran Realisasi</span>
              </span>
              <button
                onClick={() => setViewingReceiptImage(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-auto flex items-center justify-center w-full">
              <img
                src={viewingReceiptImage}
                alt="Receipt Full Preview"
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow"
              />
            </div>

            <div className="w-full pt-3 mt-3 border-t border-slate-800 text-center">
              <button
                onClick={() => setViewingReceiptImage(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs uppercase cursor-pointer"
              >
                Tutup Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
