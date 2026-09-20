import React from "react";
import { EventProject, formatRupiah } from "../types";
import { calculateProjectBudget } from "../utils/math";
import { BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

interface FinancialChartProps {
  projects: EventProject[];
}

export default function FinancialChart({ projects }: FinancialChartProps) {
  const [selectedYear] = React.useState<number>(new Date().getFullYear());
  const [chartView, setChartView] = React.useState<"bulanan" | "event">("bulanan");

  const formatCompactRupiah = (value: number) => {
    if (value === 0) return "Rp 0";
    const absVal = Math.abs(value);
    if (absVal >= 1000000000) return `Rp ${(value / 1000000000).toFixed(1).replace(/\.0$/, "")} M`;
    if (absVal >= 1000000) return `Rp ${(value / 1000000).toFixed(0)} Jt`;
    if (absVal >= 1000) return `Rp ${(value / 1000).toFixed(0)} Rb`;
    return `Rp ${value}`;
  };

  const monthlyTrendData = React.useMemo(() => {
    const monthsData = Array.from({ length: 12 }, (_, i) => ({
      name: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][i],
      omset: 0,
      profit: 0,
    }));
    projects.forEach((proj) => {
      const dates = proj.dates && proj.dates.length > 0 ? proj.dates : (proj.date ? [proj.date] : []);
      if (dates.length === 0) return;
      const firstDate = dates[0];
      const parts = firstDate.split("-");
      let yr = parts.length >= 2 ? parseInt(parts[0], 10) : new Date(firstDate).getFullYear();
      let mo = parts.length >= 2 ? parseInt(parts[1], 10) - 1 : new Date(firstDate).getMonth();
      if (yr === selectedYear && mo >= 0 && mo < 12) {
        const calcReal = calculateProjectBudget(proj.realisasi);
        monthsData[mo].omset += calcReal.totalIncome;
        monthsData[mo].profit += calcReal.matehaProfit;
      }
    });
    return monthsData;
  }, [projects, selectedYear]);

  const eventTrendData = React.useMemo(() => {
    const sorted = [...projects].sort((a, b) => {
      const datesA = a.dates && a.dates.length > 0 ? a.dates : (a.date ? [a.date] : []);
      const datesB = b.dates && b.dates.length > 0 ? b.dates : (b.date ? [b.date] : []);
      return datesA.length === 0 ? 1 : datesB.length === 0 ? -1 : datesA[0].localeCompare(datesB[0]);
    });
    return sorted.map((proj) => {
      const calcReal = calculateProjectBudget(proj.realisasi);
      return {
        name: proj.name.length > 15 ? proj.name.substring(0, 15) + "..." : proj.name,
        fullName: proj.name,
        omset: Math.round(calcReal.totalIncome),
        profit: Math.round(calcReal.matehaProfit),
      };
    }).slice(-15);
  }, [projects]);

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <span>Grafik Performa Keuangan & Tren Profit</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            Visualisasi riwayat performa omset dan keuntungan bersih Mateha Production
          </p>
        </div>
        <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl">
          <button onClick={() => setChartView("bulanan")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition duration-150 cursor-pointer ${chartView === "bulanan" ? "bg-slate-800/80 text-white shadow-sm border border-slate-700/60" : "text-slate-400 hover:text-slate-200"}`}>
            <span>📅</span>
            <span>Tren Bulanan ({selectedYear})</span>
          </button>
          <button onClick={() => setChartView("event")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition duration-150 cursor-pointer ${chartView === "event" ? "bg-slate-800/80 text-white shadow-sm border border-slate-700/60" : "text-slate-400 hover:text-slate-200"}`}>
            <span>🎈</span>
            <span>Tren Per-Event ({eventTrendData.length})</span>
          </button>
        </div>
      </div>
      <div className="w-full h-[320px] bg-slate-950/20 rounded-xl border border-slate-850/50 p-2 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartView === "bulanan" ? monthlyTrendData : eventTrendData} margin={{ top: 15, right: 15, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={{ stroke: '#334155', strokeWidth: 1 }} />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={{ stroke: '#334155', strokeWidth: 1 }} tickFormatter={formatCompactRupiah} />
            <Tooltip content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const dataObj = payload[0].payload;
                  return (
                    <div className="bg-slate-950/95 border border-slate-800 p-3.5 rounded-xl shadow-2xl backdrop-blur-md">
                      <p className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">{dataObj.fullName || label}</p>
                      <div className="space-y-1.5 text-xs text-left">
                        {payload.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-6 font-mono">
                            <span className="flex items-center gap-1.5 font-sans" style={{ color: item.color }}>
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.name}:
                            </span>
                            <span className="font-bold text-slate-100">{formatRupiah(item.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              }} />
            <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
            <Line name="Omset" type="monotone" dataKey="omset" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
            <Line name="Profit Event" type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 7, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-850 flex flex-wrap gap-x-8 gap-y-3 justify-between text-[11px] text-slate-400 font-sans">
        {chartView === "bulanan" ? (
          <>
            <div>
              <span>Rata-rata Omset Bulanan: </span>
              <span className="font-semibold font-mono text-slate-250">{formatRupiah(monthlyTrendData.reduce((acc, d) => acc + d.omset, 0) / 12)}</span>
            </div>
            <div>
              <span>Bulan dengan Keuntungan Tertinggi: </span>
              <span className="font-semibold font-mono text-amber-400">
                {(() => {
                  const maxMonth = [...monthlyTrendData].sort((a, b) => b.profit - a.profit)[0];
                  return maxMonth && maxMonth.profit > 0 ? `${maxMonth.name} (${formatRupiah(maxMonth.profit)})` : "-";
                })()}
              </span>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>Total Proyek di dalam Grafik: </span>
              <span className="font-semibold text-slate-250">{eventTrendData.length} Kegiatan</span>
            </div>
            <div>
              <span>Rata-rata Profit Bersih per Kegiatan: </span>
              <span className="font-semibold font-mono text-amber-400">
                {eventTrendData.length > 0 ? formatRupiah(eventTrendData.reduce((acc, d) => acc + d.profit, 0) / eventTrendData.length) : "Rp 0"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
