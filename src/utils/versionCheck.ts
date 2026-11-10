import { confirmDialog } from "./notification";

/**
 * Tells an open tab when a newer version of the app has been deployed, so
 * people don't keep running old code (e.g. old browser dialogs) after an update.
 * It compares the hashed bundle name in the live page with the one this tab loaded.
 */
const CHECK_EVERY_MS = 5 * 60 * 1000;
const BUNDLE = /\/assets\/index-[\w-]+\.js/;

function loadedBundle(): string | null {
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))) {
    const match = BUNDLE.exec(s.getAttribute("src") || "");
    if (match) return match[0];
  }
  return null;
}

export function startVersionCheck(): void {
  const current = loadedBundle();
  if (!current) return; // dev server: nothing to compare
  let dismissed: string | null = null;
  let asking = false;

  const check = async () => {
    if (asking || document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const live = BUNDLE.exec(await res.text())?.[0];
      if (!live || live === current || live === dismissed) return;
      asking = true;
      const reload = await confirmDialog(
        "Aplikasi baru saja diperbarui. Muat ulang halaman supaya memakai versi terbaru. Simpan dulu pekerjaan yang belum tersimpan.",
        { title: "Versi baru tersedia", confirmText: "Muat ulang sekarang", cancelText: "Nanti", type: "info" }
      );
      asking = false;
      if (reload) window.location.reload();
      else dismissed = live;
    } catch {
      // Offline or server busy: try again later
    }
  };

  window.setInterval(check, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
