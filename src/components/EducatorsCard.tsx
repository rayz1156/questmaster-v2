"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "@/lib/session";
import {
  listClassEducators,
  listClassEducatorInvites,
  inviteClassEducator,
  revokeClassEducatorInvite,
  removeClassEducator,
  transferClassOwnership,
} from "@/lib/data";
import type { ClassEducator, ClassEducatorInvite } from "@/lib/types";
import { Copy, Trash2, Crown, UserPlus, ShieldCheck, RefreshCw } from "lucide-react";

type Props = { classId: string };

export default function EducatorsCard({ classId }: Props) {
  const { user } = useSession();
  const meId = user?.id || null;
  const [educators, setEducators] = useState<ClassEducator[]>([]);
  const [invites, setInvites] = useState<ClassEducatorInvite[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [lastInvite, setLastInvite] = useState<{ code: string; email: string } | null>(null);

  const me = educators.find((e) => e.educator_id === meId);
  const isOwner = me?.role === "owner";

  const reload = useCallback(async () => {
    try {
      const eds = await listClassEducators(classId);
      setEducators(eds);
      // invites are owner-only; list call still returns [] for non-owners (RLS guards it)
      try {
        const inv = await listClassEducatorInvites(classId);
        setInvites(inv);
      } catch {
        setInvites([]);
      }
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message || "Failed to load educators" });
    }
  }, [classId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await inviteClassEducator(classId, email.trim());
      setLastInvite({ code: res.code, email: res.email });
      setEmail("");
      let emailStatus = "";
      try {
        const r = await fetch("/api/educator-invites/notify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ classId, email: res.email, code: res.code }),
        });
        if (r.ok) {
          emailStatus = ` Invite email sent to ${res.email}.`;
        } else {
          const j = await r.json().catch(() => ({}));
          emailStatus = ` (email not sent: ${j.error || r.status})`;
        }
      } catch (mailErr: any) {
        emailStatus = ` (email not sent: ${mailErr?.message || "network"})`;
      }
      setMsg({ type: "ok", text: `Invite created.${emailStatus} Share the code with ${res.email} as a fallback.` });
      await reload();
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message || "Failed to invite" });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    if (!confirm("Revoke this invite?")) return;
    try {
      await revokeClassEducatorInvite(inviteId);
      await reload();
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message || "Failed to revoke" });
    }
  }

  async function handleRemove(educatorId: string, name: string) {
    if (!confirm(`Remove ${name} from this class? They will lose access immediately.`)) return;
    try {
      await removeClassEducator(classId, educatorId);
      await reload();
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message || "Failed to remove" });
    }
  }

  async function handleTransfer(targetId: string, targetName: string) {
    if (
      !confirm(
        `Transfer ownership of this class to ${targetName}?\n\nYou will become a co-creator and lose the ability to delete the class, remove other educators, or transfer ownership again.`
      )
    )
      return;
    try {
      await transferClassOwnership(classId, targetId);
      setMsg({ type: "ok", text: `Ownership transferred to ${targetName}.` });
      await reload();
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message || "Failed to transfer ownership" });
    }
  }

  const pending = invites.filter((i) => i.status === "pending");

  return (
    <div className="card mb-3">
      <div className="font-semibold mb-2 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" /> Educators ({educators.length})
      </div>

      <div className="space-y-1 mb-3">
        {educators.map((e) => {
          const name = e.display_name || e.email || ("User " + e.educator_id.slice(0, 8));
          const isMe = e.educator_id === meId;
          return (
            <div key={e.educator_id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium flex items-center gap-1">
                  {e.role === "owner" && <Crown className="w-3 h-3 text-yellow-500" />}
                  {name}
                  {isMe && <span className="text-xs text-gray-400">(you)</span>}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {e.email || ""}
                  <span className="ml-2 px-1 bg-gray-100 rounded">{e.role === "owner" ? "Owner" : "Co-creator"}</span>
                </div>
              </div>
              {isOwner && !isMe && e.role === "co_creator" && (
                <>
                  <button
                    onClick={() => handleTransfer(e.educator_id, name)}
                    className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                    title="Transfer ownership"
                  >
                    <RefreshCw className="w-3 h-3 inline" /> Transfer
                  </button>
                  <button
                    onClick={() => handleRemove(e.educator_id, name)}
                    className="text-red-600 px-2 py-1 rounded hover:bg-red-50"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {isOwner && (
        <>
          <form onSubmit={handleInvite} className="flex gap-2 mb-2">
            <input
              type="email"
              required
              placeholder="Educator email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input flex-1 text-sm py-2"
            />
            <button type="submit" disabled={busy} className="btn-primary py-2 px-3 text-sm flex items-center gap-1">
              <UserPlus className="w-4 h-4" /> Invite
            </button>
          </form>

          {lastInvite && (
            <div className="text-xs bg-purple-50 border border-purple-200 rounded p-2 mb-2">
              <div className="text-gray-600">Invite code for {lastInvite.email}:</div>
              <div className="flex items-center gap-2 mt-1">
                <code className="font-mono text-base bg-white px-2 py-1 rounded border flex-1 text-center">{lastInvite.code}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(lastInvite.code);
                    setMsg({ type: "ok", text: "Code copied" });
                  }}
                  className="btn-primary py-1 px-2 text-xs flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              <div className="text-gray-500 mt-1">
                They sign in with this email and paste the code at <span className="font-mono">/educator/invites</span>.
              </div>
            </div>
          )}

          {pending.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-gray-600 mb-1">Pending invites ({pending.length})</div>
              <div className="space-y-1">
                {pending.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                    <div className="flex-1 min-w-0 truncate">{inv.email}</div>
                    <code className="font-mono bg-gray-100 px-1 rounded">{inv.code}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inv.code);
                        setMsg({ type: "ok", text: "Code copied" });
                      }}
                      className="text-gray-500 hover:text-gray-700"
                      title="Copy code"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      className="text-red-600 hover:bg-red-50 px-1 rounded"
                      title="Revoke"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {msg && (
        <div className={"text-xs mt-2 " + (msg.type === "ok" ? "text-blue-700" : "text-red-600")}>{msg.text}</div>
      )}
    </div>
  );
}
