"use client";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from '@/lib/eduTabs';
import { useEffect, useState } from "react";
import {ListChecks, Users, BarChart3, Plus, Trash2, GraduationCap, Copy, User as UserIcon, Mail, Check, CopyPlus, Activity} from "lucide-react";
import { listMyEducatorClasses, createClass, deleteClass, listMyClassEducatorInvites, acceptClassEducatorInviteByCode, duplicateClass, leaveClassAsEducator } from "@/lib/data";
import type { EducatorClassRow, MyClassEducatorInvite } from "@/lib/types";
import { useConfirm } from '@/components/ui/ConfirmProvider';
import RowMenu from "@/components/ui/RowMenu";
import { pelanSaya, mesejHad, tanpaHad, type RingkasanPelan } from "@/lib/pelan";

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "co-creator" || role === "co_creator") return "Co-creator";
  if (role === "co-educator" || role === "co_educator") return "Co-educator";
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
  const [color, setColor] = useState("#6366f1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pelan, setPelan] = useState<RingkasanPelan | null>(null);

  const reload = async () => {
    try {
      const [cls, inv, pl] = await Promise.all([listMyEducatorClasses(), listMyClassEducatorInvites(), pelanSaya()]);
      setClasses(cls);
      setInvites(inv);
      setPelan(pl);
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const onCreate = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Class name is required"); return; }
    setBusy(true);
    try {
      await createClass(name.trim(), desc.trim() || undefined, color);
      setName(""); setDesc(""); setShowNew(false);
      await reload();
    } catch (e: any) {
      setErr(mesejHad(e, "Kelas tidak dapat dicipta."));
    } finally { setBusy(false); }
  };


  // --- Duplicate class state ---
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
    setDupTitle(`Copy of ${k.name}`);
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
      alert(`Created "${res.name}". Copied: ${res.copied.columns} columns, ${res.copied.cards} cards, ${res.copied.hunts} activities, ${res.copied.members} members, ${res.copied.educators} educators.`);
    } catch (e: any) {
      setDupErr(e?.message || 'Failed to duplicate');
    } finally { setDupBusy(false); }
  };

  const onLeave = async (k: EducatorClassRow) => {
    if (k.role === "owner") return;
    if (!(await confirm({ title: `Leave "${k.name}"?`, description: "You will lose your co-educator access to this class. The owner can re-invite you later.", tone: "danger", confirmLabel: "Leave class" }))) return;
    try {
      await leaveClassAsEducator(k.id);
      await reload();
    } catch (e: any) {
      alert(e?.message || "Failed to leave class");
    }
  };

  const onDelete = async (k: EducatorClassRow) => {
    if (k.role !== "owner") return;
    if (!(await confirm({ title: `Delete class "${k.name}"? All its activities will be deleted too.`, tone: 'danger' }))) return;
    try {
      await deleteClass(k.id);
      await reload();
    } catch (e: any) {
      alert(e.message || "Failed to delete class");
    }
  };

  const onAcceptInvite = async (code: string) => {
    setInviteBusy(code);
    setInviteMsg(null);
    try {
      await acceptClassEducatorInviteByCode(code);
      setInviteMsg({ type: "ok", text: "Invite accepted! The class has been added below." });
      await reload();
    } catch (e: any) {
      setInviteMsg({ type: "err", text: e?.message || "Failed to accept invite" });
    } finally {
      setInviteBusy(null);
    }
  };

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="page-title">Your classes</h1>
          <p className="page-subtitle">Everything you teach, in one place.</p>
        </div>
        <button onClick={() => setShowNew(s => !s)} className="btn-primary"><Plus className="w-4 h-4"/> New class</button>
      </div>

      {invites.length > 0 && (
        <div className="surface p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-brand-purple"/>
            <div className="font-semibold text-ink">You have been invited to co-teach</div>
          </div>
          <p className="text-sm text-ink-muted mb-4">Accept to gain access to the class.</p>
          {inviteMsg && (
            <div className={`text-sm mb-3 ${inviteMsg.type === "ok" ? "text-[#2E7D4F]" : "text-red-600"}`}>{inviteMsg.text}</div>
          )}
          <div className="space-y-1">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-2.5 border-t border-hairline first:border-0">
                <span className="w-8 h-8 rounded-lg shrink-0" style={{ background: i.class_color || "#7057D9" }}/>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink truncate">{i.class_name}</div>
                  <div className="text-xs text-ink-faint truncate">Invited by {i.inviter_name || "another educator"} · expires {new Date(i.expires_at).toLocaleDateString()}</div>
                </div>
                <code className="code-chip text-xs hidden sm:block">{i.code}</code>
                <button disabled={inviteBusy === i.code} onClick={() => onAcceptInvite(i.code)} className="btn-secondary py-1.5 px-3 text-sm"><Check className="w-4 h-4"/> Accept</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pelan && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${pelan.pelan === "pro" ? "bg-violet-50 text-brand-purple border border-violet-200" : "bg-[#F3F2F7] text-ink-muted border border-hairline"}`}>
            {pelan.pelan === "pro" ? "Pro plan" : "Free plan"}
          </span>
          <span className="text-ink-muted">
            {tanpaHad(pelan.hadKelas)
              ? `${pelan.kelasDigunakan} classes`
              : `Classes: ${pelan.kelasDigunakan} of ${pelan.hadKelas} used`}
          </span>
          {!tanpaHad(pelan.hadKelas) && pelan.kelasDigunakan >= (pelan.hadKelas ?? 0) && (
            <span className="text-ink-faint">Delete a class or upgrade to add more.</span>
          )}
        </div>
      )}

      {showNew && (
        <div className="surface p-5 mb-6">
          <div className="font-semibold text-ink mb-4">Create a class</div>
          <label className="block text-sm font-medium text-ink mb-1.5">Class name</label>
          <input className="input mb-4" placeholder="e.g. Kursus Pembangunan Laman Web" value={name} onChange={e => setName(e.target.value)}/>
          <label className="block text-sm font-medium text-ink mb-1.5">Description <span className="text-ink-faint font-normal">(optional)</span></label>
          <input className="input mb-4" placeholder="What is this class about?" value={desc} onChange={e => setDesc(e.target.value)}/>
          <div className="flex items-center gap-3">
            <label className="text-sm text-ink-muted">Colour</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-9 h-9 rounded-lg border border-hairline bg-white p-0.5"/>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
              <button type="button" disabled={busy} onClick={onCreate} className="btn-primary">{busy ? "Creating…" : "Create class"}</button>
            </div>
          </div>
          {err && <div className="text-sm text-red-600 mt-3">{err}</div>}
        </div>
      )}

      {!showNew && err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : classes.length === 0 ? (
        <div className="surface py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-6 h-6 text-brand-purple"/>
          </div>
          <div className="section-title mb-1">Start with a class.</div>
          <p className="text-sm text-ink-muted mb-5">A class holds your learning board, activities, quizzes and rankings.</p>
          <button onClick={() => setShowNew(true)} className="btn-primary">Create your first class</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {classes.map(k => (
            <div key={k.id} className="card hover:border-[#D8D9E0] transition">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl shrink-0 mt-0.5" style={{ background: k.color || "#7057D9" }}/>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/educator/classes/${k.id}`} className="font-semibold text-ink truncate hover:text-brand-purple transition">{k.name}</Link>
                    {k.ended_at && <span data-class-pill="ended" className="shrink-0 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Ended</span>}
                  </div>
                  {k.description
                    ? <div className="text-sm text-ink-muted truncate mt-0.5">{k.description}</div>
                    : <div className="text-sm text-ink-faint mt-0.5">{roleLabel(k.role)}</div>}
                </div>
                <RowMenu items={[
                  ...(k.role === "owner" ? [
                    { label: "Duplicate class", icon: <CopyPlus className="w-4 h-4"/>, onSelect: () => openDuplicate(k) },
                    { label: "Delete class", icon: <Trash2 className="w-4 h-4"/>, danger: true, onSelect: () => onDelete(k) },
                  ] : [
                    { label: "Leave class", icon: <UserIcon className="w-4 h-4"/>, danger: true, onSelect: () => onLeave(k) },
                  ]),
                ]}/>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-hairline">
                <code className="code-chip text-xs">{k.join_code}</code>
                <button onClick={() => navigator.clipboard.writeText(k.join_code)} className="btn-quiet text-brand-purple"><Copy className="w-3.5 h-3.5"/>Copy</button>
                <Link href={`/educator/classes/${k.id}`} className="ml-auto btn-quiet text-brand-purple">Open →</Link>
              </div>
            </div>
          ))}
        </div>      )}
      {dupTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !dupBusy && setDupTarget(null)}>
          <div onClick={(e)=>e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Duplicate class</h3>
              <button onClick={()=>setDupTarget(null)} disabled={dupBusy} className="text-gray-500 hover:text-gray-900">✕</button>
            </div>
            <label className="block text-xs font-medium text-gray-700 mb-1">New class title</label>
            <input value={dupTitle} onChange={(e)=>setDupTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={`Copy of ${dupTarget.name}`} />
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupLB} onChange={(e)=>setDupLB(e.target.checked)} className="rounded"/> Copy learning board</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupAct} onChange={(e)=>setDupAct(e.target.checked)} className="rounded"/> Copy activities</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupMem} onChange={(e)=>setDupMem(e.target.checked)} className="rounded"/> Copy members</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupEdu} onChange={(e)=>setDupEdu(e.target.checked)} className="rounded"/> Copy educators</label>
            </div>
            <details className="mb-4">
              <summary className="text-xs font-medium text-gray-700 cursor-pointer select-none">Advanced / Template options</summary>
              <div className="mt-2 space-y-2 pl-1">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupTpl} onChange={(e)=>setDupTpl(e.target.checked)} className="rounded"/> Save as reusable template <span className="text-xs text-gray-500">(strips content, keeps structure)</span></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupDraft} onChange={(e)=>setDupDraft(e.target.checked)} className="rounded"/> Save as draft <span className="text-xs text-gray-500">(don't publish until reviewed)</span></label>
              </div>
            </details>
            {dupErr && <div className="text-xs text-red-600 mb-2">{dupErr}</div>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={()=>setDupTarget(null)} disabled={dupBusy} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={onDuplicate} disabled={dupBusy} className="btn-primary py-1.5 px-3 text-sm">{dupBusy ? 'Duplicating…' : 'Duplicate'}</button>
            </div>
          </div>
        </div>
      )}

    </Shell>
  );
}
