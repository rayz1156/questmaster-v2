/**
 * Bahagian harga landing page (tiket V2-006).
 *
 * Server component: semua baris kad dibina di pelayan daripada barisKad()
 * (src/lib/kadHarga.ts) yang membaca HAD_PELAN dan HARGA_PELAN. Tiada angka
 * ditulis terus di sini. Hanya suis Bulanan/Tahunan (SuisBil) dan paparan
 * harga Pro (HargaProBil) ialah komponen klien.
 *
 * Tiga kad sahaja: Percuma, Pro, Institusi. Pelan dalaman lain tidak
 * dipaparkan di landing page. null pada HAD_PELAN dipaparkan sebagai
 * "Tanpa had". Ciri yang tidak termasuk ditanda dengan ikon kelabu, bukan
 * teks merah.
 */
import Link from "next/link";
import { TEKS_LANDING, type Bahasa } from "@/lib/landing-copy";
import { HARGA_PELAN, type Pelan } from "@/lib/pelan";
import { barisKad, formatRM, type BarisKad } from "@/lib/kadHarga";
import SuisBil, { HargaProBil } from "./SuisBil";

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

/** Teks nilai untuk satu baris kad, dalam bahasa halaman. */
function teksBaris(b: BarisKad, pelan: Pelan, bahasa: Bahasa): string {
  const t = TEKS_LANDING[bahasa].harga;
  if (b.kunci === "sijil") return t.sijilNilai[pelan];
  if (b.angka !== null) {
    switch (b.kunci) {
      case "kelas":
        return t.templat.kelas.replace("{n}", b.angka);
      case "pesertaSeKelas":
      case "pemainSeSesi":
        return t.templat.peserta.replace("{n}", b.angka);
      case "aktiviti":
        return t.templat.aktiviti.replace("{n}", b.angka);
      case "papan":
        return t.templat.papan.replace("{n}", b.angka);
      default:
        return b.angka;
    }
  }
  if (b.termasuk === true) return t.ya;
  if (b.termasuk === false) return t.tidak;
  return t.tanpaHad;
}

function IkonSemak({ ok }: { ok: boolean }) {
  // Tanda tidak termasuk menggunakan ikon kelabu, bukan teks merah.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={ok ? "text-brand-purple shrink-0" : "text-gray-300 shrink-0"}
    >
      {ok ? <path d="M20 6L9 17l-5-5" /> : <path d="M18 6L6 18M6 6l12 12" />}
    </svg>
  );
}

function BarisKadView({ b, pelan, bahasa }: { b: BarisKad; pelan: Pelan; bahasa: Bahasa }) {
  const t = TEKS_LANDING[bahasa].harga;
  const nilai = teksBaris(b, pelan, bahasa);
  const semak = b.termasuk !== null;
  const kelabu = b.termasuk === false;
  return (
    <li className="flex items-start gap-2.5 py-2">
      {semak ? (
        <span className="mt-0.5">
          <IkonSemak ok={b.termasuk === true} />
        </span>
      ) : null}
      <span className={`text-[14px] leading-relaxed ${kelabu ? "text-ink-faint" : "text-ink-muted"}`}>
        <span className="font-medium text-ink">{t.barisLabel[b.kunci]}:</span>{" "}
        {nilai}
      </span>
    </li>
  );
}

function KadHarga({ pelan, bahasa }: { pelan: Pelan; bahasa: Bahasa }) {
  const t = TEKS_LANDING[bahasa].harga;
  const baris = barisKad(pelan);
  const pro = pelan === "pro";
  const popular = pro;

  let kepala: React.ReactNode;
  if (pelan === "free") {
    kepala = (
      <p className="text-[34px] leading-none font-semibold tracking-tight text-ink">
        {formatRM(HARGA_PELAN.free.tahunan)}
      </p>
    );
  } else if (pro) {
    kepala = (
      <HargaProBil
        tahunanSebulan={formatRM(HARGA_PELAN.pro.tahunanSebulan)}
        bulanan={formatRM(HARGA_PELAN.pro.bulanan)}
        dibilkan={t.dibilkanTahunan.replace("{harga}", formatRM(HARGA_PELAN.pro.tahunan))}
        sebulan={t.sebulan}
      />
    );
  } else {
    kepala = (
      <div>
        <p className="text-[34px] leading-none font-semibold tracking-tight text-ink">
          {formatRM(HARGA_PELAN.institution.tahunan)}{" "}
          <span className="text-[15px] font-normal text-ink-muted">{t.seTahun}</span>
        </p>
        <p className="mt-2 text-[13px] text-ink-faint">
          {t.untukKerusi.replace("{n}", String(HARGA_PELAN.institution.kerusi))}
        </p>
      </div>
    );
  }

  const butang =
    pelan === "free" ? (
      <Link href="/register" className="btn-quiet w-full justify-center">{t.butang.mula}</Link>
    ) : pelan === "pro" ? (
      <Link href="/naik-taraf?pelan=pro" className="btn-primary w-full">{t.butang.pro}</Link>
    ) : (
      <Link href="/naik-taraf?pelan=institution" className="btn-quiet w-full justify-center">{t.butang.institusi}</Link>
    );

  return (
    <div
      className={`rounded-xl p-6 flex flex-col ${
        popular
          ? "border-2 border-violet-500 bg-white shadow-[0_8px_30px_rgba(124,58,237,0.08)]"
          : "border border-hairline bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[17px] font-semibold text-ink">{t.pelanNama[pelan]}</h3>
        {popular ? (
          <span className="rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 px-2.5 py-0.5 text-[11px] font-medium text-white">
            {t.popular}
          </span>
        ) : null}
      </div>
      <div className="mt-5">{kepala}</div>
      <ul className="mt-5 flex-1 divide-y divide-hairline/60">
        {baris.map((b) => (
          <BarisKadView key={b.kunci} b={b} pelan={pelan} bahasa={bahasa} />
        ))}
      </ul>
      <div className="mt-6">{butang}</div>
    </div>
  );
}

export default function BahagianHarga({ bahasa }: { bahasa: Bahasa }) {
  const t = TEKS_LANDING[bahasa].harga;
  const pelanKad: Pelan[] = ["free", "pro", "institution"];
  return (
    <section id="harga" className="px-6 sm:px-8 pt-14 pb-16 border-t border-hairline">
      <div className="mx-auto w-full max-w-[960px]">
        <h2
          style={DISPLAY}
          className="text-[30px] sm:text-[38px] leading-tight font-semibold tracking-tight text-ink text-center"
        >
          {t.tajuk}
        </h2>
        <p className="mt-3 text-[16px] text-ink-muted text-center">{t.sub}</p>
        <SuisBil label={t.suis}>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {pelanKad.map((p) => (
              <KadHarga key={p} pelan={p} bahasa={bahasa} />
            ))}
          </div>
        </SuisBil>
        <p className="mt-6 text-center text-[13px] text-ink-faint">{t.notaVideo}</p>
      </div>
    </section>
  );
}
