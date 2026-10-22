import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  KeyRound, 
  Lock, 
  Eye, 
  EyeOff, 
  Check, 
  AlertCircle, 
  Loader2, 
  X,
  ShieldCheck
} from "lucide-react";
import { auth, db } from "../utils/backend";
import { 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider 
} from "../lib/auth";
import { doc, updateDoc } from "../lib/firestore";
import { UserProfile } from "../types";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onNotify: (message: string, type?: "success" | "error") => void;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  userProfile,
  onNotify
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleResetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setErrorMsg(null);
  };

  const handleClose = () => {
    handleResetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      setErrorMsg("Sesi login Anda tidak valid atau telah berakhir. Silakan login ulang.");
      return;
    }

    if (!currentPassword) {
      setErrorMsg("Masukkan kata sandi lama Anda saat ini.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg("Kata sandi baru minimal harus 6 karakter!");
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg("Kata sandi baru tidak boleh sama dengan kata sandi lama!");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Konfirmasi kata sandi baru tidak cocok!");
      return;
    }

    setLoading(true);

    try {
      // 1. Re-authenticate user with current password
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // 2. Update to new password in Firebase Auth
      await updatePassword(currentUser, newPassword);

      // 3. Update password in Firestore database so Admin table stays in sync
      try {
        await updateDoc(doc(db, "users", currentUser.uid), {
          password: newPassword,
          updatedAt: new Date().toISOString()
        });
      } catch (firestoreErr) {
        console.warn("Could not sync password to users Firestore collection:", firestoreErr);
      }

      onNotify("Kata sandi Anda berhasil diperbarui! Gunakan kata sandi baru untuk login selanjutnya.", "success");
      handleClose();
    } catch (err: any) {
      console.error("Change password error:", err);
      const errCode = (err?.code || "").toLowerCase();
      const errMsg = (err?.message || "").toLowerCase();

      if (
        errCode.includes("wrong-password") ||
        errCode.includes("invalid-credential") ||
        errMsg.includes("wrong-password") ||
        errMsg.includes("invalid-credential")
      ) {
        setErrorMsg("Kata sandi lama yang Anda masukkan salah. Periksa kembali dan coba lagi.");
      } else if (errCode.includes("weak-password")) {
        setErrorMsg("Kata sandi baru terlalu lemah. Gunakan kombinasi huruf dan angka.");
      } else if (errCode.includes("requires-recent-login")) {
        setErrorMsg("Sesi login Anda telah usang demi keamanan. Harap keluar (logout) dan login kembali sebelum mengubah kata sandi.");
      } else {
        setErrorMsg(err.message || "Gagal mengubah kata sandi. Silakan coba lagi.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="w-full max-w-md bg-[#0f1115] border border-slate-850 rounded-2xl shadow-2xl p-4 sm:p-6 text-left relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar Accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 via-teal-500 to-indigo-500" />

          {/* Close Button */}
          <button
            onClick={handleClose}
            disabled={loading}
            className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Modal Title */}
          <div className="flex items-center space-x-3 mb-5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Ganti Kata Sandi Akun
              </h3>
              <p className="text-xs text-slate-400">
                Ubah password login untuk akun <span className="text-cyan-400 font-mono font-bold">@{userProfile?.username || "user"}</span>
              </p>
            </div>
          </div>

          {/* Error Message Banner */}
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-start space-x-2.5 text-xs text-rose-400 leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMsg}</span>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* 1. Kata Sandi Lama */}
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                Kata Sandi Saat Ini (Lama) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  required
                  placeholder="Masukkan kata sandi lama Anda"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-9 pr-10 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition font-mono"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 2. Kata Sandi Baru */}
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                Kata Sandi Baru <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  placeholder="Minimal 6 karakter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-9 pr-10 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition font-mono"
                />
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 3. Konfirmasi Kata Sandi Baru */}
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                Ulangi Kata Sandi Baru <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  placeholder="Ketik ulang kata sandi baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-9 pr-10 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition font-mono"
                />
                <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword && confirmPassword && (
                <div className="mt-1.5 flex items-center space-x-1.5 text-[11px]">
                  {newPassword === confirmPassword ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <Check className="w-3.5 h-3.5" /> Kata sandi cocok
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Konfirmasi belum cocok
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword || newPassword !== confirmPassword}
                className="flex items-center space-x-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-lg shadow-cyan-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Simpan Password Baru</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
