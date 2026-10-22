import React, { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsLeft, ChevronsRight, KeyRound, LogOut, Menu, X } from "lucide-react";
import type { TabType } from "../../types";

export interface NavItem {
  id: TabType;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavUser {
  username: string;
  role: string;
}

const NAV_GROUPS: { title: string; ids: TabType[] }[] = [
  { title: "Operasional", ids: ["sheets", "dashboard", "finance"] },
  { title: "Dokumen", ids: ["invoice", "quotation", "kwitansi", "clients"] },
  { title: "Tim & Gaji", ids: ["staff-payslips", "payslips", "users"] },
];

// Order used to pick the tabs shown in the mobile bottom bar
const MOBILE_PRIORITY: TabType[] = ["sheets", "dashboard", "invoice", "staff-payslips", "quotation", "kwitansi", "finance", "clients", "payslips", "users"];
const MOBILE_SLOTS = 4;

function groupItems(items: NavItem[]) {
  const groups = NAV_GROUPS.map((g) => ({ title: g.title, items: items.filter((i) => g.ids.includes(i.id)) })).filter((g) => g.items.length > 0);
  const grouped = new Set(NAV_GROUPS.flatMap((g) => g.ids));
  const rest = items.filter((i) => !grouped.has(i.id));
  if (rest.length > 0) groups.push({ title: "Lainnya", items: rest });
  return groups;
}

function roleBadgeClass(role: string) {
  if (role === "admin") return "bg-cyan-500/15 text-cyan-300 border-cyan-500/30";
  if (role === "finance") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
}

function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <div className={`shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-500 text-slate-950 font-extrabold flex items-center justify-center uppercase ${className}`}>
      {(name || "?").slice(0, 1)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop sidebar
// ---------------------------------------------------------------------------

export function Sidebar({
  items,
  activeTab,
  onSelect,
  collapsed,
  onToggleCollapsed,
  user,
  logo,
  onChangePassword,
  onLogout,
}: {
  items: NavItem[];
  activeTab: TabType;
  onSelect: (id: TabType) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  user: NavUser;
  logo: string;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const groups = groupItems(items);
  return (
    <aside
      className={`hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-slate-800/70 bg-[#0b0d12] transition-[width] duration-200 ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <div className={`flex items-center h-16 shrink-0 border-b border-slate-800/70 ${collapsed ? "justify-center px-2" : "px-5 gap-3"}`}>
        <img src={logo} alt="Mateha Production" className="w-9 h-9 object-contain shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-extrabold tracking-tight text-white truncate">Mateha Production</p>
            <p className="text-[11px] text-slate-500 truncate">Sistem Keuangan</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {groups.map((group) => (
          <div key={group.title}>
            {!collapsed ? (
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.title}</p>
            ) : (
              <div className="mx-auto mb-2 h-px w-8 bg-slate-800" />
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    id={`tab-${item.id}-trigger`}
                    onClick={() => onSelect(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`group w-full flex items-center rounded-xl text-sm transition cursor-pointer ${
                      collapsed ? "justify-center h-11" : "gap-3 px-3 h-10"
                    } ${
                      active
                        ? "bg-cyan-500/10 text-cyan-300 font-semibold ring-1 ring-inset ring-cyan-500/25"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-cyan-300" : "text-slate-500 group-hover:text-slate-300"}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-800/70 p-3 space-y-2">
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-xl bg-slate-900/70 border border-slate-800 p-2.5">
            <Avatar name={user.username} className="w-9 h-9 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">@{user.username}</p>
              <span className={`inline-block mt-0.5 px-1.5 py-px rounded border text-[10px] font-bold uppercase ${roleBadgeClass(user.role)}`}>{user.role}</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <Avatar name={user.username} className="w-9 h-9 text-sm" />
          </div>
        )}
        <div className={`flex ${collapsed ? "flex-col" : ""} gap-1.5`}>
          <button
            onClick={onChangePassword}
            id="btn-trigger-change-password-desktop"
            title="Ganti password"
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-medium text-slate-400 hover:text-cyan-300 hover:bg-slate-800/70 transition cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            {!collapsed && <span>Password</span>}
          </button>
          <button
            onClick={onLogout}
            id="btn-trigger-logout"
            title="Keluar"
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>Keluar</span>}
          </button>
        </div>
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition cursor-pointer"
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <><ChevronsLeft className="w-4 h-4" /><span>Ciutkan</span></>}
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mobile: top bar, bottom navigation and menu sheet
// ---------------------------------------------------------------------------

export function MobileTopBar({ title, logo, user, onOpenMenu }: { title: string; logo: string; user: NavUser; onOpenMenu: () => void }) {
  return (
    <header className="lg:hidden sticky top-0 z-30 h-14 flex items-center gap-3 px-4 border-b border-slate-800/70 bg-[#0b0d12]/95 backdrop-blur-xl">
      <img src={logo} alt="Mateha Production" className="w-8 h-8 object-contain shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-500 leading-tight">Mateha Production</p>
        <h1 className="text-[15px] font-bold text-white leading-tight truncate">{title}</h1>
      </div>
      <button onClick={onOpenMenu} aria-label="Akun & menu" className="cursor-pointer">
        <Avatar name={user.username} className="w-9 h-9 text-sm" />
      </button>
    </header>
  );
}

export function BottomNav({
  items,
  activeTab,
  onSelect,
  onOpenMenu,
  menuOpen,
}: {
  items: NavItem[];
  activeTab: TabType;
  onSelect: (id: TabType) => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const primary = [...items]
    .sort((a, b) => MOBILE_PRIORITY.indexOf(a.id) - MOBILE_PRIORITY.indexOf(b.id))
    .slice(0, MOBILE_SLOTS);
  const activeInMenu = !primary.some((p) => p.id === activeTab);

  const cell = (active: boolean) =>
    `relative flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-medium transition cursor-pointer ${
      active ? "text-cyan-300" : "text-slate-500 active:text-slate-300"
    }`;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/80 bg-[#0b0d12]/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex max-w-lg mx-auto">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeTab && !menuOpen;
          return (
            <button key={item.id} id={`mobile-tab-${item.id}-trigger`} onClick={() => onSelect(item.id)} className={cell(active)}>
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-cyan-400" />}
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[72px]">{item.shortLabel || item.label}</span>
            </button>
          );
        })}
        <button onClick={onOpenMenu} className={cell(menuOpen || activeInMenu)} aria-label="Semua menu">
          {(menuOpen || activeInMenu) && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-cyan-400" />}
          <Menu className="w-5 h-5" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}

export function MobileMenuSheet({
  open,
  onClose,
  items,
  activeTab,
  onSelect,
  user,
  onChangePassword,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  activeTab: TabType;
  onSelect: (id: TabType) => void;
  user: NavUser;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const groups = groupItems(items);

  return (
    <AnimatePresence>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute bottom-0 inset-x-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-slate-800 bg-[#0e1117] px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />

            <div className="flex items-center gap-3 rounded-2xl bg-slate-900/80 border border-slate-800 p-3 mb-4">
              <Avatar name={user.username} className="w-11 h-11 text-base" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">@{user.username}</p>
                <span className={`inline-block mt-0.5 px-1.5 py-px rounded border text-[10px] font-bold uppercase ${roleBadgeClass(user.role)}`}>{user.role}</span>
              </div>
              <button onClick={onClose} aria-label="Tutup" className="p-2 rounded-full text-slate-400 hover:bg-slate-800 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.title}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = item.id === activeTab;
                      return (
                        <button
                          key={item.id}
                          onClick={() => onSelect(item.id)}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium text-center transition cursor-pointer ${
                            active
                              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                              : "border-slate-800 bg-slate-900/60 text-slate-300 active:bg-slate-800"
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${active ? "text-cyan-300" : "text-slate-400"}`} />
                          <span className="leading-tight">{item.shortLabel || item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <button
                onClick={onChangePassword}
                id="btn-trigger-change-password-mobile"
                className="flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-800 bg-slate-900/60 text-sm text-slate-200 cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-slate-400" />
                Ganti Password
              </button>
              <button
                onClick={onLogout}
                className="flex items-center justify-center gap-2 h-11 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Keluar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
