const units = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

/** Words for 1..999 999 999 999; "" for 0 (so round numbers don't end in "Nol"). */
function words(n: number): string {
  if (n === 0) return "";
  if (n < 12) return units[n];
  if (n < 20) return `${units[n - 10]} Belas`;
  if (n < 100) return `${units[Math.floor(n / 10)]} Puluh ${words(n % 10)}`;
  if (n < 200) return `Seratus ${words(n - 100)}`;
  if (n < 1000) return `${units[Math.floor(n / 100)]} Ratus ${words(n % 100)}`;
  if (n < 2000) return `Seribu ${words(n - 1000)}`;
  if (n < 1_000_000) return `${words(Math.floor(n / 1000))} Ribu ${words(n % 1000)}`;
  if (n < 1_000_000_000) return `${words(Math.floor(n / 1_000_000))} Juta ${words(n % 1_000_000)}`;
  return `${words(Math.floor(n / 1_000_000_000))} Miliar ${words(n % 1_000_000_000)}`;
}

/** Indonesian number in words, e.g. 2 500 000 → "Dua Juta Lima Ratus Ribu". */
export function terbilang(n: number): string {
  const value = Math.floor(Math.abs(Number(n) || 0));
  if (value === 0) return "Nol";
  if (value >= 1_000_000_000_000) return "Angka terlalu besar";
  return words(value).replace(/\s+/g, " ").trim();
}
