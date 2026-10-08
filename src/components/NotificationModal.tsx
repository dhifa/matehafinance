import React, { useEffect } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { PopupNotificationState } from "../utils/notification";

export type { PopupNotificationState };

interface NotificationModalProps {
  popup: PopupNotificationState | null;
  onClose: () => void;
}

export default function NotificationModal({
  popup,
  onClose,
}: NotificationModalProps) {
  useEffect(() => {
    if (!popup?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (popup.onCancel) popup.onCancel();
        onClose();
      } else if (e.key === "Enter" && !popup.cancelText) {
        if (popup.onConfirm) popup.onConfirm();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [popup?.isOpen, popup?.cancelText, popup?.onConfirm, popup?.onCancel, onClose]);

  // Handle optional autoClose
  useEffect(() => {
    if (!popup?.isOpen || !popup.autoCloseMs) return;

    const timer = setTimeout(() => {
      onClose();
    }, popup.autoCloseMs);

    return () => clearTimeout(timer);
  }, [popup?.isOpen, popup?.autoCloseMs, onClose]);

  if (!popup || !popup.isOpen) return null;

  const type = popup.type || "info";

  const config = {
    success: {
      icon: <CheckCircle2 className="w-10 h-10 text-emerald-400" />,
      bgIcon: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
      buttonBg: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50",
      borderColor: "border-emerald-500/40",
      accentBar: "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600",
      badgeText: "SUCCESS",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    warning: {
      icon: <AlertTriangle className="w-10 h-10 text-amber-400" />,
      bgIcon: "bg-amber-500/15 border-amber-500/30 text-amber-400",
      buttonBg: "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-950/50",
      borderColor: "border-amber-500/40",
      accentBar: "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600",
      badgeText: "PERINGATAN",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    },
    error: {
      icon: <AlertCircle className="w-10 h-10 text-rose-400" />,
      bgIcon: "bg-rose-500/15 border-rose-500/30 text-rose-400",
      buttonBg: "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50",
      borderColor: "border-rose-500/40",
      accentBar: "bg-gradient-to-r from-rose-500 via-red-400 to-rose-600",
      badgeText: "PERHATIAN",
      badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    },
    info: {
      icon: <Info className="w-10 h-10 text-sky-400" />,
      bgIcon: "bg-sky-500/15 border-sky-500/30 text-sky-400",
      buttonBg: "bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-950/50",
      borderColor: "border-sky-500/40",
      accentBar: "bg-gradient-to-r from-sky-500 via-cyan-400 to-blue-600",
      badgeText: "INFORMASI",
      badgeColor: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    },
  }[type];

  return (
    <div
      className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => {
        if (popup.onCancel) popup.onCancel();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-sm sm:max-w-md bg-slate-900/95 border ${config.borderColor} rounded-2xl shadow-2xl p-6 sm:p-7 text-center overflow-hidden transform transition-all scale-100 animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top colored accent line */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${config.accentBar}`} />

        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            if (popup.onCancel) popup.onCancel();
            onClose();
          }}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          title="Tutup Notifikasi"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Badge */}
        <div className="flex justify-center mb-3">
          <span className={`text-[10px] font-mono font-black tracking-widest px-2.5 py-0.5 rounded-full border ${config.badgeColor}`}>
            {config.badgeText}
          </span>
        </div>

        {/* Big Icon */}
        <div className={`mx-auto w-16 h-16 rounded-2xl ${config.bgIcon} border flex items-center justify-center mb-4 shadow-inner`}>
          {config.icon}
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-black text-white tracking-tight mb-2">
          {popup.title}
        </h3>

        {/* Message */}
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6 whitespace-pre-line text-center">
          {popup.message}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3">
          {popup.cancelText && (
            <button
              type="button"
              onClick={() => {
                if (popup.onCancel) popup.onCancel();
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer border border-slate-700"
            >
              {popup.cancelText}
            </button>
          )}

          <button
            type="button"
            autoFocus
            onClick={() => {
              if (popup.onConfirm) popup.onConfirm();
              onClose();
            }}
            className={`w-full py-2.5 px-6 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer active:scale-95 ${config.buttonBg}`}
          >
            {popup.confirmText || "OK, Mengerti"}
          </button>
        </div>
      </div>
    </div>
  );
}
