import React, { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "../lib/auth";
import { auth, db } from "../utils/backend";
import { doc, getDoc } from "../lib/firestore";
import { motion } from "motion/react";
import { 
  KeyRound, 
  User, 
  Loader2, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  Lock,
  Eye, 
  EyeOff
} from "lucide-react";

interface LoginScreenProps {
  onSuccess: () => void;
}

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const getCleanEmailAndUsername = (rawInput: string) => {
    const trimmed = rawInput.trim().toLowerCase();
    if (trimmed.includes("@")) {
      const uname = trimmed.split("@")[0];
      return { email: trimmed, username: uname };
    }
    return { email: `${trimmed}@mateha.local`, username: trimmed };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedInput = username.trim();
    const cleanPassword = password.trim();

    if (!trimmedInput || !cleanPassword) {
      setErrorMsg("Username/Email dan Password tidak boleh kosong!");
      return;
    }

    if (cleanPassword.length < 6) {
      setErrorMsg("Password minimal harus berisikan 6 karakter!");
      return;
    }

    setLoading(true);
    const { email } = getCleanEmailAndUsername(trimmedInput);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, cleanPassword);
      
      // Check if user status is nonaktif
      try {
        const userDocRef = doc(db, "users", userCredential.user.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const uData = userSnap.data();
          if (uData?.status === "nonaktif") {
            await signOut(auth);
            setErrorMsg("Akun Anda berstatus NONAKTIF oleh Administrator. Silakan hubungi Admin untuk mengaktifkan kembali akses Anda.");
            setLoading(false);
            return;
          }
        }
      } catch (checkErr) {
        console.warn("Could not check user status doc:", checkErr);
      }

      setSuccessMsg("Berhasil masuk! Selamat bekerja...");
      setTimeout(() => {
        onSuccess();
      }, 600);
    } catch (err: any) {
      console.error(err);
      
      const errCode = (err?.code || "").toLowerCase();
      const errMessage = (err?.message || "").toLowerCase();
      
      let friendlyError = "Terjadi kendala saat login. Silakan periksa kembali data Anda.";
      
      if (
        errCode.includes("invalid-credential") || 
        errMessage.includes("invalid-credential") ||
        errCode.includes("wrong-password") || 
        errMessage.includes("wrong-password") ||
        errCode.includes("user-not-found") || 
        errMessage.includes("user-not-found")
      ) {
        friendlyError = "Username/Email atau Kata Sandi salah. Pendaftaran akun anggota tim baru hanya dapat dilakukan oleh Administrator sistem.";
      } else if (errCode.includes("invalid-email") || errMessage.includes("invalid-email")) {
        friendlyError = "Format username atau email tidak valid!";
      } else if (err?.message) {
        friendlyError = err.message;
      }
      setErrorMsg(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080a0f] flex items-center justify-center px-4 py-12 text-slate-100 selection:bg-cyan-500/20 selection:text-white relative overflow-hidden">
      
      {/* Background Decorative Ambient Gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-emerald-500/5 blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-cyan-500/5 blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#0c0e12]/90 border border-slate-900/90 backdrop-blur-2xl p-7 sm:p-8 rounded-3xl shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 via-cyan-500 to-indigo-500 p-0.5 mb-3 shadow-xl">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-cyan-400" />
            </div>
          </div>
          
          <h2 className="text-xl font-black tracking-tight text-white font-sans uppercase">
            MATEHA PRODUCTION
          </h2>
          <p className="text-xs text-slate-500 font-mono tracking-wide mt-1 uppercase">
            Secure Platform Authorization
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left text-xs">
          <div>
            <label className="block text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1.5 font-bold">
              Username atau Email
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="Masukkan username atau email akun"
                className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-3 pl-11 pr-4 text-slate-100 font-sans leading-relaxed text-sm focus:outline-none transition focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1.5 font-bold">
              Kata Sandi (Password)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <KeyRound className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="Masukkan kata sandi"
                className="w-full bg-[#080a0f] border border-slate-800 focus:border-cyan-500 rounded-xl py-3 pl-11 pr-11 text-slate-100 font-sans leading-relaxed text-sm focus:outline-none transition focus:ring-1 focus:ring-cyan-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-300 cursor-pointer focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error and Success states */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl leading-relaxed text-[11px] font-semibold text-left">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl leading-relaxed text-[11px] font-semibold text-left flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold py-3 px-4 rounded-xl shadow-lg transition active:scale-98 flex items-center justify-center space-x-2 text-xs uppercase tracking-wide cursor-pointer disabled:opacity-50 mt-3"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
            ) : (
              <>
                <span>Masuk ke Sistem</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security & Admin Notice: No self-registration on login page */}
        <div className="mt-6 pt-4 border-t border-slate-900/80 text-center">
          <div className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl flex items-start space-x-2.5 text-left">
            <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              <span className="font-bold text-slate-300">Pendaftaran Anggota Tim Terpusat:</span> Pendaftaran akun anggota tim baru hanya dapat dilakukan melalui menu <strong className="text-cyan-400">Admin</strong>. Silakan hubungi Administrator untuk penambahan akun baru.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

