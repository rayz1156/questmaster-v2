"use client";
import Link from "next/link";
import Shell from "@/components/Shell";
import { useEffect, useState } from "react";
import { ListChecks, Users, BarChart3, Plus, Trash2, GraduationCap, Copy, User as UserIcon, Mail, Check } from "lucide-react";
import { listMyEducatorClasses, createClass, deleteClass, listMyClassEducatorInvites, acceptClassEducatorInviteByCode } from "@/lib/data";
import type { EducatorClassRow, MyClassEducatorInvite } from "@/lib/types";

const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "co-creator" || role === "co_creator") return "Co-creator";
  if (role === "co-educator" || role === "co_educator") return "Co-educator";
  return role;
}

export default function EduClasses() {
  const [classes, setClasses] = useState<EducatorClassRow[]>([]);
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

  const reload = async () => {
    try {
      const [cls, inv] = await Promise.all([listMyEducatorClasses(), listMyClassEducatorInvites()]);
      setClasses(cls);
      setInvites(inv);
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
      setErr(e.message || "Failed to create class");
    } finally { setBusy(false); }
  };

  const onDelete = async (k: EducatorClassRow) => {
    if (k.role !== "owner") return;
    if (!confirm(`Delete class "${k.name}"? All its activities will be deleted too.`)) return;
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
    <Shell tabs={tabs}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="page-title">My Classes</h2>
        <button onClick={() => setShowNew(s => !s)} className="btn-primary py-1 px-3 text-sm flex items-center gap-1"><Plus className="w-4 h-4"/> New Class</button>
      </div>

      {invites.length > 0 && (
        <div className="card mb-4 border-l-4" style={{ borderLeftColor: "#6366f1" }}>
          <div className="flex items-center gap-2 mb-1"><Mail className="w-4 h-4 text-indigo-600"/><div className="font-semibold">Pending educator invites ({invites.length})</div></div>
          <p className="text-xs text-gray-500 mb-3">You have been invited to co-educate the following classes. Accept to gain access.</p>
          {inviteMsg && (
            <div className={`text-xs mb-2 ${inviteMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>{inviteMsg.text}</div>
          )}
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-2 border-b last:border-0">
                <div className="w-6 h-6 rounded-md shrink-0" style={{ background: i.class_color || "#6366f1" }}/>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.class_name}</div>
                  <div className="text-xs text-gray-500 truncate">Invited by {i.inviter_name || "another educator"} · expires {new Date(i.expires_at).toLocaleDateString()}</div>
                </div>
                <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{i.code}</code>
                <button disabled={inviteBusy === i.code} onClick={() => onAcceptInvite(i.code)} className="btn-primary py-1 px-3 text-sm flex items-center gap-1"><Check className="w-4 h-4"/> Accept</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNew && (
        <div className="card mb-4">
          <div className="font-semibold mb-2">Create new class</div>
          <input className="input w-full mb-2" placeholder="Class name" value={name} onChange={e => setName(e.target.value)}/>
          <input className="input w-full mb-2" placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)}/>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 rounded"/>
            <button type="button" disabled={busy} onClick={onCreate} className="btn-primary ml-auto py-1 px-3 text-sm">{busy ? "Creating…" : "Create"}</button>
          </div>
          {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
        </div>
      )}

      {!showNew && err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : classes.length === 0 ? (
        <p className="text-sm text-gray-500">No classes yet. Create one to organise your activities, teams and rankings.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {classes.map(k => (
            <div key={k.id} className="card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: k.color || "#6366f1" }}/>
                  <div className="min-w-0 flex-1">
                    <Link href={`/educator/classes/${k.id}`} className="font-semibold truncate block">{k.name}</Link>
                    {k.description && <div className="text-xs text-gray-500 truncate">{k.description}</div>}
                  </div>
                </div>
                {k.role === "owner" ? (
                  <button onClick={() => onDelete(k)} className="text-red-600 hover:bg-red-50 rounded-lg px-2 py-1"><Trash2 className="w-4 h-4"/></button>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 shrink-0">{roleLabel(k.role)}</span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center gap-2">
                Code: <code className="font-mono bg-gray-100 px-2 py-0.5 rounded">{k.join_code}</code>
                <button onClick={() => navigator.clipboard.writeText(k.join_code)} className="text-blue-600 flex items-center gap-1"><Copy className="w-3 h-3"/>copy</button>
                <Link href={`/educator/classes/${k.id}`} className="ml-auto text-brand-purple font-semibold">Manage →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
