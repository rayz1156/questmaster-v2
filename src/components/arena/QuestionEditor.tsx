'use client';

import { useState } from 'react';
import type {
  ArenaHint, ArenaQType, ArenaQuestionData, ArenaQuestionInput, ChoiceItem,
  EssayData, MatchData, MultipleData, OrderData, OxData, SubjectiveData,
} from '@/lib/arena/types';
import { ARENA_QTYPES } from '@/lib/arena/types';

type KT = { key: string; text: string };
type Pair = { lkey: string; ltext: string; rkey: string; rtext: string };

const uid = () => Math.random().toString(36).slice(2, 8);

export const QTYPE_LABEL: Record<ArenaQType, string> = {
  multiple: 'Aneka pilihan',
  subjective: 'Jawapan pendek',
  ox: 'Betul / Salah',
  essay: 'Esei',
  match: 'Padanan',
  order: 'Susunan',
};

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';
const smallBtn = 'rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40';

interface Props {
  initial?: ArenaQuestionInput;
  onSave: (q: ArenaQuestionInput) => Promise<void>;
  onCancel: () => void;
}

export default function QuestionEditor({ initial, onSave, onCancel }: Props) {
  const t0 = initial?.type;
  const d0 = initial?.data;
  const [type, setType] = useState<ArenaQType>(t0 ?? 'multiple');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [points, setPoints] = useState<number>(initial?.points ?? 100);
  const [timeLimit, setTimeLimit] = useState<number>(initial?.time_limit_sec ?? 30);
  const [hintText, setHintText] = useState(initial && initial.hint && initial.hint.type === 'text' ? initial.hint.value : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // data ikut jenis (dimulakan daripada initial jika jenis sama)
  const [choices, setChoices] = useState<ChoiceItem[]>(
    t0 === 'multiple' && d0
      ? (d0 as MultipleData).choiceList.map((c) => ({ ...c }))
      : [0, 1, 2, 3].map((i) => ({ key: uid(), text: '', isAnswer: i === 0 })),
  );
  const sd = t0 === 'subjective' && d0 ? (d0 as SubjectiveData) : null;
  const [answers, setAnswers] = useState<KT[]>(sd ? sd.answerList.map((a) => ({ ...a })) : [{ key: uid(), text: '' }]);
  const [ignoreSpaces, setIgnoreSpaces] = useState<boolean>(sd?.ignoreSpaces ?? true);
  const [ignoreCase, setIgnoreCase] = useState<boolean>(sd?.ignoreCase ?? true);
  const [ox, setOx] = useState<'o' | 'x'>(t0 === 'ox' && d0 ? (d0 as OxData).answer : 'o');
  const ed = t0 === 'essay' && d0 ? (d0 as EssayData) : null;
  const [rubric, setRubric] = useState(ed?.rubric ?? '');
  const [pairs, setPairs] = useState<Pair[]>(() => {
    if (t0 === 'match' && d0) {
      const m = d0 as MatchData;
      return m.leftItems.map((l) => {
        const rk = m.answerPairs.find((p) => p.left === l.key)?.right;
        const r = m.rightItems.find((x) => x.key === rk);
        return { lkey: l.key, ltext: l.text, rkey: r?.key ?? uid(), rtext: r?.text ?? '' };
      });
    }
    return [0, 1, 2].map(() => ({ lkey: uid(), ltext: '', rkey: uid(), rtext: '' }));
  });
  const [items, setItems] = useState<KT[]>(
    t0 === 'order' && d0 ? (d0 as OrderData).items.map((i) => ({ ...i })) : [0, 1, 2].map(() => ({ key: uid(), text: '' })),
  );

  function buildData(): ArenaQuestionData {
    switch (type) {
      case 'multiple':
        return { choiceList: choices.map((c) => ({ ...c, text: c.text.trim() })) };
      case 'subjective':
        return { answerList: answers.map((a) => ({ key: a.key, text: a.text.trim() })).filter((a) => a.text), ignoreSpaces, ignoreCase };
      case 'ox':
        return { answer: ox };
      case 'essay': {
        const out: EssayData = {};
        if (rubric.trim()) out.rubric = rubric.trim();
        if (ed?.maxLength) out.maxLength = ed.maxLength;
        return out;
      }
      case 'match':
        return {
          leftItems: pairs.map((p) => ({ key: p.lkey, text: p.ltext.trim() })),
          rightItems: pairs.map((p) => ({ key: p.rkey, text: p.rtext.trim() })),
          answerPairs: pairs.map((p) => ({ left: p.lkey, right: p.rkey })),
        };
      case 'order':
        return { items: items.map((i) => ({ key: i.key, text: i.text.trim() })) };
    }
  }

  async function save() {
    setError(null);
    if (!prompt.trim()) { setError('Soalan tidak boleh kosong.'); return; }
    if (type === 'multiple' && !choices.some((c) => c.isAnswer)) { setError('Tandakan sekurang-kurangnya satu jawapan betul.'); return; }
    const hint: ArenaHint | null = hintText.trim()
      ? { type: 'text', value: hintText.trim() }
      : initial && initial.hint && initial.hint.type !== 'text' ? initial.hint : null;
    setBusy(true);
    try {
      await onSave({
        type, prompt: prompt.trim(), data: buildData(), hint,
        points: Math.max(0, Math.round(points) || 0),
        time_limit_sec: Math.max(5, Math.round(timeLimit) || 30),
        origin: initial?.origin ?? 'manual',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // senarai teks ringkas (jawapan pendek / susunan)
  function ktList(list: KT[], set: (v: KT[]) => void, label: string, movable: boolean, min: number) {
    return (
      <div className="space-y-2">
        {list.map((it, i) => (
          <div key={it.key} className="flex items-center gap-2">
            <span className="w-6 text-right text-xs text-slate-500">{i + 1}.</span>
            <input className={inputCls} value={it.text} placeholder={label}
              onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
            {movable && (
              <>
                <button type="button" className={smallBtn} disabled={i === 0}
                  onClick={() => { const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); }}>↑</button>
                <button type="button" className={smallBtn} disabled={i === list.length - 1}
                  onClick={() => { const n = [...list]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n); }}>↓</button>
              </>
            )}
            <button type="button" className={smallBtn} disabled={list.length <= min}
              onClick={() => set(list.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {list.length < 5 && (
          <button type="button" className="text-sm text-indigo-600 hover:underline"
            onClick={() => set([...list, { key: uid(), text: '' }])}>+ Tambah</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap gap-2">
        {ARENA_QTYPES.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${type === t ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'}`}>
            {QTYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-sm font-medium text-slate-700">
          <span>Soalan</span>
          <span className={prompt.length > 300 ? 'text-red-600' : 'text-slate-400'}>{prompt.length}/300</span>
        </div>
        <textarea className={inputCls} rows={3} maxLength={300} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>

      {type === 'multiple' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Pilihan (tanda semua jawapan betul)</p>
          {choices.map((c, i) => (
            <div key={c.key} className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={c.isAnswer} title="Jawapan betul"
                onChange={(e) => setChoices(choices.map((x, j) => (j === i ? { ...x, isAnswer: e.target.checked } : x)))} />
              <input className={inputCls} value={c.text} placeholder={`Pilihan ${i + 1}`}
                onChange={(e) => setChoices(choices.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <button type="button" className={smallBtn} disabled={choices.length <= 2}
                onClick={() => setChoices(choices.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {choices.length < 6 && (
            <button type="button" className="text-sm text-indigo-600 hover:underline"
              onClick={() => setChoices([...choices, { key: uid(), text: '', isAnswer: false }])}>+ Tambah pilihan</button>
          )}
        </div>
      )}

      {type === 'subjective' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Jawapan yang diterima</p>
          {ktList(answers, setAnswers, 'Jawapan', false, 1)}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={ignoreSpaces} onChange={(e) => setIgnoreSpaces(e.target.checked)} /> Abaikan ruang</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} /> Abaikan huruf besar/kecil</label>
          </div>
        </div>
      )}

      {type === 'ox' && (
        <div className="flex gap-3">
          {(['o', 'x'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setOx(v)}
              className={`flex-1 rounded-xl py-3 text-lg font-bold ${ox === v ? (v === 'o' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white') : 'bg-white ring-1 ring-slate-300'}`}>
              {v === 'o' ? 'O · Betul' : 'X · Salah'}
            </button>
          ))}
        </div>
      )}

      {type === 'essay' && (
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Rubrik (pilihan, untuk pendidik sahaja)</p>
          <textarea className={inputCls} rows={3} value={rubric} onChange={(e) => setRubric(e.target.value)} />
        </div>
      )}

      {type === 'match' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Pasangan (kiri ↔ padanan kanan), 2-5</p>
          {pairs.map((p, i) => (
            <div key={p.lkey} className="flex items-center gap-2">
              <input className={inputCls} value={p.ltext} placeholder={`Kiri ${i + 1}`}
                onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, ltext: e.target.value } : x)))} />
              <span className="text-slate-400">↔</span>
              <input className={inputCls} value={p.rtext} placeholder={`Kanan ${i + 1}`}
                onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, rtext: e.target.value } : x)))} />
              <button type="button" className={smallBtn} disabled={pairs.length <= 2}
                onClick={() => setPairs(pairs.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {pairs.length < 5 && (
            <button type="button" className="text-sm text-indigo-600 hover:underline"
              onClick={() => setPairs([...pairs, { lkey: uid(), ltext: '', rkey: uid(), rtext: '' }])}>+ Tambah pasangan</button>
          )}
          <p className="text-xs text-slate-500">Sisi kanan akan dikocok untuk peserta.</p>
        </div>
      )}

      {type === 'order' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Item mengikut turutan BETUL (2-5)</p>
          {ktList(items, setItems, 'Item', true, 2)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Markah</span>
          <input type="number" min={0} className={inputCls} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Had masa (saat)</span>
          <input type="number" min={5} max={600} className={inputCls} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Petunjuk (pilihan)</span>
          <input className={inputCls} value={hintText} onChange={(e) => setHintText(e.target.value)} />
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Batal</button>
        <button type="button" onClick={() => void save()} disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy ? 'Menyimpan...' : 'Simpan soalan'}
        </button>
      </div>
    </div>
  );
}
