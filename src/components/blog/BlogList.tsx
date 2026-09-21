'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ARTIKEL, KATEGORI, pautan, type Artikel, type Kategori } from '@/lib/blog';

/**
 * Penapis kategori dan carian.
 *
 * Penapisan berlaku di sisi klien atas senarai yang sudah dihidangkan
 * pelayan, jadi setiap kad artikel berada dalam HTML pada muatan pertama.
 * Perangkak dan enjin jawapan nampak kesemuanya; penapis hanya mengubah apa
 * yang dilihat pembaca.
 */

function Jam() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function Blok({ warna, tinggi }: { warna: [string, string]; tinggi: string }) {
  return (
    <div
      className={`rounded-[14px] ${tinggi}`}
      style={{ background: `linear-gradient(135deg, ${warna[0]} 0%, ${warna[1]} 100%)` }}
      aria-hidden="true"
    />
  );
}

function Kad({ a }: { a: Artikel }) {
  return (
    <article>
      <Link href={pautan(a)} className="block group">
        <Blok warna={a.warna} tinggi="h-[168px]" />
        <p className="mt-4 text-[11px] font-semibold tracking-[0.12em] uppercase text-brand-purple">
          {a.kategori}
        </p>
        <h3
          style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          className="mt-2 text-[21px] leading-snug font-semibold tracking-tight text-ink group-hover:text-brand-purple transition"
        >
          {a.tajuk}
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{a.ringkasan}</p>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ink-faint">
          <Jam /> {a.minit} min bacaan
        </p>
      </Link>
    </article>
  );
}

export default function BlogList() {
  const [kategori, setKategori] = useState<Kategori | null>(null);
  const [cari, setCari] = useState('');

  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return ARTIKEL.filter((a) => {
      const padanKategori = !kategori || a.kategori === kategori;
      const padanCarian = !q || (a.tajuk + ' ' + a.ringkasan).toLowerCase().includes(q);
      return padanKategori && padanCarian;
    });
  }, [kategori, cari]);

  const menapis = !!kategori || !!cari.trim();
  const pilihan = hasil.find((a) => a.pilihanEditor) ?? hasil[0];
  const selebihnya = menapis ? hasil : hasil.filter((a) => a.slug !== pilihan?.slug);

  return (
    <>
      <div className="mt-10 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setKategori(null)}
            className={`text-sm font-medium rounded-full px-4 py-2 transition ${
              kategori === null
                ? 'bg-brand-purple text-white'
                : 'bg-[#F3F2F7] text-ink-muted hover:text-ink'
            }`}
          >
            Semua
          </button>
          {KATEGORI.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKategori(kategori === k ? null : k)}
              className={`text-sm font-medium rounded-full px-4 py-2 transition ${
                kategori === k
                  ? 'bg-brand-purple text-white'
                  : 'bg-[#F3F2F7] text-ink-muted hover:text-ink'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-[260px]">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari artikel"
            aria-label="Cari artikel"
            className="input pl-10 pr-4"
            style={{ minHeight: 44 }}
          />
        </div>
      </div>

      {hasil.length === 0 && (
        <p className="mt-14 text-[15px] text-ink-muted">
          Tiada artikel yang sepadan lagi. Cuba kata yang lebih sedikit, atau pilih Semua.
        </p>
      )}

      {!menapis && pilihan && (
        <section className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <Link href={pautan(pilihan)} className="block group">
            <Blok warna={pilihan.warna} tinggi="h-[280px] sm:h-[320px]" />
          </Link>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-brand-purple">
              Pilihan editor · {pilihan.kategori}
            </p>
            <h2
              style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
              className="mt-3 text-[32px] sm:text-[38px] leading-[1.08] font-semibold tracking-tight text-ink"
            >
              <Link href={pautan(pilihan)} className="hover:text-brand-purple transition">
                {pilihan.tajuk}
              </Link>
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">{pilihan.ringkasan}</p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p className="flex items-center gap-1.5 text-[13px] text-ink-faint">
                <Jam /> {pilihan.minit} min bacaan
              </p>
              <Link
                href={pautan(pilihan)}
                className="text-sm font-medium text-brand-purple hover:underline"
              >
                Baca artikel &rarr;
              </Link>
            </div>
          </div>
        </section>
      )}

      {selebihnya.length > 0 && (
        <section className="mt-20">
          {!menapis && (
            <h2
              style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
              className="text-[30px] sm:text-[36px] leading-tight font-semibold tracking-tight text-ink"
            >
              Untuk kelas seterusnya
            </h2>
          )}
          <div className={`grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 ${menapis ? '' : 'mt-10'}`}>
            {selebihnya.map((a) => (
              <Kad key={a.slug} a={a} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
