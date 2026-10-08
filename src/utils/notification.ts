export interface PopupNotificationState {
  isOpen: boolean;
  type?: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  autoCloseMs?: number;
}

type NotificationListener = (state: PopupNotificationState | null) => void;
let globalListener: NotificationListener | null = null;

export const setGlobalNotificationListener = (listener: NotificationListener | null) => {
  globalListener = listener;
};

export const showPopupNotification = (
  message: string,
  type: "success" | "warning" | "error" | "info" = "success",
  customTitle?: string,
  onConfirm?: () => void,
  autoCloseMs?: number
) => {
  const defaultTitles: Record<string, string> = {
    success: "Berhasil Disimpan",
    error: "Perhatian / Terjadi Kesalahan",
    warning: "Peringatan",
    info: "Pemberitahuan Sistem",
  };

  const title = customTitle || defaultTitles[type] || "Pemberitahuan";

  const popupState: PopupNotificationState = {
    isOpen: true,
    type,
    title,
    message,
    confirmText: "OK, Mengerti",
    onConfirm,
    autoCloseMs: autoCloseMs ?? (type === "success" ? 4000 : undefined),
  };

  if (globalListener) {
    globalListener(popupState);
  } else if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("app:show-notification", { detail: popupState })
    );
  }
};

export const notify = {
  success: (message: string, title?: string, onConfirm?: () => void) =>
    showPopupNotification(message, "success", title, onConfirm),
  error: (message: string, title?: string, onConfirm?: () => void) =>
    showPopupNotification(message, "error", title, onConfirm),
  warning: (message: string, title?: string, onConfirm?: () => void) =>
    showPopupNotification(message, "warning", title, onConfirm),
  info: (message: string, title?: string, onConfirm?: () => void) =>
    showPopupNotification(message, "info", title, onConfirm),
  popup: (state: Partial<PopupNotificationState> & { message: string }) => {
    const s: PopupNotificationState = {
      isOpen: true,
      type: state.type || "info",
      title: state.title || (state.type === "success" ? "Berhasil Disimpan" : "Pemberitahuan"),
      message: state.message,
      confirmText: state.confirmText || "OK, Mengerti",
      cancelText: state.cancelText,
      onConfirm: state.onConfirm,
      onCancel: state.onCancel,
      autoCloseMs: state.autoCloseMs,
    };
    if (globalListener) {
      globalListener(s);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("app:show-notification", { detail: s })
      );
    }
  },
};

// Safe fallback for window.alert in case any legacy call or browser block occurs
if (typeof window !== "undefined") {
  window.alert = (msg?: any) => {
    notify.info(String(msg ?? ""), "Pemberitahuan");
  };
}
