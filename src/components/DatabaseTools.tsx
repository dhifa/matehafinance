import React, { useRef, useState } from "react";
import { saveAs } from "file-saver";
import { AlertTriangle, CheckCircle2, Database, FileJson, Loader2, Upload } from "lucide-react";
import { apiDownload, apiFetch } from "../lib/api";

interface ImportResult {
  rows: { collection: string; imported: number; skipped: number }[];
  notes: string[];
  noLogin: string[];
  hasFinance: boolean;
}

/**
 * Admin tools for the CI4/MySQL version: import a JSON backup (from the
 * Firestore app or this one) and download a MySQL dump.
 */
export default function DatabaseTools() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState<"import" | "sql" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const runImport = async () => {
    if (!file) return;
    if (overwrite && !window.confirm("Data yang ID-nya sama akan DITIMPA dengan isi file backup. Lanjutkan?")) return;
    setBusy("import");
    setError(null);
    setResult(null);
    try {
      let backup: unknown;
      try {
        backup = JSON.parse(await file.text());
      } catch {
        throw new Error("File bukan JSON yang valid. Pilih file mateha_full_backup_....json.");
      }
      setResult(await apiFetch<ImportResult>("/admin/import-json", { method: "POST", body: { backup, overwrite } }));
      setFile(null);
    } catch (err: any) {
      setError(
        err?.status === 413
          ? "File terlalu besar untuk diunggah lewat browser. Gunakan perintah: php spark mateha:import-backup <file.json>"
          : err?.message || "Impor gagal."
      );
    } finally {
      setBusy(null);
    }
  };

  const exportSql = async () => {
    setBusy("sql");
    setError(null);
    try {
      const { blob, filename } = await apiDownload("/admin/export-sql");
      saveAs(blob, filename);
    } catch (err: any) {
      setError(err?.message || "Export SQL gagal.");
    } finally {
      setBusy(null);
    }
  };

  const total = result?.rows.reduce((s, r) => s + r.imported, 0) ?? 0;

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl p-4 sm:p-6 mb-6 space-y-5">
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          Import & Export Database (MySQL)
        </h2>
        <p className="text-[11px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
          Pindahkan data dari versi Firestore dengan file backup JSON, atau unduh seluruh database MySQL sebagai file
          <strong> .sql</strong> (bisa di-import lewat phpMyAdmin).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Import JSON */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <FileJson className="w-3.5 h-3.5 text-amber-300" /> Import Backup JSON
          </p>
          <p className="text-[11px] text-slate-400">
            File dari tombol <em>Download Full Database (.JSON)</em> (versi Firestore atau versi ini). Password staf di
            backup otomatis di-hash.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setResult(null);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer disabled:opacity-50"
            >
              Pilih file JSON
            </button>
            <span className="text-[11px] text-slate-400 truncate max-w-[14rem]">{file ? file.name : "Belum ada file"}</span>
          </div>
          <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="mt-0.5" />
            <span>
              Timpa data yang sudah ada <span className="text-slate-500">(tanpa centang: data yang sudah ada dilewati)</span>
            </span>
          </label>
          <button
            type="button"
            onClick={runImport}
            disabled={!file || busy !== null}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import ke MySQL
          </button>
        </div>

        {/* Export SQL */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 flex flex-col">
          <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-cyan-300" /> Export SQL
          </p>
          <p className="text-[11px] text-slate-400 flex-1">
            Struktur dan isi semua tabel: event, keuangan Mateha, invoice, quotation, kwitansi, klien, bank, payslip,
            kasbon, pengguna (password tetap ter-hash), dan memori AI. Sesi login dan API key Gemini tidak ikut.
          </p>
          <button
            type="button"
            onClick={exportSql}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {busy === "sql" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Download Database (.SQL)
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" /> {error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2 text-xs">
          <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Impor selesai: {total} data masuk.
          </p>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0.5 text-slate-300 tabular-nums">
            <span className="text-slate-500">Koleksi</span>
            <span className="text-slate-500 text-right">Diimpor</span>
            <span className="text-slate-500 text-right">Dilewati</span>
            {result.rows.map((r) => (
              <React.Fragment key={r.collection}>
                <span className="truncate">{r.collection}</span>
                <span className="text-right">{r.imported}</span>
                <span className="text-right text-slate-500">{r.skipped}</span>
              </React.Fragment>
            ))}
          </div>
          {!result.hasFinance && (
            <p className="text-amber-300">Backup ini tidak berisi data Keuangan Mateha (kas). Buat backup baru dari versi Firestore terbaru.</p>
          )}
          {result.noLogin.length > 0 && (
            <p className="text-amber-300">
              Akun tanpa password di backup: {result.noLogin.join(", ")}. Atur passwordnya di menu Manajemen Staff.
            </p>
          )}
          {result.notes.map((n, i) => (
            <p key={i} className="text-slate-400">
              {n}
            </p>
          ))}
          <p className="text-slate-500">Muat ulang halaman untuk melihat data baru.</p>
        </div>
      )}
    </div>
  );
}
