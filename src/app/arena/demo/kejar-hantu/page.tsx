'use client';

// Halaman demo Kejar Hantu untuk Boss mencuba tanpa sesi Arena.
// Semua soalan palsu, tiada panggilan API, tiada data pelayan.

import { useCallback, useState } from 'react';
import KejarHantu from '@/components/arena/games/KejarHantu';
import type { GameProps } from '@/components/arena/games/types';

interface SoalanDemo {
  id: string;
  order_idx: number;
  answered: boolean;
  locked: boolean;
}

const SOALAN_AWAL: SoalanDemo[] = [
  { id: 'demo-1', order_idx: 0, answered: false, locked: false },
  { id: 'demo-2', order_idx: 1, answered: false, locked: false },
  { id: 'demo-3', order_idx: 2, answered: false, locked: false },
  { id: 'demo-4', order_idx: 3, answered: false, locked: false },
  { id: 'demo-5', order_idx: 4, answered: false, locked: false },
];

export default function HalamanDemoKejarHantu() {
  const [soalan, setSoalan] = useState<SoalanDemo[]>(SOALAN_AWAL);
  const [frozen, setFrozen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [resetSeq, setResetSeq] = useState(0);
  const [seq, setSeq] = useState(0);
  const [powerUp, setPowerUp] = useState<GameProps['powerUp']>(null);
  const [soalanTerbuka, setSoalanTerbuka] = useState<string | null>(null);
  const [markahKuiz, setMarkahKuiz] = useState(0);

  const sentuhSoalan = useCallback((questionId: string) => {
    setSoalanTerbuka(questionId);
    setPaused(true);
  }, []);

  const jawab = (betul: boolean): void => {
    const questionId = soalanTerbuka;
    if (questionId) {
      const seqBaru = seq + 1;
      setSeq(seqBaru);
      setPowerUp({ questionId, correct: betul, seq: seqBaru });
      if (betul) {
        setMarkahKuiz((m) => m + 100);
        setSoalan((senarai) => senarai.map((q) => (q.id === questionId ? { ...q, answered: true } : q)));
      }
    }
    setSoalanTerbuka(null);
    setPaused(false);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-xl font-bold text-slate-900">Demo: Kejar Hantu</h1>
      <p className="mb-4 text-sm text-slate-600">
        Halaman main tanpa sesi. Sentuh peti soalan dalam maze untuk membuka soalan palsu.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-violet-100 px-3 py-1 font-semibold text-violet-900">
          Markah kuiz: {markahKuiz}
        </span>
        <button
          type="button"
          onClick={() => setFrozen((f) => !f)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 active:bg-slate-100"
        >
          {frozen ? 'Nyahkan beku guru' : 'Bekukan (guru)'}
        </button>
        <button
          type="button"
          onClick={() => setResetSeq((r) => r + 1)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 active:bg-slate-100"
        >
          Mula Bersama (reset)
        </button>
        <span className="text-slate-500">
          Soalan dijawab: {soalan.filter((q) => q.answered).length}/{soalan.length}
        </span>
      </div>

      <KejarHantu
        me={{ id: 'demo-pemain', nickname: 'Boss', avatar: 0 }}
        questions={soalan}
        frozen={frozen}
        resetSeq={resetSeq}
        paused={paused}
        powerUp={powerUp}
        onTouchQuestion={sentuhSoalan}
      />

      {soalanTerbuka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-slate-900">Soalan palsu</h2>
            <p className="mb-4 text-sm text-slate-600">
              Ini soalan demo ({soalanTerbuka}). Pilih hasil jawapan untuk menguji mod kuasa.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => jawab(true)}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 font-semibold text-white active:scale-95"
              >
                Betul
              </button>
              <button
                type="button"
                onClick={() => jawab(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 active:bg-slate-100"
              >
                Salah
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
