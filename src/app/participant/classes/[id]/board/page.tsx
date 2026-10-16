"use client";
/**
 * Papan pengenalan kelas (peserta), pembungkus rupa v3 KZ-023:
 * PageHead + Card di sekeliling IntroBoardView sedia ada.
 * Komponen papan tidak ditulis semula.
 */
import ParticipantShell from "@/components/ParticipantShell";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Board, getBoardForClass } from "@/lib/boards";
import IntroBoardView from "@/components/boards/IntroBoardView";
import { Alert, Card, PageHead } from "@/components/ui";


export default function PartClassBoardPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        setUserId(u.user?.id || null);
        const b = await getBoardForClass(classId);
        setBoard(b);
      } catch (e) { setErr((e as { message?: string })?.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, [classId]);

  return (
    <ParticipantShell>
      <PageHead
        title="Intro board"
        secondaryActions={[
          { label: "Back", icon: <ArrowLeft className="w-4 h-4" />, href: "/participant/home" },
        ]}
      />
      {loading && <p className="text-[14px] text-ink-muted">Memuatkan…</p>}
      {err && <Alert tone="danger">{err}</Alert>}
      {!loading && !board && <p className="text-[14px] text-ink-muted">Board pengenalan belum dicipta untuk kelas ini.</p>}
      {board && (
        <Card padat>
          <IntroBoardView board={board} canManage={false} currentUserId={userId} />
        </Card>
      )}
    </ParticipantShell>
  );
}