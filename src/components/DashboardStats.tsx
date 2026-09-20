import React from "react";
import { EventProject, formatRupiah } from "../types";
import { calculateProjectBudget } from "../utils/math";
import { Award, Users, Wallet, CalendarRange, TrendingUp } from "lucide-react";

interface DashboardStatsProps {
  projects: EventProject[];
  isGuestView?: boolean;
}

export default function DashboardStats({ projects, isGuestView = false }: DashboardStatsProps) {
  // Month and Year selector states
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = React.useState<number>(today.getMonth());
  const [selectedYear, setSelectedYear] = React.useState<number>(today.getFullYear());
  const [viewMode, setViewMode] = React.useState<"akumulasi" | "per-bulan">("per-bulan");

  // Compute global metric across all projects based on Realisasi (Actual) values
  const stats = React.useMemo(() => {
    let totalRevenue = 0;
    let totalAccommodationCosts = 0;
    let totalMatehaProfit = 0;
    let totalStaffFees = 0;
    
    // Filter projects based on selected period if in "per-bulan" mode
    const filteredProjects = viewMode === "per-bulan" 
      ? projects.filter(proj => {
          const projectDates = proj.dates && proj.dates.length > 0
            ? proj.dates
            : (proj.date ? [proj.date] : []);
          
          return projectDates.some((d) => {
            const parts = d.split("-");
            // If date format is YYYY-MM-DD
            if (parts.length >= 2) {
                const yr = parseInt(parts[0], 10);
                const mo = parseInt(parts[1], 10) - 1;
                return yr === selectedYear && mo === selectedMonth;
            }
            // fallback for other formats
            const dateObj = new Date(d);
            return dateObj.getFullYear() === selectedYear && dateObj.getMonth() === selectedMonth;
          });
        })
      : projects;

    filteredProjects.forEach((proj) => {
      const calcReal = calculateProjectBudget(proj.realisasi);
      totalRevenue += calcReal.totalIncome;
      totalAccommodationCosts += calcReal.totalAccommodation;
      totalMatehaProfit += calcReal.matehaProfit;
      totalStaffFees += calcReal.totalFeeDistribution;
    });

    return {
      totalRevenue,
      totalAccommodationCosts,
      totalMatehaProfit,
      totalStaffFees,
      projectCount: filteredProjects.length
    };
  }, [projects, selectedMonth, selectedYear, viewMode]);

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as "akumulasi" | "per-bulan")}
          className="bg-slate-950 border border-slate-800 text-xs text-white p-2 rounded-lg"
        >
          <option value="per-bulan">Per Bulan</option>
          <option value="akumulasi">Akumulasi Semua</option>
        </select>
        
        {viewMode === "per-bulan" && (
          <>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 text-xs text-white p-2 rounded-lg"
            >
              {[
                "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", 
                "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
              ].map((m, idx) => (
                <option key={idx} value={idx}>{m}</option>
              ))}
            </select>
             <input
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 text-xs text-white p-2 rounded-lg w-20"
            />
          </>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div id="stat-card-total-projects" className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px] shadow-lg shadow-black/20 hover:border-slate-700/80 transition duration-200">
        <div className="flex justify-between items-start">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Project</span>
          <CalendarRange className="w-4 h-4 text-slate-500" />
        </div>
        <div className="text-3xl font-mono font-bold text-slate-100 tracking-tight mt-3">
          {stats.projectCount}
        </div>
      </div>

      <div id="stat-card-total-revenue" className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px] shadow-lg shadow-black/20 hover:border-slate-700/80 transition duration-200">
        <div className="flex justify-between items-start">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Omset Realisasi</span>
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-xl font-mono font-bold text-emerald-400 tracking-tight mt-3">
          {formatRupiah(stats.totalRevenue)}
        </div>
      </div>

      <div id="stat-card-total-accommodation" className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px] shadow-lg shadow-black/20 hover:border-slate-700/80 transition duration-200">
        <div className="flex justify-between items-start">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Biaya Akomodasi</span>
          <Wallet className="w-4 h-4 text-rose-400" />
        </div>
        <div className="text-xl font-mono font-bold text-rose-400 tracking-tight mt-3">
          {isGuestView ? "****" : formatRupiah(stats.totalAccommodationCosts)}
        </div>
      </div>

      <div id="stat-card-total-staff-fees" className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px] shadow-lg shadow-black/20 hover:border-slate-700/80 transition duration-200">
        <div className="flex justify-between items-start">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Gaji Staf & Talent</span>
          <Users className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="text-xl font-mono font-bold text-cyan-400 tracking-tight mt-3">
          {formatRupiah(stats.totalStaffFees)}
        </div>
      </div>

      <div id="stat-card-total-profit" className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px] shadow-lg shadow-black/20 hover:border-slate-700/80 transition duration-200">
        <div className="flex justify-between items-start">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Profit Bersih Mateha</span>
          <Award className="w-4 h-4 text-amber-500" />
        </div>
        <div className="text-xl font-mono font-bold text-amber-400 tracking-tight mt-3">
          {formatRupiah(stats.totalMatehaProfit)}
        </div>
      </div>
    </div>
    </div>
  );
}
