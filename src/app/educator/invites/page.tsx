"use client";

export const dynamic = "force-dynamic";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import { ListChecks, Users, BarChart3, Settings as SettingsIcon, GraduationCap, Mail, Check } from "lucide-react";
import {
  acceptClassEducatorInviteByCode,
  listMyClassEducatorInvites,
} from "@/lib/data";
import type { MyClassEducatorInvite } from "@/lib/types";

const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5" /> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5" /> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5" /> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5" /> },
  { href: "/educator/profile", label: "Profile", icon: <SettingsIcon className="w-5 h-5" /> },
];

function EducatorInvitesPageInner() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [invites, setInvites] = useState<MyClassEducatorInvite[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    try {
      const list = await listMyClassEducatorInvites();
      setInvites(list);
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message || "Failed to load invites" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, []);

  const search = useSearchParams();
  useEffect(() => {
    const c = (search?.get("code") || "").trim().toUpperCase();
    if (c) setCode(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(c: string) {
    if (!c.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const classId = await acceptClassEducatorInviteByCode(c.trim());
      setMsg({ type: "ok", text: "Invite accepted! Redirecting to your class..." });
      setTimeout(() => router.push(`/educator/classes/${classId}`), 600);
    } catch (err: any) {
      setMsg({ type: "err", text: err?.message || "Failed to accept invite" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell tabs={tabs}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/educator/classes" className="text-sm text-gray-500">← Classes</Link>
      </div>

      <div className="card mb-3">
        <div className="font-semibold mb-2 flex items-center gap-2"><Mail className="w-4 h-4" /> Accept an educator invite</div>
        <p className="text-xs text-gray-500 mb-3">
          Paste the 8-character invite code your colleague shared with you. The invite must be addressed to the email you signed in with.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            accept(code);
          }}
          className="flex gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. K7M9P3X2"
            className="input flex-1 font-mono uppercase tracking-wider text-center"
            maxLength={12}
            autoFocus
          />
          <button type="submit" disabled={busy || !code.trim()} className="btn-primary py-2 px-4 flex items-center gap-1">
            <Check className="w-4 h-4" /> Accept
          </button>
        </form>
        {msg && (
          <div className={"text-xs mt-2 " + (msg.type === "ok" ? "text-green-700" : "text-red-600")}>{msg.text}</div>
        )}
      </div>

      <div className="card">
        <div className="font-semibold mb-2">Pending invites for you ({invites.length})</div>
        {loading ? (
          <p className="text-xs text-gray-500">Loading...</p>
        ) : invites.length === 0 ? (
          <p className="text-xs text-gray-500">You have no pending educator invites.</p>
        ) : (
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-2 border-b last:border-0">
                <div
                  className="w-8 h-8 rounded-lg shrink-0"
                  style={{ background: i.class_color || "#6366f1" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.class_name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    Invited by {i.inviter_name || "another educator"} · expires {new Date(i.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{i.code}</code>
                <button
                  disabled={busy}
                  onClick={() => accept(i.code)}
                  className="btn-primary py-1 px-3 text-sm flex items-center gap-1"
                >
                  <Check className="w-4 h-4" /> Accept
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function EducatorInvitesPage() {
  return (
    <Suspense fallback={null}>
      <EducatorInvitesPageInner />
    </Suspense>
  );
}
