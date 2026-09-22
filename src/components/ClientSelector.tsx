import React, { useState, useRef, useEffect } from "react";
import { Client } from "../types";
import { Users, Search, Plus, Building, User, Phone, ChevronDown, Check, X } from "lucide-react";
import { resolveClientDetails } from "../utils/clientHelper";

interface ClientSelectorProps {
  clients: Client[];
  onSelectClient: (client: Client) => void;
  onOpenClientManager: () => void;
  selectedClientName?: string;
}

export default function ClientSelector({
  clients,
  onSelectClient,
  onOpenClientManager,
  selectedClientName,
}: ClientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const details = resolveClientDetails(c);
    return (
      details.company.toLowerCase().includes(q) ||
      details.pic.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  });

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 transition cursor-pointer"
        title="Pilih data dari Database Klien untuk isi otomatis"
      >
        <Users className="w-3.5 h-3.5" />
        <span className="whitespace-nowrap">👤 Pilih dari Database Klien</span>
        <ChevronDown className="w-3 h-3 text-cyan-400/80" />
      </button>

      {isOpen && (
        <div className="absolute right-0 sm:left-0 top-full mt-1.5 w-72 sm:w-80 bg-[#0f1218] border border-slate-750 rounded-2xl shadow-2xl z-50 p-2 text-slate-100 text-xs animate-in fade-in zoom-in-95">
          {/* Search box inside dropdown */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari perusahaan atau PIC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
            {filtered.map((client) => {
              const details = resolveClientDetails(client);
              const isSelected = selectedClientName && (
                details.company.toLowerCase() === selectedClientName.toLowerCase() ||
                details.pic.toLowerCase() === selectedClientName.toLowerCase() ||
                client.name.toLowerCase() === selectedClientName.toLowerCase()
              );
              const hasBoth = details.company && details.pic && details.company !== details.pic;

              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    onSelectClient(client);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left p-2 rounded-xl transition flex items-start justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold"
                      : "hover:bg-slate-900/80 text-slate-300"
                  }`}
                >
                  <div className="truncate flex-1">
                    <p className="font-semibold text-white truncate text-xs flex items-center gap-1.5">
                      <Building className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate">{details.company || details.pic}</span>
                    </p>
                    {hasBoth && (
                      <p className="text-[11px] text-slate-300 truncate flex items-center gap-1 mt-0.5">
                        <User className="w-2.5 h-2.5 text-cyan-400/80 shrink-0" />
                        <span>PIC: {details.pic}</span>
                      </p>
                    )}
                    {details.phone && (
                      <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="w-2.5 h-2.5 shrink-0" />
                        <span>{details.phone}</span>
                      </p>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />}
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-4 text-center text-slate-500 text-xs">
                {search ? "Klien tidak ditemukan" : "Belum ada klien tersimpan"}
              </div>
            )}
          </div>

          {/* Bottom Action */}
          <div className="pt-2 mt-1 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] text-slate-500">{clients.length} klien terdaftar</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenClientManager();
              }}
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Kelola Klien</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
