export const INDONESIAN_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export const INDONESIAN_MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agt", "Sep", "Okt", "Nov", "Des"
];

/**
 * Formats an array of YYYY-MM-DD strings into a readable Indonesian string
 * representation, supporting ranges (11-12) or discrete days (12, 14, 15).
 */
export function formatMultiDates(dates: string[]): string {
  if (!dates || dates.length === 0) {
    return "Belum ditentukan";
  }

  // Remove duplicates and sort chronologically
  const uniqueDates = Array.from(new Set(dates)).sort();
  
  if (uniqueDates.length === 1) {
    return formatDateString(uniqueDates[0]);
  }

  // Parse dates
  const parsed = uniqueDates.map(d => {
    const [yearStr, monthStr, dayStr] = d.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed
    const day = parseInt(dayStr, 10);
    
    // Construct local midnight date to prevent timezone conversion drift issues
    const time = new Date(year, month, day).getTime();
    return { dateStr: d, year, month, day, time };
  });

  // Check if they are all in the same month and same year
  const first = parsed[0];
  const sameMonthYear = parsed.every(p => p.year === first.year && p.month === first.month);

  if (sameMonthYear) {
    const monthName = INDONESIAN_MONTHS[first.month];
    const year = first.year;
    
    // Sort day numbers
    const days = parsed.map(p => p.day).sort((a, b) => a - b);
    
    // Check if contiguous range
    let isContiguous = true;
    for (let i = 1; i < days.length; i++) {
      if (days[i] !== days[i - 1] + 1) {
        isContiguous = false;
        break;
      }
    }

    if (isContiguous) {
      return `${days[0]}-${days[days.length - 1]} ${monthName} ${year}`;
    } else {
      // Discrete days e.g. 12, 14, 15 November 2026
      return `${days.join(", ")} ${monthName} ${year}`;
    }
  }

  // Check if same year but different months
  const sameYear = parsed.every(p => p.year === first.year);
  if (sameYear) {
    const year = first.year;
    // Check if it's a contiguous range spanning months (e.g. 30 Nov - 2 Dec)
    let isContiguous = true;
    const sortedByTime = [...parsed].sort((a, b) => a.time - b.time);
    const dayMs = 24 * 60 * 60 * 1000;
    
    for (let i = 1; i < sortedByTime.length; i++) {
      const diff = sortedByTime[i].time - sortedByTime[i - 1].time;
      // Allow slight timezone shift differences by checking broad range (20 to 28 hrs)
      const hourMs = 60 * 60 * 1000;
      if (diff > dayMs + 4 * hourMs || diff < dayMs - 4 * hourMs) {
        isContiguous = false;
        break;
      }
    }

    if (isContiguous) {
      const start = sortedByTime[0];
      const end = sortedByTime[sortedByTime.length - 1];
      return `${start.day} ${INDONESIAN_MONTHS_SHORT[start.month]} - ${end.day} ${INDONESIAN_MONTHS[end.month]} ${year}`;
    } else {
      // Just map each day with its short month
      const items = sortedByTime.map(p => `${p.day} ${INDONESIAN_MONTHS_SHORT[p.month]}`);
      return `${items.join(", ")} ${year}`;
    }
  }

  // Spans multiple years
  let isContiguous = true;
  const sortedByTime = [...parsed].sort((a, b) => a.time - b.time);
  const dayMs = 24 * 60 * 60 * 1000;
  for (let i = 1; i < sortedByTime.length; i++) {
    const diff = sortedByTime[i].time - sortedByTime[i - 1].time;
    const hourMs = 60 * 60 * 1000;
    if (diff > dayMs + 4 * hourMs || diff < dayMs - 4 * hourMs) {
      isContiguous = false;
      break;
    }
  }

  if (isContiguous) {
    const start = sortedByTime[0];
    const end = sortedByTime[sortedByTime.length - 1];
    return `${start.day} ${INDONESIAN_MONTHS_SHORT[start.month]} ${start.year} - ${end.day} ${INDONESIAN_MONTHS_SHORT[end.month]} ${end.year}`;
  } else {
    // Just map full date strings
    return sortedByTime.map(p => `${p.day} ${INDONESIAN_MONTHS_SHORT[p.month]} ${p.year}`).join(", ");
  }
}

/**
 * Single date formatter to Indonesian e.g., "2026-12-18" -> "18 Desember 2026"
 */
export function formatDateString(dateStr: string): string {
  if (!dateStr) return "Belum ditentukan";
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  if (!yearStr || !monthStr || !dayStr) return dateStr;

  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  if (isNaN(year) || isNaN(monthIdx) || isNaN(day) || monthIdx < 0 || monthIdx > 11) {
    return dateStr;
  }

  return `${day} ${INDONESIAN_MONTHS[monthIdx]} ${year}`;
}

/**
 * Parses an Indonesian human-readable date string (e.g., "13 November 2025" or
 * "11-12 November 2025" or "12, 14, 15 November 2025") into an array of ISO date strings (['YYYY-MM-DD'])
 */
export function parseIndonesianDateText(text: string): string[] {
  if (!text || text === "Belum ditentukan") return [];

  // 1. Find year
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  // 2. Find month
  let monthIndex = 10; // Default to November
  const lowerText = text.toLowerCase();
  for (let i = 0; i < INDONESIAN_MONTHS.length; i++) {
    if (lowerText.includes(INDONESIAN_MONTHS[i].toLowerCase()) || 
        lowerText.includes(INDONESIAN_MONTHS_SHORT[i].toLowerCase())) {
      monthIndex = i;
      break;
    }
  }

  const resultDates: string[] = [];

  // Helper to construct YYYY-MM-DD
  const makeDateStr = (d: number) => {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };

  // 3. Find if it represents a hyphenated range, e.g. "11-12" or "11- 12"
  const rangeMatch = text.replace(/\s+/g, "").match(/(\d+)-(\d+)/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (!isNaN(start) && !isNaN(end) && start < end && end <= 31) {
      for (let d = start; d <= end; d++) {
        resultDates.push(makeDateStr(d));
      }
      return resultDates;
    }
  }

  // 4. Otherwise, find all discrete integers (like 12, 14, 15) before the year itself
  const digits = text.match(/\b\d+\b/g);
  if (digits) {
    // Filter out the year if it matches
    const dayNumbers = digits
      .map(d => parseInt(d, 10))
      .filter(num => num !== year && num > 0 && num <= 31);

    dayNumbers.forEach(d => {
      resultDates.push(makeDateStr(d));
    });
  }

  // Keep unique sorted
  return Array.from(new Set(resultDates)).sort();
}

/**
 * Returns the earliest timestamp (ms) representing the start date of an event,
 * or 0 if none is available.
 */
export function getProjectEarliestTimestamp(proj: { date: string; dates?: string[]; createdAt: string }): number {
  if (proj.dates && proj.dates.length > 0) {
    const sorted = [...proj.dates].sort();
    return new Date(sorted[0]).getTime();
  }
  const parsed = parseIndonesianDateText(proj.date);
  if (parsed.length > 0) {
    return new Date(parsed[0]).getTime();
  }
  if (proj.createdAt) {
    return new Date(proj.createdAt).getTime();
  }
  return 0;
}


