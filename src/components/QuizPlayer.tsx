'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Choice = { id: string; question_id: string; position: number; label: string };
type Question = { id: string; quiz_id: string; position: number; prompt: string; question_type: 'single'|'multiple'|'true_false'; points: number; explanation?: string | null; image_url?: string | null; choices: Choice[] };
type Quiz = { id: string; lesson_id: string; course_id: string; title: string; description?: string | null; pass_threshold: number; max_attempts: number; time_limit_seconds: number; shuffle_questions: boolean; shuffle_choices: boolean; show_correct_answers: boolean; is_gating: boolean };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return (data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) as Record<string, string>;
}

export default function QuizPlayer({ lessonId, onPass }: { lessonId: string; onPass?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score_points: number; total_points: number; score_percent: number; passed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { (async () => {
    setLoading(true); setError(null); setResult(null); setAttemptId(null); setSelections({});
    try {
      const r = await fetch(`/api/quiz/${lessonId}`, { headers: { ...(await authHeader()) }, cache: 'no-store' });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return; }
      const j = await r.json();
      setQuiz(j.quiz); setQuestions(j.questions || []);
    } catch (e: any) { setError(e?.message || 'Failed to load quiz'); }
    finally { setLoading(false); }
  })(); }, [lessonId]);

  function toggleChoice(qid: string, cid: string, type: 'single'|'multiple'|'true_false') {
    setSelections(prev => {
      const next = { ...prev };
      const cur = new Set(prev[qid] || []);
      if (type === 'multiple') {
        if (cur.has(cid)) cur.delete(cid); else cur.add(cid);
      } else {
        cur.clear(); cur.add(cid);
      }
      next[qid] = cur;
      return next;
    });
  }

  async function startAttempt() {
    setError(null);
    const r = await fetch(`/api/quiz/${lessonId}/attempt`, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: '{}' });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return; }
    const j = await r.json();
    setAttemptId(j.attempt.id);
    setResult(null); setSelections({});
  }

  async function submitAttempt() {
    if (!attemptId) return;
    setSubmitting(true); setError(null);
    try {
      const answers = questions.map(q => ({ question_id: q.id, selected_choice_ids: Array.from(selections[q.id] || []) }));
      const r = await fetch(`/api/quiz/${lessonId}/attempt`, { method: 'PUT', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ attempt_id: attemptId, answers }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return; }
      setResult(j);
      if (j.passed && onPass) onPass();
    } catch (e: any) { setError(e?.message || 'Submit failed'); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading quiz...</div>;
  if (!quiz) return <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-900">This quiz hasn't been set up yet. Ask the creator to add questions.</div>;

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 rounded-xl p-6 bg-white">
        <h2 className="text-xl font-semibold text-slate-900">{quiz.title}</h2>
        {quiz.description && <p className="mt-1 text-sm text-slate-600">{quiz.description}</p>}
        <div className="mt-3 text-xs text-slate-500 flex gap-4 flex-wrap">
          <span>Pass at {quiz.pass_threshold}%</span>
          {quiz.max_attempts > 0 ? <span>Max attempts: {quiz.max_attempts}</span> : <span>Unlimited attempts</span>}
          <span>{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg p-3">{error}</div>}

      {!attemptId && !result && (
        <button onClick={startAttempt} className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Start quiz</button>
      )}

      {result && (
        <div className={`border rounded-xl p-6 ${result.passed ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <div className="text-lg font-semibold">{result.passed ? 'You passed!' : 'Not passed yet'}</div>
          <div className="text-sm mt-1">Score: {result.score_points} / {result.total_points} ({result.score_percent}%)</div>
          <div className="text-xs text-slate-600 mt-1">Pass threshold: {quiz.pass_threshold}%</div>
          <button onClick={startAttempt} className="mt-3 px-4 py-2 rounded-lg bg-white border border-slate-300 text-sm hover:bg-slate-50">Try again</button>
        </div>
      )}

      {attemptId && !result && questions.map((q, idx) => (
        <div key={q.id} className="border border-slate-200 rounded-xl p-5 bg-white">
          <div className="text-xs text-slate-500 mb-1">Question {idx + 1} of {questions.length} · {q.points} pt{q.points !== 1 ? 's' : ''}</div>
          <div className="text-base font-medium text-slate-900 whitespace-pre-wrap">{q.prompt}</div>
          {q.image_url && <img src={q.image_url} alt="" className="mt-3 max-h-64 rounded-lg border border-slate-200" />}
          <div className="mt-4 space-y-2">
            {q.choices.map(c => {
              const checked = (selections[q.id] || new Set()).has(c.id);
              return (
                <label key={c.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${checked ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type={q.question_type === 'multiple' ? 'checkbox' : 'radio'} name={`q-${q.id}`} checked={checked} onChange={() => toggleChoice(q.id, c.id, q.question_type)} className="mt-0.5" />
                  <span className="text-sm text-slate-800">{c.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {attemptId && !result && (
        <button onClick={submitAttempt} disabled={submitting} className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit answers'}</button>
      )}
    </div>
  );
}
