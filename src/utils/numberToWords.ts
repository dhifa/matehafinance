const units = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

export function terbilang(n: number): string {
    if (n === 0) return "Nol";
    if (n < 12) return units[n];
    if (n < 20) return units[n - 10] + " Belas";
    if (n < 100) return units[Math.floor(n / 10)] + " Puluh " + units[n % 10];
    if (n < 200) return "Seratus " + terbilang(n - 100);
    if (n < 1000) return units[Math.floor(n / 100)] + " Ratus " + terbilang(n % 100);
    if (n < 2000) return "Seribu " + terbilang(n - 1000);
    if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " Ribu " + terbilang(n % 1000);
    if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + " Juta " + terbilang(n % 1000000);
    if (n < 1000000000000) return terbilang(Math.floor(n / 1000000000)) + " Milyar " + terbilang(n % 1000000000);
    return "Angka terlalu besar";
}
