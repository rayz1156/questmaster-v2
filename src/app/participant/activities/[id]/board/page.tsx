"use client";
/**
 * Papan penghantaran aktiviti (peserta), pembungkus rupa v3 KZ-023:
 * PageHead + Card di sekeliling QuestBoardView sedia ada.
 * Komponen papan tidak ditulis semula.
 */
import ParticipantShell from "@/components/ParticipantShell";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Board, getBoardForHunt } from "@/lib/boards";
import QuestBoardView from "@/components/boards/QuestBoardView";
import { Alert, Card, PageHead } from "@/components/ui";


export default function PartActivityBoardPage() {
  const params = useParams<{ id: string }>();
  const huntId = params.id;
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        setUserId(u.user?.id || null);
        const b = await getBoardForHunt(huntId);
        setBoard(b);
      } catch (e) { setErr((e as { message?: string })?.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, [huntId]);

  return (
    <ParticipantShell>
      <PageHead
        title="Activity board"
        secondaryActions={[
          { label: "Back to Activities", icon: <ArrowLeft className="w-4 h-4" />, href: "/participant/activities" },
        ]}
      />
      {loading && <p className="text-[14px] text-ink-muted">Memuatkan…</p>}
      {err && <Alert tone="danger">{err}</Alert>}
      {!loading && !board && <p className="text-[14px] text-ink-muted">Board hantaran belum dicipta untuk aktiviti ini.</p>}
      {board && (
        <Card padat>
          <QuestBoardView board={board} canManage={false} currentUserId={userId} />
        </Card>
      )}
    </ParticipantShell>
  );
}