import React, { useState, useEffect } from "react";
import { db } from "../utils/firebase";
import { doc, onSnapshot, updateDoc, setDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { MatehaAccount, MatehaTransaction, formatRupiah, EventProject, SyncedProject } from "../types";
import { ArrowLeftRight, PiggyBank, Wallet, PlusCircle, MinusCircle, History, Trash2, RefreshCw, FileDown } from "lucide-react";
import { calculateProjectBudget } from "../utils/math";
import { notify } from "../utils/notification";

interface MatehaFinanceProps {
  projects: EventProject[];
  onNotify?: (text: string, type?: "success" | "error" | "warning" | "info", title?: string) => void;
}

export const MatehaFinance: React.FC<MatehaFinanceProps> = ({ projects, onNotify }) => {
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
  const [accounts, setAccounts] = useState<MatehaAccount[]>([
    { id: "kantong1", name: "Kantong 1 (Transaksi)", balance: 0 },
    { id: "kantong2", name: "Kantong 2 (Saving)", balance: 0 },
  ]);
  const [transactions, setTransactions] = useState<MatehaTransaction[]>([]);
  const [syncedProjects, setSyncedProjects] = useState<SyncedProject[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<"kantong1" | "kantong2">("kantong1");
  const [filterAccountId, setFilterAccountId] = useState<"all" | "kantong1" | "kantong2">("all");

  useEffect(() => {
    const docRef = doc(db, "settings", "mateha_finance");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAccounts(data.accounts);
        setTransactions(data.transactions || []);
        setSyncedProjects(data.syncedProjects || []);
      } else {
        setDoc(docRef, { 
            accounts: [
                { id: "kantong1", name: "Kantong 1 (Transaksi)", balance: 0 },
                { id: "kantong2", name: "Kantong 2 (Saving)", balance: 0 },
            ], 
            transactions: [],
            syncedProjects: []
        });
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleTransaction = async (type: "income" | "expense", customAmount?: number, customDescription?: string) => {
    const numericAmount = customAmount !== undefined ? customAmount : Number(amount);
    const desc = customDescription || description;
    
    if (!desc || numericAmount <= 0) return;

    const newAccounts = accounts.map(acc => {
        if (acc.id === selectedAccountId) {
            return {
                ...acc,
                balance: type === "income" ? acc.balance + numericAmount : acc.balance - numericAmount
            };
        }
        return acc;
    });

    const transactionData: any = {
        id: `tx-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type,
        description: desc,
        amount: numericAmount,
    };
    
    if (type === "expense") transactionData.fromAccountId = selectedAccountId;
    if (type === "income") transactionData.toAccountId = selectedAccountId;

    await updateDoc(doc(db, "settings", "mateha_finance"), { 
        accounts: newAccounts,
        transactions: arrayUnion(transactionData)
    });
    
    if (customAmount === undefined) {
        setAmount("");
        setDescription("");
    }
  };

  const deleteTransaction = async (tx: MatehaTransaction) => {
    const amountToReverse = tx.amount;
    const accountToAdjust = tx.type === "income" ? tx.toAccountId : tx.fromAccountId;

    const newAccounts = accounts.map(acc => {
        if (acc.id === accountToAdjust) {
            return {
                ...acc,
                balance: tx.type === "income" ? acc.balance - amountToReverse : acc.balance + amountToReverse
            };
        }
        return acc;
    });

    await updateDoc(doc(db, "settings", "mateha_finance"), { 
        accounts: newAccounts,
        transactions: arrayRemove(tx)
    });
  };

  const syncProjects = async () => {
    let accountsCopy = [...accounts];
    let transactionsToAdd: MatehaTransaction[] = [];
    let updatedSyncedProjects = [...syncedProjects];

    projects.forEach(proj => {
        const totalIncome = calculateProjectBudget(proj.realisasi).totalIncome;
        
        // Determine sync status for this project
        const existingSync = updatedSyncedProjects.find(sp => sp.id === proj.id);
        const alreadySyncedAmount = existingSync ? existingSync.syncedAmount : 0;
        
        let amountToSync = 0;
        if (proj.paymentStatus === "lunas") {
            amountToSync = totalIncome - alreadySyncedAmount;
        } else if (proj.paymentStatus === "dp" && proj.dpAmount) {
            // If DP, only sync the DP amount
            amountToSync = proj.dpAmount - alreadySyncedAmount;
        }

        if (amountToSync > 0) {
            // Update synced amount
            if (existingSync) {
                existingSync.syncedAmount += amountToSync;
            } else {
                updatedSyncedProjects.push({ id: proj.id, syncedAmount: amountToSync });
            }

            // Update accounts
            accountsCopy = accountsCopy.map(acc => acc.id === "kantong1" ? {...acc, balance: acc.balance + amountToSync} : acc);
            
            // Add transaction
            transactionsToAdd.push({
                id: `tx-sync-${proj.id}-${Date.now()}`,
                timestamp: new Date().toISOString(),
                type: "income",
                description: `Pendapatan: ${proj.name} (${proj.paymentStatus?.toUpperCase()})`,
                amount: amountToSync,
                toAccountId: "kantong1"
            });
        }
    });

    if (transactionsToAdd.length > 0) {
        await updateDoc(doc(db, "settings", "mateha_finance"), { 
            accounts: accountsCopy,
            transactions: arrayUnion(...transactionsToAdd),
            syncedProjects: updatedSyncedProjects
        });
        showNotification(`Berhasil melakukan sinkronisasi ${transactionsToAdd.length} transaksi ke Keuangan Mateha.`, "success", "Sinkronisasi Berhasil");
    } else {
        showNotification("Tidak ada pembayaran baru dari event untuk disinkronisasi.", "info", "Sinkronisasi Selesai");
    }
  };

  const exportToCSV = () => {
    const headers = ["Tanggal", "Deskripsi", "Tipe", "Kantong", "Jumlah"];
    const rows = filteredTransactions.map(tx => [
      new Date(tx.timestamp).toLocaleString(),
      `"${tx.description}"`,
      tx.type === "income" ? "Masuk" : "Keluar",
      (tx.toAccountId || tx.fromAccountId) === "kantong1" ? "Kantong 1" : "Kantong 2",
      tx.amount
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `transaksi_${filterAccountId}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredTransactions = transactions.filter(tx => {
    if (filterAccountId === "all") return true;
    return tx.fromAccountId === filterAccountId || tx.toAccountId === filterAccountId;
  });

  if (loading) return <div className="text-white">Memuat data keuangan...</div>;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl mb-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-400" />
            Pencatatan Cashflow Mateha
        </h2>
        <div className="flex gap-2">
            <button onClick={exportToCSV} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg" title="Ekspor ke CSV">
                <FileDown className="w-4 h-4" />
            </button>
            <button onClick={syncProjects} className="bg-cyan-900/50 hover:bg-cyan-900 text-cyan-300 p-2 rounded-lg" title="Sync Pendapatan Projek">
                <RefreshCw className="w-4 h-4" />
            </button>
        </div>
      </div>

      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {accounts.map(acc => (
          <div key={acc.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                {acc.id === "kantong1" ? <Wallet className="w-4 h-4" /> : <PiggyBank className="w-4 h-4" />}
                {acc.name}
            </div>
            <div className="text-2xl font-bold text-white font-mono">{formatRupiah(acc.balance)}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6">
        <h3 className="text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wider">Tambah Transaksi</h3>
        <div className="flex flex-col gap-3">
          <input 
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded-lg text-sm"
            placeholder="Deskripsi..."
          />
          <input 
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded-lg text-sm font-mono"
            placeholder="Jumlah (Rp)..."
          />
          <select 
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value as "kantong1" | "kantong2")}
            className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded-lg text-sm"
          >
            <option value="kantong1">Kantong 1 (Transaksi)</option>
            <option value="kantong2">Kantong 2 (Saving)</option>
          </select>
          <div className="flex gap-2">
            <button 
                onClick={() => handleTransaction("income")}
                className="flex-1 flex justify-center items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg text-xs font-bold transition"
            >
                <PlusCircle className="w-4 h-4" />
                Pendapatan
            </button>
            <button 
                onClick={() => handleTransaction("expense")}
                className="flex-1 flex justify-center items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white p-2 rounded-lg text-xs font-bold transition"
            >
                <MinusCircle className="w-4 h-4" />
                Pengeluaran
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
        <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4" /> Riwayat
            </h3>
            <select 
                value={filterAccountId} 
                onChange={(e) => setFilterAccountId(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 text-white p-1 rounded text-xs"
            >
                <option value="all">Semua</option>
                <option value="kantong1">Kantong 1</option>
                <option value="kantong2">Kantong 2</option>
            </select>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
            {filteredTransactions.slice().reverse().map(tx => (
                <div key={tx.id} className="flex justify-between items-center text-xs border-b border-slate-800 pb-2">
                    <div>
                        <div className="text-slate-200 font-medium">{tx.description}</div>
                        <div className="text-slate-500 font-mono">
                            {new Date(tx.timestamp).toLocaleString()}
                            {filterAccountId === "all" && (
                                <span className="ml-2 text-[10px] bg-slate-800 px-1 py-0.5 rounded">
                                    Kantong {(tx.toAccountId || tx.fromAccountId) === "kantong1" ? "1" : "2"}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={tx.type === "income" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                            {tx.type === "income" ? "+ " : "- "} {formatRupiah(tx.amount)}
                        </div>
                        <button onClick={() => deleteTransaction(tx)} className="text-slate-600 hover:text-rose-500">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};
