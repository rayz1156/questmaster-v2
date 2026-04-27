"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { acceptClassInvite } from "@/lib/data";
import { getSession } from "@/lib/session";

export default function JoinByToken() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [msg, setMsg] = useState("Joining…");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!getSession()) { router.replace(`/login?next=/join/${params.token}`); return; }
      try {
        await acceptClassInvite(params.token);
        setMsg("Joined! Redirecting…");
        setTimeout(() => router.replace('/participant'), 800);
      } catch (e: any) { setErr(e.message || 'Invalid invite'); }
    })();
  }, []);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card max-w-sm w-full text-center">
        <h1 className="font-bold text-lg mb-1">Class invite</h1>
        {err ? <p className="text-sm text-red-600">{err}</p> : <p className="text-sm text-gray-600">{msg}</p>}
      </div>
    </div>
  );
}
