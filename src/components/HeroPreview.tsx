/**
 * Pratonton produk pada halaman utama.
 *
 * Dibina dengan HTML dan CSS, bukan sebagai imej. Sebabnya tiga: ia tajam
 * pada semua ketumpatan skrin, ia tidak menambah muat turun beratus kilobait
 * pada halaman yang menjadi kesan pertama, dan teks di dalamnya boleh dibaca
 * oleh enjin carian.
 *
 * Data di dalamnya ialah contoh ilustrasi bagi antara muka Kuizen sendiri.
 */
export default function HeroPreview() {
  const pasukan = [
    { n: 1, nama: "Pasukan Orion", skor: 920, warna: "#F5B301" },
    { n: 2, nama: "Pasukan Nova", skor: 860, warna: "#9AA1B1" },
    { n: 3, nama: "Pasukan Zenith", skor: 780, warna: "#C97B3C" },
    { n: 4, nama: "Pasukan Delta", skor: 710, warna: "#D9D6E8" },
    { n: 5, nama: "Pasukan Komet", skor: 680, warna: "#D9D6E8" },
  ];

  const pilihan = [
    { k: "A", teks: "Membina struktur halaman web", bg: "#EDE9FB", ring: "#7057D9" },
    { k: "B", teks: "Mengurus pangkalan data", bg: "#F3F2F7", ring: "#8A8F9E" },
    { k: "C", teks: "Mereka bentuk grafik", bg: "#E9F5EE", ring: "#3F9E6A" },
    { k: "D", teks: "Mengendalikan rangkaian komputer", bg: "#FCEDE4", ring: "#D2743A" },
  ];

  return (
    <div className="rounded-[18px] bg-white border border-hairline shadow-[0_18px_48px_-24px_rgba(28,24,60,0.35)] overflow-hidden">
      <div className="flex">
        <aside className="hidden sm:block w-[132px] shrink-0 border-r border-hairline p-3">
          <div className="text-[11px] font-semibold text-ink px-2 py-1.5">Kuizen</div>
          <ul className="mt-2 space-y-0.5 text-[11px] text-ink-muted">
            {["Kelas", "Kuiz langsung", "Tugasan", "Bahan", "Pasukan", "Laporan"].map((m, i) => (
              <li
                key={m}
                className={
                  "px-2 py-1.5 rounded-md " +
                  (i === 1 ? "bg-[#EDE9FB] text-brand-purple font-medium" : "")
                }
              >
                {m}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex-1 min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between text-[11px] text-ink-faint">
            <span>Soalan 3 daripada 10</span>
            <span className="code-chip">PIN 472 918</span>
          </div>
          <p className="mt-3 text-[15px] sm:text-[17px] font-semibold text-ink">
            Apakah fungsi HTML?
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pilihan.map((p) => (
              <div
                key={p.k}
                className="rounded-lg p-2.5 flex items-start gap-2"
                style={{ background: p.bg }}
              >
                <span
                  className="mt-0.5 shrink-0 w-5 h-5 rounded-full text-[10px] font-semibold text-white flex items-center justify-center"
                  style={{ background: p.ring }}
                >
                  {p.k}
                </span>
                <span className="text-[12px] leading-snug text-ink">{p.teks}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="hidden lg:block w-[196px] shrink-0 border-l border-hairline p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-ink">Papan pendahulu</span>
            <span className="text-[10px] text-ink-faint">12 peserta</span>
          </div>
          <ul className="mt-3 space-y-2">
            {pasukan.map((t) => (
              <li key={t.n} className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-4 h-4 rounded-full text-[9px] font-semibold text-white flex items-center justify-center"
                  style={{ background: t.warna }}
                >
                  {t.n}
                </span>
                <span className="flex-1 truncate text-ink">{t.nama}</span>
                <span className="tabular-nums text-ink-muted">{t.skor}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-[#EDE9FB] p-2.5 text-[11px] leading-snug text-ink">
            Kerja berpasukan membawa lebih jauh.
          </div>
        </aside>
      </div>
    </div>
  );
}
