"use client";

/**
 * KZ-053: komponen permainan Lumba Solo (halaman /solo/[code]).
 *
 * Fasa: muat -> maklumat -> lumba -> keputusan, semuanya dalam satu komponen
 * supaya permainan boleh dimainkan semula tanpa muat semula halaman.
 *
 * Keselamatan (tiket): markah sebenar sentiasa datang daripada pelayan;
 * kedudukan lawan kereta komputer hiasan sahaja dan tidak disimpan. Bunyi
 * dijana Web Audio; tiada fail audio. Semua teks melalui t().
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import {
  bukaSoalan,
  ciptaKeadaanLumba,
  JAWAB_TETINGKAH_MS,
  jawabBetul,
  jawabSalah,
  kedudukanPemain,
  KELAJUAN_KOMPUTER,
  langkahLumba,
  masaSoalanBerlalu,
  penaltiAktif,
  perluSoalan,
  TREK_PANJANG_M,
  tutupSoalan,
  type InputPemandu,
  type KeadaanLumba,
} from "./lumbaSoloEnjin";
import { lukisPemandangan } from "./lumbaSoloLukis";
import { BunyiLumba } from "./lumbaSoloBunyi";
import type { Pemandangan3D } from "./lumbaSolo3D";
import {
  SENARAI_TEMA,
  TEMA_LALAI,
  bacaTemaTersimpan,
  lajuPaparan,
  simpanTema,
  type TemaLumba,
} from "./lumbaSoloTema";

/** KZ-057: kunci i18n nama setiap tema. */
const NAMA_TEMA = {
  kereta: "solo.themeCar",
  basikal: "solo.themeBike",
  angkasa: "solo.themeSpace",
} as const;

/** Baris papan seperti dipulangkan API. */
interface BarisPapanUi {
  rank: number;
  runId: string;
  nickname: string;
  score: number;
  elapsedMs: number | null;
  finishedAt: string | null;
}

interface InfoSolo {
  title: string;
  totalQuestions: number;
  needLogin: boolean;
  leaderboard: BarisPapanUi[];
}

interface SoalanAktif {
  questionId: string;
  prompt: string;
  options: { key: string; text: string }[];
  index: number;
  total: number;
}

interface KeputusanLarian {
  score: number;
  correct: number;
  wrong: number;
  elapsedMs: number | null;
  rank: number | null;
  best: number | null;
}

interface Hud {
  masaMs: number;
  jarakM: number;
  kelajuan: number;
  hadLaju: number;
  kedudukan: number;
  soalanKe: number;
  soalanDijawab: number;
  markah: number;
  masaSoalan: number | null;
  diLuarJalan: boolean;
  penalti: boolean;
}

const HUD_AWAL: Hud = {
  masaMs: 0,
  jarakM: 0,
  kelajuan: 0,
  hadLaju: 120,
  kedudukan: 1,
  soalanKe: 0,
  soalanDijawab: 0,
  markah: 0,
  masaSoalan: null,
  diLuarJalan: false,
  penalti: false,
};

