import React, { useState, useMemo, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, Trash2, CalendarDays } from "lucide-react";
import { formatMultiDates, INDONESIAN_MONTHS } from "../utils/date";

interface MultiDatePickerProps {
  selectedDates: string[]; // YYYY-MM-DD
  onChange: (dates: string[], formatted: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

export default function MultiDatePicker({
  selectedDates = [],
  onChange,
  disabled = false,
  label,
  placeholder = "Pilih tanggal..."
}: MultiDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calendar view state (initially showing first selected date, or today)
  const initialDate = useMemo(() => {
    if (selectedDates && selectedDates.length > 0) {
      const valid = selectedDates.filter(d => d && !isNaN(Date.parse(d)));
      if (valid.length > 0) {
        const sorted = [...valid].sort();
        return new Date(sorted[0]);
      }
    }
    return new Date();
  }, [selectedDates]);

  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth()); // 0-11

  // Handle outside click to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync calendar view when it opens
  useEffect(() => {
    if (isOpen) {
      if (selectedDates && selectedDates.length > 0) {
        const valid = selectedDates.filter(d => d && !isNaN(Date.parse(d)));
        if (valid.length > 0) {
          const sorted = [...valid].sort();
          const d = new Date(sorted[0]);
          const y = d.getFullYear();
          const m = d.getMonth();
          if (!isNaN(y) && !isNaN(m)) {
            setCurrentYear(y);
            setCurrentMonth(m);
            return;
          }
        }
      }
      const today = new Date();
      setCurrentYear(today.getFullYear());
      setCurrentMonth(today.getMonth());
    }
  }, [isOpen, selectedDates]);

  // Generate days array for calendar grid
  // Week starts on Monday (Monday = 0, Sunday = 6)
  const calendarDays = useMemo(() => {
    // First day of current month
    const firstDayDate = new Date(currentYear, currentMonth, 1);
    let firstDayIndex = firstDayDate.getDay(); // 0 is Sunday, 1 is Monday...
    // Convert to Monday-start indexing: Mon=0, Tue=1, ..., Sun=6
    firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Total days in current month
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Total days in previous month (for padding)
    const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();

    const daysList = [];

    // Prior month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      // representing previous month YYYY-MM-DD
      const m = currentMonth === 0 ? 11 : currentMonth - 1;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      daysList.push({ dayNum, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      daysList.push({ dayNum, dateStr, isCurrentMonth: true });
    }

    // Next month padding (make grid full 42 slots if needed, or 35 slots depending on span)
    const totalSlots = daysList.length > 35 ? 42 : 35;
    const nextPaddingCount = totalSlots - daysList.length;
    for (let dayNum = 1; dayNum <= nextPaddingCount; dayNum++) {
      const m = currentMonth === 11 ? 0 : currentMonth + 1;
      const y = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      daysList.push({ dayNum, dateStr, isCurrentMonth: false });
    }

    return daysList;
  }, [currentYear, currentMonth]);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Toggle date selection
  const handleDayClick = (dateStr: string) => {
    let updated: string[];
    if (selectedDates.includes(dateStr)) {
      updated = selectedDates.filter(d => d !== dateStr);
    } else {
      updated = [...selectedDates, dateStr];
    }
    const formatted = formatMultiDates(updated);
    onChange(updated, formatted);
  };

  // Range helper: Autofill days between min and max selected dates
  const handleAutofillRange = () => {
    if (selectedDates.length < 2) return;
    const sorted = [...selectedDates].sort();
    const minDate = new Date(sorted[0]);
    const maxDate = new Date(sorted[sorted.length - 1]);

    const rangeList: string[] = [];
    const temp = new Date(minDate);

    while (temp <= maxDate) {
      const yearStr = temp.getFullYear();
      const monthStr = String(temp.getMonth() + 1).padStart(2, "0");
      const dayStr = String(temp.getDate()).padStart(2, "0");
      rangeList.push(`${yearStr}-${monthStr}-${dayStr}`);
      temp.setDate(temp.getDate() + 1);
    }

    const formatted = formatMultiDates(rangeList);
    onChange(rangeList, formatted);
  };

  const handleClear = () => {
    onChange([], "Belum ditentukan");
  };

  // Year list for fast navigation
  const yearsOptions = useMemo(() => {
    const list = [];
    const base = new Date().getFullYear();
    for (let i = base - 3; i <= base + 10; i++) {
      list.push(i);
    }
    return list;
  }, []);

  const formattedDisplay = useMemo(() => {
    return formatMultiDates(selectedDates);
  }, [selectedDates]);

  return (
    <div className={`relative text-left ${isOpen ? "z-50" : "z-10"}`} ref={containerRef}>
      {label && (
        <label className="block text-slate-400 font-bold mb-1 uppercase tracking-wider text-[10px] font-sans">
          {label}
        </label>
      )}

      {/* Selector Trigger Input */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full bg-slate-950/80 border ${
          isOpen ? "border-cyan-500/80 ring-1 ring-cyan-500/30" : "border-slate-800"
        } rounded-xl p-2.5 text-slate-100 flex items-center justify-between cursor-pointer transition focus-within:ring-1 focus-within:ring-cyan-500/50 ${
          disabled ? "opacity-50 cursor-not-allowed text-slate-500 bg-slate-950" : ""
        }`}
      >
        <span className={`text-xs truncate font-sans ${selectedDates.length > 0 ? "text-slate-100 font-bold" : "text-slate-500"}`}>
          {selectedDates.length > 0 ? formattedDisplay : placeholder}
        </span>
        <CalendarIcon className={`w-4 h-4 ml-2 transition flex-shrink-0 ${isOpen ? "text-cyan-400" : "text-slate-500"}`} />
      </div>

      {isOpen && (
        <div className="absolute right-0 md:left-0 mt-2 z-50 w-80 bg-[#0f1115] border border-slate-800 rounded-2xl shadow-2xl p-4 space-y-3">
          {/* Calendar Month & Year Navigation Row */}
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 px-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center space-x-1.5">
              {/* Select Month */}
              <select
                value={currentMonth}
                onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
                className="bg-slate-950/90 border border-slate-850 rounded-lg py-1 px-2 text-[11px] text-slate-100 font-bold focus:outline-none cursor-pointer"
              >
                {INDONESIAN_MONTHS.map((m, idx) => (
                  <option key={idx} value={idx} className="bg-slate-950">
                    {m}
                  </option>
                ))}
              </select>

              {/* Select Year */}
              <select
                value={currentYear}
                onChange={(e) => setCurrentYear(parseInt(e.target.value))}
                className="bg-slate-950/90 border border-slate-850 rounded-lg py-1 px-2 text-[11px] text-slate-100 font-bold focus:outline-none cursor-pointer"
              >
                {yearsOptions.map((y) => (
                  <option key={y} value={y} className="bg-slate-950">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 px-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Weekday indicator row (Mon - Sun) */}
          <div className="grid grid-cols-7 text-center gap-1">
            {["Se", "Se", "Ra", "Ka", "Ju", "Sa", "Mi"].map((dayName, idx) => (
              <span key={idx} className="text-[10px] font-bold text-slate-500 uppercase tracking-wider py-1 font-sans">
                {dayName}
              </span>
            ))}
          </div>

          {/* Calendar Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              const isSelected = selectedDates.includes(day.dateStr);
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => handleDayClick(day.dateStr)}
                  className={`text-xxs font-semibold h-7 flex items-center justify-center rounded-lg transition select-none cursor-pointer p-0 font-mono ${
                    !day.isCurrentMonth ? "opacity-30 text-slate-600 hover:opacity-60" : ""
                  } ${
                    isSelected
                      ? "bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 font-extrabold shadow-md shadow-cyan-950/40 transform scale-95 border border-cyan-300/30"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                  title={day.dateStr}
                >
                  {day.dayNum}
                </button>
              );
            })}
          </div>

          {/* Quick Helper presets */}
          <div className="flex items-center justify-between text-[10px] bg-slate-950/40 p-2 rounded-xl border border-slate-900/40">
            <div className="flex items-center space-x-1.5 text-slate-400">
              <CalendarDays className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                <b className="text-white">{selectedDates.length}</b> Hari terpilih
              </span>
            </div>

            <div className="flex space-x-1">
              {selectedDates.length >= 2 && (
                <button
                  type="button"
                  onClick={handleAutofillRange}
                  className="px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-md font-extrabold transition text-[9px] uppercase tracking-wider cursor-pointer"
                  title="Otomatis mengisi tanggal di antara tanggal pertama & terakhir"
                >
                  Hubungkan Rentang
                </button>
              )}
              <button
                type="button"
                onClick={handleClear}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-rose-400 border border-slate-800 rounded-md font-semibold transition text-[9px] uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Kosongkan</span>
              </button>
            </div>
          </div>

          {/* Quick confirmation */}
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-bold p-1.5 rounded-lg text-xxs transition text-center cursor-pointer font-sans"
            >
              OK, Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
