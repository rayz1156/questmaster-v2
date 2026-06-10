'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, ListChecks, Users, BarChart3, Activity, User as UserIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import { EDU_TABS } from '@/lib/eduTabs';
import LearningBoardView from '@/components/learning-board/LearningBoardView';

export default function EducatorLearningBoardPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  return (
    <Shell tabs={EDU_TABS}>
      <div className="min-h-screen bg-gray-50 text-gray-900">
<div className="px-4 md:px-6 py-4 flex items-center gap-3 border-b border-gray-200 bg-white">
          <Link href={`/educator/classes/${classId}`} className="text-gray-600 hover:text-gray-900 inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to class
          </Link>
          <h1 className="text-xl font-semibold ml-2">Learning Board</h1>
        </div>
        <LearningBoardView classId={classId} isEditor={true} />
      </div>
    </Shell>
  );
}
