'use client';
/**
 * Learning Board kelas (peserta), pembungkus rupa v3 KZ-023:
 * PageHead + Card di sekeliling LearningBoardView sedia ada.
 * Komponen papan tidak ditulis semula.
 */
import ParticipantShell from "@/components/ParticipantShell";
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import LearningBoardView from '@/components/learning-board/LearningBoardView';
import { Card, PageHead } from '@/components/ui';


export default function ParticipantLearningBoardPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  return (
    <ParticipantShell>
      <PageHead
        title="Learning board"
        secondaryActions={[
          { label: 'Back', icon: <ArrowLeft className="w-4 h-4" />, href: '/participant/home' },
        ]}
      />
      <Card padat>
        <LearningBoardView classId={classId} isEditor={false} />
      </Card>
    </ParticipantShell>
  );
}