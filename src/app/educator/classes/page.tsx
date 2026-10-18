"use client";
import Link from "next/link";
import Shell from "@/components/Shell";
import { useEffect, useState } from "react";
import {ListChecks, Users, BarChart3, Plus, Trash2, GraduationCap, Copy, User as UserIcon, Mail, Check, CopyPlus, Activity} from "lucide-react";
import { listMyEducatorClasses, createClass, deleteClass, listMyClassEducatorInvites, acceptClassEducatorInviteByCode, duplicateClass, leaveClassAsEducator } from "@/lib/data";
import type { EducatorClassRow, MyClassEducatorInvite } from "@/lib/types";
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { teks, LOKAL } from "@/i18n/teks";

const tabs = [
  { href: "/educator/classes", label: teks.pendidik.tabKelas, icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: teks.pendidik.tabAktiviti, icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: teks.pendidik.tabPasukan, icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: teks.pendidik.tabKedudukan, icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/analytics", label: teks.pendidik.tabAnalitik, icon: <Activity className="w-5 h-5"/> },
  { href: "/educator/profile", label: teks.pendidik.tabProfil, icon: <UserIcon className="w-5 h-5"/> },
];

function roleLabel(role: string): string {
  if (role === "owner") return teks.pendidik.pemilik;
  if (role === "co-creator" || role === "co_creator") return teks.pendidik.penciptaBersama;
  if (role === "co-educator" || role === "co_educator") return teks.pendidik.pendidikBersama;
  return role;
}

export default function EduClasses() {
  const [classes, setClasses] = useState<EducatorClassRow[]>([]);
  const confirm = useConfirm();
  const [invites, setInvites] = useState<MyClassEducatorInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("#6576ff");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const reload = async () => {
    try {
      const [cls, inv] = await Promise.all([listMyEducatorClasses(), listMyClassEducatorInvites()]);
      setClasses(cls);
      setInvites(inv);
    } catch (e: any) {
      setErr(e.message || teks.pendidik.gagalMemuatkan);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const onCreate = async () => {
    setErr(null);
    if (!name.trim()) { setErr(teks.pendidik.namaDiperlukan); return; }
    setBusy(true);
    try {
      await createClass(name.trim(), desc.trim() || undefined, color);
      setName(""); setDesc(""); setShowNew(false);
      await reload();
    } catch (e: any) {
      setErr(e.message || teks.pendidik.gagalCipta);
    } finally { setBusy(false); }
  };


  // --- Keadaan pendua kelas ---
  const [dupTarget, setDupTarget] = useState<EducatorClassRow | null>(null);
  const [dupTitle, setDupTitle] = useState('');
  const [dupLB, setDupLB] = useState(true);
  const [dupAct, setDupAct] = useState(true);
  const [dupMem, setDupMem] = useState(false);
  const [dupEdu, setDupEdu] = useState(true);
  const [dupTpl, setDupTpl] = useState(false);
  const [dupDraft, setDupDraft] = useState(true);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupErr, setDupErr] = useState<string | null>(null);
  const openDuplicate = (k: EducatorClassRow) => {
    setDupTarget(k);
    setDupTitle(teks.pendidik.salinan(k.name));
    setDupLB(true); setDupAct(true); setDupMem(false); setDupEdu(true);
    setDupTpl(false); setDupDraft(true);
    setDupErr(null);
  };
  const onDuplicate = async () => {
    if (!dupTarget) return;
    setDupErr(null); setDupBusy(true);
    try {
      const res = await duplicateClass(dupTarget.id, {
        newTitle: dupTitle.trim() || undefined,
        copyLearningBoard: dupLB,
        copyActivities: dupAct,
        copyMembers: dupMem,
        copyEducators: dupEdu,
        asTemplate: dupTpl,
        asDraft: dupDraft,
      });
      setDupTarget(null);
      await reload();
      alert(teks.pendidik.berjayaDiduakan(res.name, res.copied.columns, res.copied.cards, res.copied.hunts, res.copied.members, res.copied.educators));
    } catch (e: any) {
      setDupErr(e?.message || teks.pendidik.gagalMenduakan);
    } finally { setDupBusy(false); }
  };

  const onLeave = async (k: EducatorClassRow) => {
    if (k.role === "owner") return;
    if (!(await confirm({ title: teks.pendidik.tinggalkanTajuk(k.name), description: teks.pendidik.tinggalkanSub, tone: "danger", confirmLabel: teks.pendidik.tinggalkanButang }))) return;
    try {
      await leaveClassAsEducator(k.id);
      await reload();
    } catch (e: any) {
      alert(e?.message || teks.pendidik.gagalMeninggalkan);
    }
  };

  const onDelete = async (k: EducatorClassRow) => {
    if (k.role !== "owner") return;
    if (!(await confirm({ title: teks.pendidik.padamTajuk(k.name), tone: 'danger' }))) return;
    try {
      await deleteClass(k.id);
      await reload();
    } catch (e: any) {
      alert(e.message || teks.pendidik.gagalMemadam);
    }
  };

  const onAcceptInvite = async (code: string) => {
    setInviteBusy(code);
    setInviteMsg(null);
    try {
      await acceptClassEducatorInviteByCode(code);
      setInviteMsg({ type: "ok", text: teks.pendidik.jemputanDiterima });
      await reload();
    } catch (e: any) {
      setInviteMsg({ type: "err", text: e?.message || teks.pendidik.gagalMenerima });
    } finally {
      setInviteBusy(null);
    }
  };

  return (
    <Shell tabs={tabs}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="page-title">{teks.pendidik.kelasSaya}</h2>
        <button onClick={() => setShowNew(s => !s)} className="btn-primary py-1 px-3 text-sm flex items-center gap-1"><Plus className="w-4 h-4"/> {teks.pendidik.kelasBaharu}</button>
      </div>

      {invites.length > 0 && (
        <div className="card mb-4 border-l-4" style={{ borderLeftColor: "#6576ff" }}>
          <div className="flex items-center gap-2 mb-1"><Mail className="w-4 h-4 text-primary"/><div className="font-semibold">{teks.pendidik.jemputanMenunggu(invites.length)}</div></div>
          <p className="text-xs text-slate-500 mb-3">{teks.pendidik.jemputanSub}</p>
          {inviteMsg && (
            <div className={`text-xs mb-2 ${inviteMsg.type === "ok" ? "text-status-success" : "text-status-danger"}`}>{inviteMsg.text}</div>
          )}
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-2 border-b last:border-0">
                <div className="w-6 h-6 rounded shrink-0" style={{ background: i.class_color || "#6576ff" }}/>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.class_name}</div>
                  <div className="text-xs text-slate-500 truncate">{teks.pendidik.dijemputOleh} {i.inviter_name || teks.pendidik.pendidikLain} · {teks.pendidik.tamat} {new Date(i.expires_at).toLocaleDateString(LOKAL)}</div>
                </div>
                <code className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{i.code}</code>
                <button disabled={inviteBusy === i.code} onClick={() => onAcceptInvite(i.code)} className="btn-primary py-1 px-3 text-sm flex items-center gap-1"><Check className="w-4 h-4"/> {teks.pendidik.terima}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNew && (
        <div className="card mb-4">
          <div className="font-semibold mb-2">{teks.pendidik.ciptaKelas}</div>
          <input className="input w-full mb-2" placeholder={teks.pendidik.placeholderNama} value={name} onChange={e => setName(e.target.value)}/>
          <input className="input w-full mb-2" placeholder={teks.pendidik.placeholderPenerangan} value={desc} onChange={e => setDesc(e.target.value)}/>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">{teks.pendidik.warna}</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 rounded"/>
            <button type="button" disabled={busy} onClick={onCreate} className="btn-primary ml-auto py-1 px-3 text-sm">{busy ? teks.pendidik.mencipta : teks.pendidik.cipta}</button>
          </div>
          {err && <div className="text-xs text-status-danger mt-1">{err}</div>}
        </div>
      )}

      {!showNew && err && <div className="text-xs text-status-danger mb-2">{err}</div>}

      {loading ? (
        <p className="text-sm text-slate-500">{teks.pendidik.memuatkan}</p>
      ) : classes.length === 0 ? (
        <p className="text-sm text-slate-500">{teks.pendidik.tiadaKelas}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {classes.map(k => (
            <div key={k.id} className="card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded shrink-0" style={{ background: k.color || "#6576ff" }}/>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0"><Link href={`/educator/classes/${k.id}`} className="font-semibold truncate block">{k.name}</Link>{k.ended_at && <span data-class-pill="ended" className="shrink-0 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">{teks.pendidik.tamatPil}</span>}</div>
                    {k.description && <div className="text-xs text-slate-500 truncate">{k.description}</div>}
                  </div>
                </div>
                {k.role === "owner" ? (
                  <><button onClick={() => openDuplicate(k)} title={teks.pendidik.duakanKelas} className="text-slate-600 hover:bg-slate-100 rounded px-2 py-1"><CopyPlus className="w-4 h-4"/></button><button onClick={() => onDelete(k)} title={teks.pendidik.padamKelas} className="text-status-danger hover:bg-red-50 rounded px-2 py-1"><Trash2 className="w-4 h-4"/></button></>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded bg-primary-subtle text-primary-hover">{roleLabel(k.role)}</span>
                    <button onClick={() => onLeave(k)} title={teks.pendidik.tinggalkanButang} className="text-rose-600 hover:text-white hover:bg-rose-500 border border-rose-200 hover:border-rose-500 rounded px-2 py-1 text-xs font-medium transition">{teks.pendidik.tinggalkan}</button>
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-2 flex items-center gap-2">
                {teks.pendidik.kod} <code className="font-mono bg-slate-100 px-2 py-0.5 rounded">{k.join_code}</code>
                <button onClick={() => navigator.clipboard.writeText(k.join_code)} className="text-status-info flex items-center gap-1"><Copy className="w-3 h-3"/>{teks.pendidik.salin}</button>
                <Link href={`/educator/classes/${k.id}`} className="ml-auto text-primary font-semibold">{teks.pendidik.urus}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
      {dupTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !dupBusy && setDupTarget(null)}>
          <div onClick={(e)=>e.stopPropagation()} className="w-full max-w-md rounded bg-white p-5 shadow-elevated">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">{teks.pendidik.duakanKelas}</h3>
              <button onClick={()=>setDupTarget(null)} disabled={dupBusy} className="text-slate-500 hover:text-slate-900">✕</button>
            </div>
            <label className="block text-xs font-medium text-slate-700 mb-1">{teks.pendidik.tajukBaharu}</label>
            <input value={dupTitle} onChange={(e)=>setDupTitle(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary" placeholder={teks.pendidik.salinan(dupTarget.name)} />
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupLB} onChange={(e)=>setDupLB(e.target.checked)} className="rounded"/> {teks.pendidik.salinPapan}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupAct} onChange={(e)=>setDupAct(e.target.checked)} className="rounded"/> {teks.pendidik.salinAktiviti}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupMem} onChange={(e)=>setDupMem(e.target.checked)} className="rounded"/> {teks.pendidik.salinAhli}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupEdu} onChange={(e)=>setDupEdu(e.target.checked)} className="rounded"/> {teks.pendidik.salinPendidik}</label>
            </div>
            <details className="mb-4">
              <summary className="text-xs font-medium text-slate-700 cursor-pointer select-none">{teks.pendidik.pilihanLanjutan}</summary>
              <div className="mt-2 space-y-2 pl-1">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupTpl} onChange={(e)=>setDupTpl(e.target.checked)} className="rounded"/> {teks.pendidik.templat} <span className="text-xs text-slate-500">{teks.pendidik.templatNota}</span></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupDraft} onChange={(e)=>setDupDraft(e.target.checked)} className="rounded"/> {teks.pendidik.draf} <span className="text-xs text-slate-500">{teks.pendidik.drafNota}</span></label>
              </div>
            </details>
            {dupErr && <div className="text-xs text-status-danger mb-2">{dupErr}</div>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={()=>setDupTarget(null)} disabled={dupBusy} className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-sm">{teks.pendidik.batal}</button>
              <button onClick={onDuplicate} disabled={dupBusy} className="btn-primary py-1.5 px-3 text-sm">{dupBusy ? teks.pendidik.menduakan : teks.pendidik.duakan}</button>
            </div>
          </div>
        </div>
      )}

    </Shell>
  );
}
