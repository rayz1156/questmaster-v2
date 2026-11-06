/**
 * Kuizen Arena, KZ-047: halaman demo permainan Pulau Harta Karun.
 *
 * Demo tanpa sesi supaya Boss boleh mencuba terus: 8 soalan palsu,
 * 2 pemain palsu yang bergerak rawak, modal Betul/Salah untuk
 * menetapkan `powerUp`, dan butang pilih pulau.
 * TIADA panggilan API: semuanya keadaan tempatan halaman sahaja.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PulauHartaKarun, { type PemainPulau } from '@/components/arena/games/PulauHartaKarun';
import { PULAU_PETA, getPulauMap } from '@/components/arena/games/pulauPeta';
import { bolehLaluiJubin, pusatJubin } from '@/components/arena/games/pulauLogik';

// 8 soalan palsu (tiada kunci jawapan sebenar; modal demo sahaja)
interface SoalanDemo {
  id: string;
  order_idx: number;
  answered: boolean;
  locked: boolean;
}
const SOALAN_DEMO: SoalanDemo[] = [
  { id: 'q1', order_idx: 0, answered: false, locked: false },
  { id: 'q2', order_idx: 1, answered: false, locked: false },
  { id: 'q3', order_idx: 2, answered: false, locked: false },
  { id: 'q4', order_idx: 3, answered: false, locked: false },
  { id: 'q5', order_idx: 4, answered: false, locked: false },
  { id: 'q6', order_idx: 5, answered: false, locked: false },
  { id: 'q7', order_idx: 6, answered: false, locked: false },
  { id: 'q8', order_idx: 7, answered: false, locked: false },
];

// teks soalan demo (kandungan demo, bukan data pengguna)
const TEKS_DEMO: Record<string, string> = {
  q1: 'Berapakah 12 + 15?',
  q2: 'Ibu negara Malaysia ialah...',
  q3: 'Berapakah akar kuasa dua 144?',
  q4: 'Planet manakah paling besar?',
  q5: 'Siapakah penulis Hikayat Hang Tuah? (soalan sukar!)',
  q6: 'Berapakah 7 x 8?',
  q7: 'Air mendidih pada suhu berapa darjah Celsius?',
  q8: 'Bulan pengiring Bumi dipanggil...',
};

export default function HalamanDemoPulau() {
  const [soalan, setSoalan] = useState(SOALAN_DEMO.map((q) => ({ ...q })));
  const [mapId, setMapId] = useState<string>(PULAU_PETA[0]?.id ?? 'kelapa');
  const [powerUp, setPowerUp] = useState<{ questionId: string; correct: boolean; seq: number } | null>(null);
  const [soalanAktif, setSoalanAktif] = useState<string | null>(null);
  const [resetSeq, setResetSeq] = useState(0);
  const [beku, setBeku] = useState(false);

  const peta = useMemo(() => getPulauMap(mapId), [mapId]);

  // 2 pemain palsu bergerak rawak pada jubin boleh lalui
  const [pemainPalsu, setPemainPalsu] = useState<PemainPulau[]>(() => {
    const p = getPulauMap('kelapa');
    const a = p.starts[1] ?? p.starts[0];
    const b = p.starts[2] ?? p.starts[0];
    const pa = a ? pusatJubin(a.x, a.y) : { x: 16, y: 16 };
    const pb = b ? pusatJubin(b.x, b.y) : { x: 48, y: 48 };
    return [
      { id: 'palsu-1', nickname: 'Pelaut Zulaikha', avatar: 1, x: pa.x, y: pa.y, presence: 'online' },
      { id: 'palsu-2', nickname: 'Kapten Amir', avatar: 6, x: pb.x, y: pb.y, presence: 'online' },
    ];
  });

  useEffect(() => {
    const p = getPulauMap(mapId);
    const pemasa = window.setInterval(() => {
      setPemainPalsu((senarai) =>
        senarai.map((pemain) => {
          // langkah rawak satu jubin, hanya jika jubin itu boleh lalui
          const arah = Math.floor(Math.random() * 4);
          const dx = arah === 0 ? 1 : arah === 1 ? -1 : 0;
          const dy = arah === 2 ? 1 : arah === 3 ? -1 : 0;
          const nx = Math.round(pemain.x / 32) + dx;
          const ny = Math.round(pemain.y / 32) + dy;
          if (!bolehLaluiJubin(p, nx, ny)) return pemain;
          const pusat = pusatJubin(nx, ny);
          return { ...pemain, x: pusat.x, y: pusat.y };
        }),
      );
    }, 900);
    return () => window.clearInterval(pemasa);
  }, [mapId]);

  const sentuhSoalan = useCallback((questionId: string) => {
    setSoalanAktif(questionId);
  }, []);

  const jawab = (betul: boolean) => {
    if (soalanAktif === null) return;
    const qid = soalanAktif;
    setSoalan((s) => s.map((q) => (q.id === qid ? { ...q, answered: true } : q)));
    setPowerUp((p) => ({ questionId: qid, correct: betul, seq: (p?.seq ?? 0) + 1 }));
    setSoalanAktif(null);
  };

  // tukar pulau: kabus pemain direset oleh komponen (penerokaan milik pulau)
  const tukarPulau = (id: string) => {
    setMapId(id);
    const p = getPulauMap(id);
    setPemainPalsu((senarai) =>
      senarai.map((pemain, i) => {
        const mula = p.starts[(i + 1) % Math.max(1, p.starts.length)] ?? p.starts[0];
        const pusat = mula ? pusatJubin(mula.x, mula.y) : { x: pemain.x, y: pemain.y };
        return { ...pemain, x: pusat.x, y: pusat.y };
      }),
    );
  };

  const dijawab = soalan.filter((q) => q.answered).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">Demo: Pulau Harta Karun</h1>
        <p className="text-sm text-slate-500 mb-4">
          Teroka pulau berkabus, buka peti soalan, dan cari harta karun. Demo
          tanpa sesi: jawab semua 8 soalan ({dijawab}/8 sudah dijawab) untuk
          melihat tanda X harta karun.
        </p>

        {/* butang pilih pulau */}
        <div className="flex flex-wrap gap-2 mb-3">
          {PULAU_PETA.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => tukarPulau(p.id)}
              className={
                'px-4 py-2 rounded-lg text-sm font-medium border ' +
                (mapId === p.id
                  ? 'text-white bg-gradient-to-r from-violet-600 to-indigo-600 border-transparent'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')
              }
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* kawalan demo yang biasanya datang dari guru/host */}
        <div className="flex flex-wrap gap-2 mb-3 text-sm">
          <button
            type="button"
            onClick={() => setBeku((b) => !b)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {beku ? 'Cairkan permainan' : 'Bekukan permainan'}
          </button>
          <button
            type="button"
            onClick={() => setResetSeq((r) => r + 1)}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Mula Bersama (set semula)
          </button>
          <span className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-slate-600">
            Keputusan terakhir: {powerUp === null ? 'tiada lagi' : powerUp.correct ? 'Betul' : 'Salah'}
          </span>
        </div>

        <PulauHartaKarun
          me={{ id: 'pemain-demo-1', nickname: 'Penjelajah', avatar: 4 }}
          questions={soalan}
          frozen={beku}
          resetSeq={resetSeq}
          paused={soalanAktif !== null}
          powerUp={powerUp}
          onTouchQuestion={sentuhSoalan}
          onMove={undefined}
          sessionId="demo-sesi-047"
          code="DEMO47"
          mapId={mapId}
          players={pemainPalsu}
          meX={0}
          meY={0}
        />

        {/* modal Betul/Salah: gantikan popup soalan sebenar dalam sesi */}
        {soalanAktif !== null ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 max-w-sm w-full">
              <p className="text-xs text-slate-500 mb-1">Peti soalan {soalanAktif}</p>
              <p className="font-medium mb-4">{TEKS_DEMO[soalanAktif] ?? 'Soalan demo'}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => jawab(true)}
                  className="flex-1 px-4 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-violet-600 to-indigo-600"
                >
                  Betul
                </button>
                <button
                  type="button"
                  onClick={() => jawab(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Salah
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Dalam sesi sebenar popup soalan penuh terbuka di sini; demo ini
                hanya menetapkan powerUp.
              </p>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-slate-400 mt-4">
          Peta demo: {peta.name} ({peta.width}x{peta.height} jubin, {peta.chests.length} lokasi peti).
          Keadaan kabus disimpan dalam localStorage ikut kod sesi demo, jadi
          penerokaan kekal selepas muat semula halaman.
        </p>
      </div>
    </div>
  );
}