/** Format masa perlumbaan sebagai m:ss. */
function formatMasa(ms: number): string {
  const jumlahSaat = Math.floor(ms / 1000);
  const m = Math.floor(jumlahSaat / 60);
  const s = jumlahSaat % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function LumbaSolo({ kod }: { kod: string }) {
  const { t } = useBahasa();

  const [fasa, setFasa] = useState<"muat" | "maklumat" | "lumba" | "keputusan">("muat");
  const [info, setInfo] = useState<InfoSolo | null>(null);
  const [ralat, setRalat] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [bisu, setBisu] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [keputusan, setKeputusan] = useState<KeputusanLarian | null>(null);
  const [papanSegar, setPapanSegar] = useState<BarisPapanUi[]>([]);
  const [hud, setHud] = useState<Hud>(HUD_AWAL);
  const [soalan, setSoalan] = useState<SoalanAktif | null>(null);
  const [balasan, setBalasan] = useState<{ betul: boolean; mata: number } | null>(null);

  const enjinRef = useRef<KeadaanLumba>(ciptaKeadaanLumba());
  const inputRef = useRef<InputPemandu>({ kiri: false, kanan: false, pecut: false, brek: false });
  const tokenRef = useRef<{ runId: string; runToken: string } | null>(null);
  const totalRef = useRef(0);
  const soalanRef = useRef<SoalanAktif | null>(null);
  const menjawabRef = useRef(false);
  const markahRef = useRef(0);
  const selesaiRef = useRef(false);
  const tikRef = useRef(0);
  const bunyiRef = useRef<BunyiLumba | null>(null);
  const kanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** KZ-054: kanvas WebGL berasingan (konteks 2D dan WebGL tidak boleh berkongsi kanvas). */
  const kanvas3DRef = useRef<HTMLCanvasElement | null>(null);
  const paparan3DRef = useRef<Pemandangan3D | null>(null);
  const rafRef = useRef(0);
  /** KZ-054: sasaran offset lateral (meter) daripada jari/tetikus yang diseret; null bila tiada sentuhan. */
  const sasaranStereng = useRef<number | null>(null);
  const tekanStereng = useRef(false);
  /** Rujukan terkini hantarJawapan untuk pengendali kekunci (effect bergantung [fasa] sahaja). */
  const hantarRef = useRef<(pilihan: string | null) => Promise<void>>(async () => {});
  const [sentuhPeranti, setSentuhPeranti] = useState(false);
  const [petunjuk, setPetunjuk] = useState(false);
  /** KZ-057: tema permainan pilihan pemain (rupa sahaja; enjin dan markah sama). */
  const [tema, setTema] = useState<TemaLumba>(TEMA_LALAI);
  const temaRef = useRef<TemaLumba>(TEMA_LALAI);
  useEffect(() => {
    const tersimpan = bacaTemaTersimpan();
    temaRef.current = tersimpan;
    setTema(tersimpan);
  }, []);
  const pilihTema = useCallback((baharu: TemaLumba): void => {
    temaRef.current = baharu;
    setTema(baharu);
    simpanTema(baharu);
  }, []);

  const pastiBunyi = useCallback((): BunyiLumba => {
    if (!bunyiRef.current) bunyiRef.current = new BunyiLumba();
    return bunyiRef.current;
  }, []);

  /** Pengepala biasa: token larian (bila ada) + Bearer sesi (bila ada). */
  const pengepala = useCallback(async (): Promise<Record<string, string>> => {
    const h: Record<string, string> = {};
    if (tokenRef.current) h["x-run-token"] = tokenRef.current.runToken;
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) h["Authorization"] = "Bearer " + data.session.access_token;
    return h;
  }, []);

  /** Muat maklumat awam cabaran. */
  const muatInfo = useCallback(async (): Promise<void> => {
    setFasa("muat");
    setRalat(null);
    try {
      const hInfo = await pengepala();
      const res = await fetch(`/api/solo/${encodeURIComponent(kod)}`, { cache: "no-store", headers: hInfo });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRalat(typeof json.error === "string" ? json.error : t("solo.loadFailed"));
        setFasa("maklumat");
        return;
      }
      setInfo({
        title: String(json.title ?? ""),
        totalQuestions: Number(json.totalQuestions) || 0,
        needLogin: json.needLogin === true,
        leaderboard: Array.isArray(json.leaderboard) ? (json.leaderboard as BarisPapanUi[]) : [],
      });
      setPapanSegar(Array.isArray(json.leaderboard) ? (json.leaderboard as BarisPapanUi[]) : []);
      setFasa("maklumat");
    } catch {
      setRalat(t("solo.loadFailed"));
      setFasa("maklumat");
    }
  }, [kod, t, pengepala]);

  useEffect(() => {
    void muatInfo();
  }, [muatInfo]);

  /** Mula larian baharu (atau main semula). */
  const mulaLumba = useCallback(async (): Promise<void> => {
    setSibuk(true);
    setRalat(null);
    setBalasan(null);
    setKeputusan(null);
    try {
      const h = await pengepala();
      const res = await fetch(`/api/solo/${encodeURIComponent(kod)}/start`, {
        method: "POST",
        headers: { ...h, "content-type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRalat(typeof json.error === "string" ? json.error : t("solo.loadFailed"));
        setFasa("maklumat");
        return;
      }
      tokenRef.current = { runId: String(json.runId), runToken: String(json.runToken) };
      totalRef.current = Number(json.totalQuestions) || 0;
      markahRef.current = 0;
      soalanRef.current = null;
      menjawabRef.current = false;
      selesaiRef.current = false;
      tikRef.current = 0;
      enjinRef.current = ciptaKeadaanLumba();
      setSoalan(null);
      setHud(HUD_AWAL);
      setFasa("lumba");
    } catch {
      setRalat(t("solo.loadFailed"));
    } finally {
      setSibuk(false);
    }
  }, [kod, nickname, pengepala, t]);

  /** Hidangkan soalan seterusnya daripada pelayan. */
  const mintaSoalan = useCallback(async (): Promise<void> => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const res = await fetch(`/api/solo/${encodeURIComponent(kod)}/next`, {
        method: "POST",
        headers: await pengepala(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof json.error === "string") setRalat(json.error);
        return;
      }
      if (json.done === true) {
        // Bank soalan habis sebelum penamat: teruskan berlumba tanpa soalan.
        soalanRef.current = null;
        setSoalan(null);
        return;
      }
      const s: SoalanAktif = {
        questionId: String(json.questionId),
        prompt: String(json.prompt ?? ""),
        options: Array.isArray(json.options) ? (json.options as { key: string; text: string }[]) : [],
        index: Number(json.index) || 0,
        total: Number(json.total) || 0,
      };
      soalanRef.current = s;
      setSoalan(s);
      pastiBunyi().main("soalan");
    } catch {
      // Rangkaian terganggu: gelung akan cuba lagi pada soalan berikutnya.
    }
  }, [kod, pengepala, pastiBunyi]);

  /** Hantar jawapan; choice null bermakna tamat masa. */
  const hantarJawapan = useCallback(
    async (choice: string | null): Promise<void> => {
      const s = soalanRef.current;
      const token = tokenRef.current;
      if (!s || !token || menjawabRef.current) return;
      menjawabRef.current = true;
      soalanRef.current = null;
      setSoalan(null);
      try {
        const res = await fetch(`/api/solo/${encodeURIComponent(kod)}/answer`, {
          method: "POST",
          headers: { ...(await pengepala()), "content-type": "application/json" },
          body: JSON.stringify({ questionId: s.questionId, choice }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // 409 bermakna soalan ini sudah dijawab (atau larian tamat): teruskan.
          if (res.status !== 409 && typeof json.error === "string") setRalat(json.error);
          return;
        }
        const betul = json.correct === true;
        const mata = Number(json.points) || 0;
        markahRef.current = Number(json.score) || 0;
        const k = enjinRef.current;
        if (betul) jawabBetul(k);
        else jawabSalah(k);
        tutupSoalan(k);
        pastiBunyi().main(betul ? "betul" : "salah");
        setBalasan({ betul, mata });
        window.setTimeout(() => setBalasan(null), 1600);
      } catch {
        // Biarkan gelung cuba lagi; soalan semasa sudah ditutup.
      } finally {
        menjawabRef.current = false;
      }
    },
    [kod, pengepala, pastiBunyi],
  );
  hantarRef.current = hantarJawapan;

  /* ===== KZ-054: peranti sentuh dan petunjuk kawalan ===== */
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setSentuhPeranti(mq.matches);
  }, []);
  useEffect(() => {
    if (fasa !== "lumba") return;
    setPetunjuk(true);
    const id = window.setTimeout(() => setPetunjuk(false), 8000);
    return () => window.clearTimeout(id);
  }, [fasa]);

  /**
   * Stereng penuding gaya kayu bedik (KZ-056): kedudukan jari atau tetikus
   * dari tengah trek menentukan arah dan kekuatan stereng, bukan kedudukan
   * kereta. Penuding di tengah = tiada stereng, jadi kereta tetap hanyut di
   * selekoh. Jari: seret dan tahan (tahan = pecut). Tetikus: gerakkan sahaja;
   * klik dan tahan = pecut.
   */
  const seretStereng = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2; // -1..1
    const zonMati = 0.12;
    const a = Math.abs(rel) <= zonMati ? 0 : (Math.abs(rel) - zonMati) / (0.8 - zonMati);
    sasaranStereng.current = Math.sign(rel) * Math.min(1, a);
  };
  const hentiStereng = () => {
    tekanStereng.current = false;
    if (sasaranStereng.current === null) return;
    sasaranStereng.current = null;
    const i = inputRef.current;
    i.stereng = undefined;
    i.pecut = false;
  };
  const lepasTekan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") {
      hentiStereng();
      return;
    }
    // Tetikus: stereng ikut kedudukan diteruskan; hanya pecut dilepaskan.
    if (tekanStereng.current) inputRef.current.pecut = false;
    tekanStereng.current = false;
  };

  /** Tamatkan larian dan papar keputusan. */
  const tamatkan = useCallback(async (): Promise<void> => {
    soalanRef.current = null;
    setSoalan(null);
    const token = tokenRef.current;
    if (!token) return;
    try {
      const res = await fetch(`/api/solo/${encodeURIComponent(kod)}/finish`, {
        method: "POST",
        headers: await pengepala(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Larian mungkin sudah tamat di pelayan (selesai semasa): muat semula.
        void muatInfo();
        setFasa("maklumat");
        return;
      }
      setKeputusan({
        score: Number(json.score) || 0,
        correct: Number(json.correct) || 0,
        wrong: Number(json.wrong) || 0,
        elapsedMs: json.elapsedMs == null ? null : Number(json.elapsedMs),
        rank: json.rank == null ? null : Number(json.rank),
        best: json.best == null ? null : Number(json.best),
      });
      // Papan segar supaya kedudukan terkini dipapar (dan baris pemain disorot).
      try {
        const h2 = await pengepala();
        const res2 = await fetch(`/api/solo/${encodeURIComponent(kod)}`, { cache: "no-store", headers: h2 });
        const json2 = await res2.json().catch(() => ({}));
        if (res2.ok && Array.isArray(json2.leaderboard)) {
          setPapanSegar(json2.leaderboard as BarisPapanUi[]);
        }
      } catch {
        // Papan lalai memadai jika muat semula gagal.
      }
      pastiBunyi().main("penamat");
      setFasa("keputusan");
    } catch {
      setRalat(t("solo.loadFailed"));
      setFasa("maklumat");
    }
  }, [kod, muatInfo, pengepala, pastiBunyi, t]);

  /* ===== KZ-054: paparan 3D (dimuat dinamik; sandaran 2D jika WebGL tiada) ===== */
  useEffect(() => {
    if (fasa !== "lumba") return;
    let hidup = true;
    void import("./lumbaSolo3D")
      .then((m) => {
        const kanvas = kanvas3DRef.current;
        if (!hidup || !kanvas) return;
        try {
          paparan3DRef.current = new m.Pemandangan3D(kanvas, temaRef.current);
          kanvas.style.visibility = "visible";
          if (kanvasRef.current) kanvasRef.current.style.visibility = "hidden";
        } catch {
          paparan3DRef.current = null;
        }
      })
      .catch(() => {
        paparan3DRef.current = null;
      });
    return () => {
      hidup = false;
      paparan3DRef.current?.buang();
      paparan3DRef.current = null;
    };
  }, [fasa]);

  /* ===== Gelung utama ===== */
  useEffect(() => {
    if (fasa !== "lumba") return;
    let hidup = true;
    let sebelum = performance.now();
    let masaHud = 0;

    const bingkai = (t: number) => {
      if (!hidup) return;
      const dt = t - sebelum;
      sebelum = t;
      const k = enjinRef.current;

      if (!document.hidden) {
        // Stereng penuding: nilai analog terus ke enjin (tiada pembetulan automatik).
        const sasaran = sasaranStereng.current;
        const i = inputRef.current;
        // Kekunci stereng yang ditekan sentiasa mengatasi tetikus atau jari.
        i.stereng = sasaran === null || i.kiri || i.kanan ? undefined : sasaran;
        if (sasaran !== null && tekanStereng.current) i.pecut = true;
        langkahLumba(k, dt, inputRef.current);

        if (!selesaiRef.current) {
          if (perluSoalan(k) && totalRef.current > 0) {
            bukaSoalan(k);
            void mintaSoalan();
          }
          const berlalu = masaSoalanBerlalu(k);
          if (soalanRef.current && berlalu !== null) {
            if (berlalu >= JAWAB_TETINGKAH_MS) {
              // Tamat masa: kirim choice kosong, pelayan kira salah.
              void hantarJawapan(null);
            } else if (berlalu >= JAWAB_TETINGKAH_MS - 5000) {
              const saat = Math.floor(berlalu / 1000);
              if (saat > tikRef.current) {
                tikRef.current = saat;
                pastiBunyi().main("tik");
              }
            }
          }
          if (k.selesai) {
            selesaiRef.current = true;
            void tamatkan();
          }
        }

        // Lukis bingkai (canvas di luar React: tiada render semula per bingkai).
        const paparan3D = paparan3DRef.current;
        const kanvas3D = kanvas3DRef.current;
        const kanvas = paparan3D ? null : kanvasRef.current;
        if (paparan3D && kanvas3D) {
          paparan3D.ubahSaiz(
            kanvas3D.clientWidth || 320,
            kanvas3D.clientHeight || 240,
            window.devicePixelRatio || 1,
          );
          paparan3D.render({
            masaMs: k.masaMs,
            jarakM: k.jarakM,
            offsetM: k.offsetM,
            hadLaju: k.hadLaju,
            penalti: penaltiAktif(k),
            kelajuanKomputer: KELAJUAN_KOMPUTER,
            trekPanjangM: TREK_PANJANG_M,
            kelajuan: k.kelajuan,
            diLuarJalan: k.diLuarJalan,
            soalanAktif: k.soalanDibukaMs !== null,
          });
        }
        if (kanvas) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const lebarCss = kanvas.clientWidth || 320;
          const tinggiCss = kanvas.clientHeight || 240;
          if (kanvas.width !== Math.round(lebarCss * dpr)) {
            kanvas.width = Math.round(lebarCss * dpr);
          }
          if (kanvas.height !== Math.round(tinggiCss * dpr)) {
            kanvas.height = Math.round(tinggiCss * dpr);
          }
          const ctx = kanvas.getContext("2d");
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            lukisPemandangan(ctx, lebarCss, tinggiCss, {
              masaMs: k.masaMs,
              jarakM: k.jarakM,
              offsetM: k.offsetM,
              hadLaju: k.hadLaju,
              penalti: penaltiAktif(k),
              kelajuanKomputer: KELAJUAN_KOMPUTER,
              trekPanjangM: TREK_PANJANG_M,
            });
          }
        }

        // HUD dikemas kini ~6 kali sesaat, bukan setiap bingkai.
        if (t - masaHud > 160) {
          masaHud = t;
          setHud({
            masaMs: k.masaMs,
            jarakM: k.jarakM,
            kelajuan: k.kelajuan,
            hadLaju: k.hadLaju,
            kedudukan: kedudukanPemain(k),
            soalanKe: k.soalanKe,
            soalanDijawab: k.soalanDijawab,
            markah: markahRef.current,
            masaSoalan: masaSoalanBerlalu(k),
            diLuarJalan: k.diLuarJalan,
            penalti: penaltiAktif(k),
          });
        }
      }

      rafRef.current = requestAnimationFrame(bingkai);
    };

    rafRef.current = requestAnimationFrame(bingkai);
    return () => {
      hidup = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [fasa, mintaSoalan, hantarJawapan, tamatkan, pastiBunyi]);

  /* ===== Kekunci ===== */
  useEffect(() => {
    if (fasa !== "lumba") return;
    const setKekunci = (kod: string, turun: boolean) => {
      const i = inputRef.current;
      switch (kod) {
        case "ArrowLeft":
        case "a":
        case "A":
          i.kiri = turun;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          i.kanan = turun;
          break;
        case "ArrowUp":
        case "w":
        case "W":
          i.pecut = turun;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          i.brek = turun;
          break;
      }
    };
    const turun = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
      }
      // KZ-054/055: jawab soalan dengan kekunci nombor 1 hingga 9 sahaja. Huruf tidak
      // menjawab kerana A dan D juga kekunci stereng (stereng aktif semasa soalan).
      const s = soalanRef.current;
      if (s && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const n = Number(e.key);
        const pilihan = n <= s.options.length ? s.options[n - 1] : undefined;
        if (pilihan) {
          e.preventDefault();
          void hantarRef.current(pilihan.key);
          return;
        }
      }
      // Kekunci stereng mengambil alih daripada stereng tetikus.
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key) && !tekanStereng.current) {
        sasaranStereng.current = null;
      }
      setKekunci(e.key, true);
    };
    const naik = (e: KeyboardEvent) => setKekunci(e.key, false);
    window.addEventListener("keydown", turun);
    window.addEventListener("keyup", naik);
    return () => {
      window.removeEventListener("keydown", turun);
      window.removeEventListener("keyup", naik);
      inputRef.current = { kiri: false, kanan: false, pecut: false, brek: false };
    };
  }, [fasa]);

  /** Butang sentuh: tekan dan tahan. */
  const butangSentuh = (medan: "kiri" | "kanan" | "pecut" | "brek") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      inputRef.current[medan] = true;
    },
    onPointerUp: () => {
      inputRef.current[medan] = false;
    },
    onPointerLeave: () => {
      inputRef.current[medan] = false;
    },
    onPointerCancel: () => {
      inputRef.current[medan] = false;
    },
  });

  const tukarBisu = () => {
    const baharu = !bisu;
    setBisu(baharu);
    if (bunyiRef.current) bunyiRef.current.bisu = baharu;
  };

  /* ===== Skrin ===== */

  const paparPapan = (senarai: BarisPapanUi[], sorot?: number | null) => (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
      <p className="text-[13px] font-bold text-ink mb-2">{t("solo.leaderboard")}</p>
      {senarai.length === 0 ? (
        <p className="text-[12px] text-ink-faint">{t("solo.leaderboardEmpty")}</p>
      ) : (
        <ol className="space-y-1">
          {senarai.map((b) => (
            <li
              key={b.runId}
              className={`flex items-center gap-2 text-[13px] rounded-lg px-2 py-1 ${
                sorot != null && b.rank === sorot ? "bg-violet-100 font-semibold" : ""
              }`}
            >
              <span className="w-6 text-right text-ink-faint">{b.rank}</span>
              <span className="flex-1 truncate">{b.nickname}</span>
              <span className="text-ink-faint">{b.score}</span>
              <span className="w-14 text-right text-ink-faint">
                {b.elapsedMs == null ? "" : formatMasa(b.elapsedMs)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  if (fasa === "muat") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-[14px] text-ink-faint">{t("solo.loading")}</p>
      </div>
    );
  }

  if (fasa === "maklumat") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          {ralat && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700">
              {ralat}
            </div>
          )}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600">
              {t("solo.challenge")}
            </p>
            <h1 className="text-[22px] font-bold text-ink mt-1">
              {info?.title || t("solo.race")}
            </h1>
            <p className="text-[13px] text-ink-faint mt-1">
              {info ? t("solo.questionsCount", { n: info.totalQuestions }) : ""}
            </p>

            {info?.needLogin ? (
              <div className="mt-4 space-y-3">
                <p className="text-[13px] text-ink-faint">{t("solo.needLogin")}</p>
                <Link
                  href={`/login?next=${encodeURIComponent(`/solo/${kod}`)}`}
                  className="block text-center px-4 py-2.5 rounded-xl text-white text-[14px] font-semibold bg-gradient-to-r from-violet-600 to-indigo-600"
                >
                  {t("solo.loginButton")}
                </Link>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div>
                  <span className="text-[12px] font-semibold text-ink">{t("solo.chooseVehicle")}</span>
                  <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("solo.chooseVehicle")}>
                    {SENARAI_TEMA.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={tema === m.id}
                        onClick={() => pilihTema(m.id)}
                        className={`rounded-xl border px-2 py-2.5 text-center transition ${
                          tema === m.id
                            ? "border-violet-600 bg-violet-50 ring-2 ring-violet-200"
                            : "border-slate-300 bg-white hover:border-violet-300"
                        }`}
                      >
                        <span className="block text-[24px] leading-none" aria-hidden="true">
                          {m.simbol}
                        </span>
                        <span className="block mt-1 text-[12px] font-semibold text-ink">{t(NAMA_TEMA[m.id])}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="text-[12px] font-semibold text-ink">{t("solo.nickname")}</span>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={24}
                    placeholder={t("solo.nicknamePlaceholder")}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-violet-500"
                  />
                </label>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => void mulaLumba()}
                  className="w-full px-4 py-2.5 rounded-xl text-white text-[14px] font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50"
                >
                  {sibuk ? t("solo.starting") : t("solo.startButton")}
                </button>
              </div>
            )}
          </div>
          {info && paparPapan(info.leaderboard)}
        </div>
      </div>
    );
  }

  if (fasa === "keputusan") {
    const k = keputusan;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600">
              {t("solo.finishTitle")}
            </p>
            <p className="text-[40px] leading-none font-bold text-ink mt-2">
              {k ? k.score : 0}
            </p>
            <p className="text-[12px] text-ink-faint mt-1">{t("solo.points")}</p>

            <div className="grid grid-cols-2 gap-3 mt-4 text-center">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 py-2">
                <p className="text-[18px] font-bold text-emerald-700">{k ? k.correct : 0}</p>
                <p className="text-[11px] text-emerald-700/80">{t("solo.correctCount")}</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-200 py-2">
                <p className="text-[18px] font-bold text-red-700">{k ? k.wrong : 0}</p>
                <p className="text-[11px] text-red-700/80">{t("solo.wrongCount")}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 py-2">
                <p className="text-[18px] font-bold text-ink">
                  {k && k.elapsedMs != null ? formatMasa(k.elapsedMs) : "-"}
                </p>
                <p className="text-[11px] text-ink-faint">{t("solo.time")}</p>
              </div>
              <div className="rounded-xl bg-violet-50 border border-violet-200 py-2">
                <p className="text-[18px] font-bold text-violet-700">
                  {k && k.rank != null ? "#" + k.rank : "-"}
                </p>
                <p className="text-[11px] text-violet-700/80">{t("solo.yourRank")}</p>
              </div>
            </div>

            {k && k.best != null && (
              <p className="text-[12px] text-ink-faint mt-3">
                {t("solo.best", { n: k.best })}
              </p>
            )}

            <button
              type="button"
              onClick={() => void mulaLumba()}
              className="mt-4 w-full px-4 py-2.5 rounded-xl text-white text-[14px] font-semibold bg-gradient-to-r from-violet-600 to-indigo-600"
            >
              {t("solo.raceAgain")}
            </button>
          </div>
          {paparPapan(papanSegar, k?.rank ?? null)}
        </div>
      </div>
    );
  }

  /* ===== Skrin lumba ===== */
  const pecahanMasa = hud.masaSoalan == null ? 0 : Math.min(1, Math.max(0, hud.masaSoalan / JAWAB_TETINGKAH_MS));
  const progresTrek = Math.min(1, hud.jarakM / TREK_PANJANG_M);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col select-none">
      {/* HUD atas */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3 flex-wrap text-white">
        <span className="text-[13px] font-bold bg-violet-600/90 rounded-lg px-2.5 py-1">
          {t("solo.position")} {hud.kedudukan}/3
        </span>
        <span className="text-[13px] tabular-nums text-slate-300">{t("solo.timeLabel")} {formatMasa(hud.masaMs)}</span>
        <span className="text-[13px] tabular-nums text-slate-300">
          {lajuPaparan(tema, hud.kelajuan)} <span className="text-slate-500">km/h</span>
        </span>
        <span className="text-[13px] tabular-nums text-slate-300">
          {t("solo.speedLimit")} {lajuPaparan(tema, hud.hadLaju)}
        </span>
        <span className="text-[13px] tabular-nums text-slate-300">
          {t("solo.answered", { a: hud.soalanDijawab, b: totalRef.current })}
        </span>
        <span className="text-[13px] font-bold tabular-nums text-violet-300">
          {t("solo.score")} {hud.markah}
        </span>
        <button
          type="button"
          onClick={tukarBisu}
          title={bisu ? t("solo.unmute") : t("solo.mute")}
          className="ml-auto text-slate-300 hover:text-white rounded-lg p-1.5"
        >
          {bisu ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Bar progres trek */}
      <div className="px-4 pb-2">
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div className="h-full bg-violet-500" style={{ width: `${progresTrek * 100}%` }} />
        </div>
      </div>

      {/* Kanvas permainan */}
      <div className="flex-1 relative mx-auto w-full max-w-2xl px-0">
        <canvas
          ref={kanvasRef}
          className="w-full h-full min-h-[56vh] block rounded-xl"
          aria-label={t("solo.race")}
        />
        <canvas
          ref={kanvas3DRef}
          className="absolute inset-0 w-full h-full block rounded-xl pointer-events-none"
          style={{ visibility: "hidden" }}
          aria-hidden="true"
        />
        {/* KZ-054: kawasan seret untuk stereng dengan jari atau tetikus */}
        <div
          className="absolute inset-0 rounded-xl cursor-crosshair"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            tekanStereng.current = true;
            seretStereng(e);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Sesetengah pelayar menolak tangkapan; seretan tetap berfungsi tanpanya.
            }
          }}
          onPointerMove={(e) => {
            if (tekanStereng.current || e.pointerType === "mouse") seretStereng(e);
          }}
          onPointerUp={lepasTekan}
          onPointerCancel={hentiStereng}
          onLostPointerCapture={lepasTekan}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse" && !tekanStereng.current) hentiStereng();
          }}
          aria-hidden="true"
        />
        {petunjuk && (
          <div className="absolute top-12 inset-x-3 sm:inset-x-10 pointer-events-none text-center">
            <p className="inline-block text-[12px] sm:text-[13px] font-semibold text-white bg-slate-900/75 rounded-xl px-3 py-2">
              {sentuhPeranti ? t("solo.hintTouch") : t("solo.hintKeys")}
            </p>
          </div>
        )}

        {hud.penalti && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[12px] font-bold text-amber-300 bg-amber-950/80 rounded-lg px-3 py-1">
            {t("solo.penalty")}
          </div>
        )}
        {hud.diLuarJalan && !hud.penalti && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[12px] font-bold text-amber-200 bg-amber-950/70 rounded-lg px-3 py-1">
            {t("solo.offroad")}
          </div>
        )}
        {balasan && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <p
              className={`text-[22px] font-bold rounded-xl px-4 py-2 ${
                balasan.betul ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"
              }`}
            >
              {balasan.betul ? t("solo.correct") : t("solo.wrong")}
              <span className="block text-[13px] font-semibold opacity-90">
                +{balasan.mata}
              </span>
            </p>
          </div>
        )}

        {/* Panel soalan */}
        {soalan && (
          <div className="absolute inset-x-2 bottom-2 sm:inset-x-8 rounded-2xl bg-white/95 backdrop-blur border border-violet-200 shadow-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600">
                {t("solo.questionN", { n: soalan.index + 1, total: soalan.total })}
              </span>
              <span className="text-[11px] text-ink-faint tabular-nums">
                {Math.max(0, Math.ceil((JAWAB_TETINGKAH_MS - (hud.masaSoalan ?? 0)) / 1000))}s
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mb-3">
              <div
                className="h-full bg-violet-500"
                style={{ width: `${(1 - pecahanMasa) * 100}%` }}
              />
            </div>
            <p className="text-[15px] font-semibold text-ink mb-3">{soalan.prompt}</p>
            <div className="grid grid-cols-2 sm:grid-3 gap-2">
              {soalan.options.map((o, i) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => void hantarJawapan(o.key)}
                  className="text-left px-3 py-2.5 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 active:bg-violet-200 text-[13px] text-ink flex items-start gap-2"
                >
                  {!sentuhPeranti && (
                    <kbd className="shrink-0 mt-px inline-flex items-center justify-center w-5 h-5 rounded-md bg-violet-600 text-white text-[11px] font-bold">
                      {i + 1}
                    </kbd>
                  )}
                  <span>
                    <span className="font-bold text-violet-700">{o.key}.</span> {o.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Butang sentuh (KZ-054): stereng kiri bawah, pecut/brek kanan bawah; disorok semasa soalan */}
        {sentuhPeranti && !soalan && (
          <>
            <div className="absolute left-3 bottom-10 flex gap-3">
              <button
                type="button"
                {...butangSentuh("kiri")}
                aria-label={t("solo.left")}
                style={{ touchAction: "none" }}
                className="w-16 h-16 rounded-full bg-slate-900/70 border-2 border-white/40 text-white text-[26px] font-bold active:bg-violet-600 select-none"
              >
                &#9664;
              </button>
              <button
                type="button"
                {...butangSentuh("kanan")}
                aria-label={t("solo.right")}
                style={{ touchAction: "none" }}
                className="w-16 h-16 rounded-full bg-slate-900/70 border-2 border-white/40 text-white text-[26px] font-bold active:bg-violet-600 select-none"
              >
                &#9654;
              </button>
            </div>
            <div className="absolute right-3 bottom-10 flex items-end gap-3">
              <button
                type="button"
                {...butangSentuh("brek")}
                style={{ touchAction: "none" }}
                className="w-14 h-14 rounded-full bg-slate-700/85 border-2 border-white/30 text-white text-[12px] font-bold active:bg-slate-500 select-none"
              >
                {t("solo.brake")}
              </button>
              <button
                type="button"
                {...butangSentuh("pecut")}
                style={{ touchAction: "none" }}
                className="w-20 h-20 rounded-full bg-violet-600/90 border-2 border-white/50 text-white text-[14px] font-bold active:bg-violet-700 select-none shadow-lg"
              >
                {t("solo.boost")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Butang tamat (pemain boleh berhenti bila-bila masa) */}
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => {
            selesaiRef.current = true;
            void tamatkan();
          }}
          className="w-full max-w-2xl mx-auto block px-4 py-2 rounded-xl text-slate-300 text-[13px] font-semibold border border-slate-700 bg-slate-800 hover:bg-slate-700"
        >
          {t("solo.finishButton")}
        </button>
      </div>

      {ralat && (
        <div className="px-4 pb-3">
          <p className="text-[12px] text-red-300">{ralat}</p>
        </div>
      )}
    </div>
  );
}