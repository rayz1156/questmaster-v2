'use client';

/**
 * Learning. Kepala tersendiri dibuang; ClassShell sudah membawa breadcrumb,
 * nama kelas dan tab. Yang tinggal ialah satu ayat tentang apa skrin ini
 * untuk, kemudian terus kepada bahan.
 */

import { useParams } from 'next/navigation';
import Link from 'next/link';
import Shell from '@/components/Shell';
import ClassShell from '@/components/ClassShell';
import { EDU_TABS } from '@/lib/eduTabs';
import LearningBoardView from '@/components/learning-board/LearningBoardView';

export default function EducatorLearningBoardPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={classId} current="learning">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <h2 className="section-title">Everything for your next session.</h2>
            <p className="text-sm text-ink-muted mt-0.5">
              Organise your content, share resources and keep your class on track.
            </p>
          </div>
          <Link href={`/educator/classes/${classId}/board`} className="btn-quiet text-brand-purple">
            Intro board →
          </Link>
        </div>
        <div className="-mx-1">
          <LearningBoardView classId={classId} isEditor={true} />
        </div>
      </ClassShell>
    </Shell>
  );
}
