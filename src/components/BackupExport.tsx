import React, { useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import { Download, DatabaseBackup, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function BackupExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [summaryStats, setSummaryStats] = useState<Record<string, number> | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    setErrorMsg("");
    setSummaryStats(null);

    try {
      const collectionsToExport = [
        "projects",
        "users",
        "payslips",
        "quotations",
        "banks",
        "clients",
        "kwitansi",
        "invoices",
        "kasbon_requests"
      ];

      const exportedData: Record<string, any[]> = {};
      const stats: Record<string, number> = {};

      for (const collName of collectionsToExport) {
        try {
          const querySnapshot = await getDocs(collection(db, collName));
          const items: any[] = [];
          querySnapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() });
          });
          exportedData[collName] = items;
          stats[collName] = items.length;
        } catch (err) {
          console.warn(`Could not export collection ${collName}:`, err);
          exportedData[collName] = [];
          stats[collName] = 0;
        }
      }

      // Also export system settings (custom roles, staff presets, etc.)
      const settingsDocs = ["staff_presets", "custom_roles"];
      const exportedSettings: Record<string, any> = {};
      for (const sDoc of settingsDocs) {
        try {
          const sSnap = await getDoc(doc(db, "settings", sDoc));
          if (sSnap.exists()) {
            exportedSettings[sDoc] = sSnap.data();
          }
        } catch (err) {
          console.warn(`Could not export settings/${sDoc}:`, err);
        }
      }

      const backupObj = {
        exportDate: new Date().toISOString(),
        appName: "Mateha Production System",
        version: "2.5",
        summary: stats,
        settings: exportedSettings,
        collections: exportedData
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `mateha_full_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();

      setSummaryStats(stats);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 7000);
    } catch (err: any) {
      console.error("Backup failed:", err);
      setErrorMsg(err.message || "Terjadi kesalahan saat membackup data.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl p-4 sm:p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <DatabaseBackup className="w-4 h-4 text-cyan-400" />
            <span>Backup & Export Database Keseluruhan (Full Data)</span>
          </h2>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xl leading-relaxed">
            Mengekspor seluruh database website Mateha ke dalam 1 file JSON lengkap: <strong>Proyek/Event, Klien, Rekening Bank, Invoice, Quotation, Kwitansi, Payslip Staff, Kasbon, dan Master Pengguna/Peran</strong>.
          </p>
        </div>

        <div className="flex flex-col items-end space-y-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer
              ${isExporting 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 hover:shadow-[0_0_15px_rgba(34,211,238,0.4)]'
              }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses Seluruh Database...</span>
              </>
            ) : exportSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Backup Berhasil Diunduh!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download Full Database (.JSON)</span>
              </>
            )}
          </button>
          
          <AnimatePresence>
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-rose-400 text-[10px]"
              >
                {errorMsg}
              </motion.div>
            )}
            {summaryStats && exportSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-emerald-400 text-[10px] font-mono text-right"
              >
                Terekspor: {Object.values(summaryStats).reduce((a: number, b: number) => a + b, 0)} total dokumen tersimpan.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
