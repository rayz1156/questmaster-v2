"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Upload, X, FileText, Image as ImgIcon, Download, Loader2,
  Trash2, CheckCircle2, RefreshCcw, AlertTriangle, Award, Clock,
} from "lucide-react";
import {
  Board, GroupSubmission, SubmissionStatus,
  listGroupSubmissions, getMyGroupSubmission, getMyTeamForBoard,
  createOrUpdateGroupSubmission, gradeSubmission, deleteGroupSubmission,
  listTeamsForHunt,
} from "@/lib/boards";

interface Team { id: string; name: string; score: number; }

interface Props {
  board: Board;
  canManage: boolean;
  currentUserId: string | null;
}

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  in_review: "Dalam Semakan",
  needs_revision: "Perlu Pembetulan",
  complete: "Selesai",
};
const STATUS_COLOR: Record<SubmissionStatus, string> = {
  in_review: "bg-amber-100 text-amber-800",
  needs_revision: "bg-rose-100 text-rose-800",
  complete: "bg-emerald-100 text-emerald-800",
};

export default function QuestBoardView({ board, canManage, currentUserId }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [subs, setSubs] = useState<GroupSubmission[]>([]);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<{ teamId: string; existing: GroupSubmission | null } | null>(null);
  const [gradeFor, setGradeFor] = useState<GroupSubmission | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [t, s, my] = await Promise.all([
        board.hunt_id ? listTeamsForHunt(board.hunt_id) : Promise.resolve([] as Team[]),
        listGroupSubmissions(board.id),
        getMyTeamForBoard(board.id),
      ]);
      setTeams(t);
      setSubs(s);
      setMyTeamId(my);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [board.id]);

  const subByTeam = useMemo(() => {
    const m = new Map<string, GroupSubmission>();
    for (const s of subs) m.set(s.team_id, s);
    return m;
  }, [subs]);

  const overdue = !!board.due_date && new Date() > new Date(board.due_date);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">{board.title}</h2>
          {board.description && <p className="text-sm text-gray-600">{board.description}</p>}
          {board.due_date && (
            <p className={`text-xs mt-1 inline-flex items-center gap-1 ${overdue ? 'text-rose-600' : 'text-gray-500'}`}>
              <Clock className="w-3.5 h-3.5" />
              Tarikh akhir: {new Date(board.due_date).toLocaleString()}
            </p>
          )}
        </div>
        <div className="text-sm text-gray-500">
          {board.max_score != null && <span>Markah penuh: <b>{board.max_score}</b></span>}
        </div>
      </div>

      {err && <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{err}</div>}
      {loading && <div className="text-sm text-gray-500">Memuatkan…</div>}

      {!loading && teams.length === 0 && (
        <div className="p-8 rounded-lg border-2 border-dashed border-gray-300 text-center">
          <p className="text-gray-600">Tiada kumpulan ditemui untuk quest ini.</p>
          <p className="text-xs text-gray-500 mt-1">Sila tambah kumpulan dahulu di tab Teams.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map(team => {
          const sub = subByTeam.get(team.id) || null;
          const isMyTeam = myTeamId === team.id;
          return (
            <div key={team.id} className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                <div className="font-semibold truncate">{team.name}</div>
                {sub && (
                  <span className={`text-xs px-2 py-1 rounded ${STATUS_COLOR[sub.status]}`}>
                    {STATUS_LABEL[sub.status]}
                  </span>
                )}
              </div>
              <div className="p-3 space-y-2 min-h-[140px]">
                {!sub && (
                  <div className="text-sm text-gray-500">
                    {isMyTeam ? (
                      <button onClick={() => setUploadFor({ teamId: team.id, existing: null })}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50">
                        <Plus className="w-4 h-4" /> Hantar untuk kumpulan
                      </button>
                    ) : canManage ? (
                      <span className="text-gray-400">Belum dihantar</span>
                    ) : (
                      <span className="text-gray-400">Hanya ahli kumpulan boleh hantar</span>
                    )}
                  </div>
                )}
                {sub && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      {sub.file_type === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sub.file_url} alt={sub.file_name} className="w-14 h-14 rounded object-cover bg-gray-100" />
                      ) : (
                        <div className="w-14 h-14 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                          <FileText className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{sub.title}</div>
                        {sub.description && <div className="text-xs text-gray-600 line-clamp-2">{sub.description}</div>}
                        <a href={sub.file_url} target="_blank" rel="noreferrer"
                          className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 mt-1">
                          <Download className="w-3 h-3" /> {sub.file_name}
                        </a>
                      </div>
                    </div>
                    {sub.is_late && (
                      <div className="text-[11px] inline-flex items-center gap-1 text-rose-600">
                        <AlertTriangle className="w-3 h-3" /> Lewat
                      </div>
                    )}
                    {sub.status === 'complete' && (board.show_scores_publicly || canManage || isMyTeam) && sub.score != null && (
                      <div className="text-sm inline-flex items-center gap-1 text-emerald-700">
                        <Award className="w-4 h-4" /> Markah: <b>{sub.score}</b>{board.max_score ? ` / ${board.max_score}` : ''}
                      </div>
                    )}
                    {sub.feedback && (canManage || isMyTeam) && (
                      <div className="text-xs text-gray-700 bg-gray-50 rounded p-2">
                        <b>Maklum balas:</b> {sub.feedback}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {canManage && (
                        <button onClick={() => setGradeFor(sub)}
                          className="text-xs px-2.5 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Beri Markah
                        </button>
                      )}
                      {(isMyTeam && (sub.status === 'in_review' || sub.status === 'needs_revision')) && (
                        <button onClick={() => setUploadFor({ teamId: team.id, existing: sub })}
                          className="text-xs px-2.5 py-1 rounded border hover:bg-gray-50 inline-flex items-center gap-1">
                          <RefreshCcw className="w-3.5 h-3.5" /> Hantar Semula
                        </button>
                      )}
                      {canManage && (
                        <button onClick={async () => { if (confirm('Padam hantaran ini?')) { await deleteGroupSubmission(sub.id); reload(); } }}
                          className="text-xs px-2.5 py-1 rounded border text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {uploadFor && (
        <SubmissionUploadModal
          boardId={board.id}
          teamId={uploadFor.teamId}
          existing={uploadFor.existing}
          onClose={() => setUploadFor(null)}
          onSaved={async () => { setUploadFor(null); await reload(); }}
        />
      )}
      {gradeFor && (
        <GradeModal
          submission={gradeFor}
          maxScore={board.max_score}
          onClose={() => setGradeFor(null)}
          onSaved={async () => { setGradeFor(null); await reload(); }}
        />
      )}
    </div>
  );
}

function SubmissionUploadModal({ boardId, teamId, existing, onClose, onSaved }: {
  boardId: string; teamId: string; existing: GroupSubmission | null;
  onClose: () => void; onSaved: () => void;
}) {
  const fi = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(existing?.title || "");
  const [desc, setDesc] = useState(existing?.description || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!title.trim()) { setErr("Sila isi tajuk."); return; }
    if (!file && !existing) { setErr("Sila pilih fail."); return; }
    setBusy(true);
    try {
      await createOrUpdateGroupSubmission({
        boardId, teamId, title, description: desc, file: file || undefined,
        existingPath: existing?.file_path, existingUrl: existing?.file_url,
        existingFileName: existing?.file_name, existingFileType: existing?.file_type,
        existingFileSize: existing?.file_size_bytes,
      });
      onSaved();
    } catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">{existing ? "Hantar Semula" : "Hantar Tugasan Kumpulan"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div onClick={() => fi.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); setFile(e.dataTransfer.files?.[0] || null); }}
            className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400">
            {file ? (
              <div className="text-sm"><FileText className="w-6 h-6 mx-auto mb-1 text-indigo-600" />{file.name}
                <div className="text-xs text-gray-500">{(file.size/1024).toFixed(1)} KB</div>
              </div>
            ) : existing ? (
              <div className="text-sm text-gray-600">
                <FileText className="w-6 h-6 mx-auto mb-1" />Fail semasa: {existing.file_name}
                <div className="text-xs">Klik untuk gantikan</div>
              </div>
            ) : (
              <div className="py-4 text-gray-500">
                <Upload className="w-8 h-8 mx-auto mb-1" />
                <p className="text-sm">Klik atau lepaskan fail</p>
                <p className="text-xs">PDF/Word/Excel/PowerPoint/Imej · Max 50MB</p>
              </div>
            )}
            <input ref={fi} type="file" className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*"
              onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tajuk</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg" placeholder="cth: Laporan Projek Kumpulan" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Penerangan</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
              className="w-full px-3 py-2 border rounded-lg" placeholder="Cerita ringkas tentang hantaran ini…" />
          </div>
          {err && <div className="p-2 bg-red-50 text-red-700 text-sm rounded">{err}</div>}
          <p className="text-xs text-gray-500">
            Markah & maklum balas akan diterima oleh semua ahli kumpulan.
          </p>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border">Batal</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Hantar
          </button>
        </div>
      </div>
    </div>
  );
}

function GradeModal({ submission, maxScore, onClose, onSaved }: {
  submission: GroupSubmission; maxScore: number | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [status, setStatus] = useState<SubmissionStatus>(submission.status);
  const [score, setScore] = useState<string>(submission.score != null ? String(submission.score) : "");
  const [feedback, setFeedback] = useState(submission.feedback || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      const numScore = score === "" ? null : Number(score);
      if (status === 'complete' && (numScore == null || isNaN(numScore))) {
        setErr("Sila masukkan markah untuk status 'Selesai'."); setBusy(false); return;
      }
      await gradeSubmission(submission.id, { status, score: numScore, feedback });
      onSaved();
    } catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Beri Markah</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-gray-600">
            <b>Tajuk:</b> {submission.title}<br />
            <a href={submission.file_url} target="_blank" rel="noreferrer"
              className="text-indigo-600 hover:underline inline-flex items-center gap-1 mt-1">
              <Download className="w-3.5 h-3.5" /> {submission.file_name}
            </a>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as SubmissionStatus)}
              className="w-full px-3 py-2 border rounded-lg">
              <option value="in_review">Dalam Semakan</option>
              <option value="needs_revision">Perlu Pembetulan</option>
              <option value="complete">Selesai</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Markah {maxScore != null && <span className="text-gray-500">(0-{maxScore})</span>}
            </label>
            <input type="number" value={score} onChange={e => setScore(e.target.value)}
              min={0} max={maxScore || undefined}
              className="w-full px-3 py-2 border rounded-lg"
              disabled={status !== 'complete'}
              placeholder={status === 'complete' ? "Masukkan markah" : "Hanya untuk status 'Selesai'"} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Maklum Balas</label>
            <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={4}
              className="w-full px-3 py-2 border rounded-lg" placeholder="Maklum balas untuk kumpulan…" />
          </div>
          {err && <div className="p-2 bg-red-50 text-red-700 text-sm rounded">{err}</div>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border">Batal</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
