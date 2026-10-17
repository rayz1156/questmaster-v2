'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Choice = { id?: string; position: number; label: string; is_correct: boolean };
type Question = { id?: string; position: number; prompt: string; question_type: 'single'|'multiple'|'true_false'; points: number; explanation?: string | null; image_url?: string | null; choices: Choice[] };
type QuizState = {
  title: string;
  description: string;
  pass_threshold: number;
  max_attempts: number;
  time_limit_seconds: number;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  show_correct_answers: boolean;
  is_gating: boolean;
  questions: Question[];
};

const EMPTY: QuizState = { title: 'Quiz', description: '', pass_threshold: 70, max_attempts: 0, time_limit_seconds: 0, shuffle_questions: false, shuffle_choices: false, show_correct_answers: true, is_gating: false, questions: [] };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return (data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) as Record<string, string>;
}

export default function QuizBuilder({ lessonId }: { lessonId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [state, setState] = useState<QuizState>(EMPTY);

  useEffect(() => { (async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/quiz/${lessonId}`, { headers: { ...(await authHeader()) }, cache: 'no-store' });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return; }
      const j = await r.json();
      if (j.quiz) {
        setState({
          title: j.quiz.title || 'Quiz',
          description: j.quiz.description || '',
          pass_threshold: j.quiz.pass_threshold ?? 70,
          max_attempts: j.quiz.max_attempts ?? 0,
          time_limit_seconds: j.quiz.time_limit_seconds ?? 0,
          shuffle_questions: !!j.quiz.shuffle_questions,
          shuffle_choices: !!j.quiz.shuffle_choices,
          show_correct_answers: j.quiz.show_correct_answers !== false,
          is_gating: !!j.quiz.is_gating,
          questions: (j.questions || []).map((q: any) => ({ id: q.id, position: q.position, prompt: q.prompt, question_type: q.question_type, points: q.points, explanation: q.explanation, image_url: q.image_url, choices: (q.choices || []).map((c: any) => ({ id: c.id, position: c.position, label: c.label, is_correct: !!c.is_correct })) }))
        });
      }
    } catch (e: any) { setError(e?.message || 'Load failed'); }
    finally { setLoading(false); }
  })(); }, [lessonId]);

  function addQuestion(type: 'single'|'multiple'|'true_false' = 'single') {
    setState(s => ({ ...s, questions: [...s.questions, { position: s.questions.length, prompt: '', question_type: type, points: 1, explanation: '', image_url: null, choices: type === 'true_false' ? [{ position: 0, label: 'True', is_correct: false }, { position: 1, label: 'False', is_correct: false }] : [{ position: 0, label: '', is_correct: false }, { position: 1, label: '', is_correct: false }] }] }));
  }
  function removeQuestion(i: number) { setState(s => ({ ...s, questions: s.questions.filter((_, idx) => idx !== i) })); }
  function updateQ(i: number, patch: Partial<Question>) { setState(s => ({ ...s, questions: s.questions.map((q, idx) => idx === i ? { ...q, ...patch } : q) })); }
  function addChoice(i: number) { setState(s => ({ ...s, questions: s.questions.map((q, idx) => idx === i ? { ...q, choices: [...q.choices, { position: q.choices.length, label: '', is_correct: false }] } : q) })); }
  function removeChoice(i: number, j: number) { setState(s => ({ ...s, questions: s.questions.map((q, idx) => idx === i ? { ...q, choices: q.choices.filter((_, jdx) => jdx !== j) } : q) })); }
  function updateChoice(i: number, j: number, patch: Partial<Choice>) {
    setState(s => ({ ...s, questions: s.questions.map((q, idx) => {
      if (idx !== i) return q;
      let choices = q.choices.map((c, jdx) => jdx === j ? { ...c, ...patch } : c);
      // For single/true_false: clearing other is_correct when one is set
      if (patch.is_correct === true && (q.question_type === 'single' || q.question_type === 'true_false')) {
        choices = choices.map((c, jdx) => jdx === j ? c : { ...c, is_correct: false });
      }
      return { ...q, choices };
    }) }));
  }

  async function save() {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const r = await fetch(`/api/quiz/${lessonId}`, { method: 'PUT', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(state) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return; }
      setSuccess(`Saved · ${j.question_count} question${j.question_count !== 1 ? 's' : ''}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading quiz...</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm"><span className="block text-slate-700 mb-1">Title</span><input value={state.title} onChange={e => setState(s => ({ ...s, title: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg" /></label>
        <label className="text-sm"><span className="block text-slate-700 mb-1">Pass threshold (%)</span><input type="number" min={0} max={100} value={state.pass_threshold} onChange={e => setState(s => ({ ...s, pass_threshold: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg" /></label>
        <label className="text-sm"><span className="block text-slate-700 mb-1">Max attempts (0 = unlimited)</span><input type="number" min={0} value={state.max_attempts} onChange={e => setState(s => ({ ...s, max_attempts: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg" /></label>
        <label className="text-sm md:col-span-2"><span className="block text-slate-700 mb-1">Description (optional)</span><textarea value={state.description} onChange={e => setState(s => ({ ...s, description: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg" /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={state.is_gating} onChange={e => setState(s => ({ ...s, is_gating: e.target.checked }))} /> Block next lesson until passed</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={state.shuffle_questions} onChange={e => setState(s => ({ ...s, shuffle_questions: e.target.checked }))} /> Shuffle questions</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={state.shuffle_choices} onChange={e => setState(s => ({ ...s, shuffle_choices: e.target.checked }))} /> Shuffle choices</label>
      </div>

      <div className="space-y-4">
        {state.questions.map((q, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-slate-500">Question {i + 1}</div>
              <button onClick={() => removeQuestion(i)} className="text-xs text-rose-600 hover:underline">Remove</button>
            </div>
            <textarea value={q.prompt} onChange={e => updateQ(i, { prompt: e.target.value })} placeholder="Question text" rows={2} className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <div className="mt-2 flex gap-3 text-xs">
              <label>Type <select value={q.question_type} onChange={e => updateQ(i, { question_type: e.target.value as any })} className="ml-1 px-2 py-1 border border-slate-300 rounded"><option value="single">Single choice</option><option value="multiple">Multiple choice</option><option value="true_false">True/False</option></select></label>
              <label>Points <input type="number" min={0} value={q.points} onChange={e => updateQ(i, { points: Number(e.target.value) })} className="ml-1 w-16 px-2 py-1 border border-slate-300 rounded" /></label>
            </div>
            <div className="mt-3 space-y-2">
              {q.choices.map((c, j) => (
                <div key={j} className="flex items-center gap-2">
                  <input type={q.question_type === 'multiple' ? 'checkbox' : 'radio'} name={`correct-${i}`} checked={c.is_correct} onChange={e => updateChoice(i, j, { is_correct: e.target.checked })} />
                  <input value={c.label} onChange={e => updateChoice(i, j, { label: e.target.value })} placeholder={`Choice ${j + 1}`} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm" />
                  {q.question_type !== 'true_false' && q.choices.length > 2 && <button onClick={() => removeChoice(i, j)} className="text-xs text-rose-600">×</button>}
                </div>
              ))}
              {q.question_type !== 'true_false' && <button onClick={() => addChoice(i)} className="text-xs text-emerald-700 hover:underline">+ add choice</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => addQuestion('single')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">+ Single choice</button>
        <button onClick={() => addQuestion('multiple')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">+ Multiple choice</button>
        <button onClick={() => addQuestion('true_false')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">+ True/False</button>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg p-3">{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg p-3">{success}</div>}
      <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save quiz'}</button>
    </div>
  );
}
