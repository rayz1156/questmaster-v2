'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, ListChecks, Users, BarChart3, User as UserIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import LearningBoardView from '@/components/learning-board/LearningBoardView';

const tabs = [
  { href: '/educator/classes', label: 'Classes', icon: <GraduationCap className="w-5 h-5" /> },
  { href: '/educator/activities', label: 'Activities', icon: <ListChecks className="w-5 h-5" /> },
  { href: '/educator/teams', label: 'Teams', icon: <Users className="w-5 h-5" /> },
  { href: '/educator/rankings', label: 'Rankings', icon: <BarChart3 className="w-5 h-5" /> },
  { href: '/educator/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];

export default function EducatorLearningBoardPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  return (
    <Shell tabs={tabs}>
      <div className="bg-slate-950 min-h-screen">
        <div className="px-4 md:px-6 py-4 flex items-center gap-3 border-b border-slate-800">
          <Link href={`/educator/classes/${classId}`} className="text-slate-400 hover:text-white inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to class
          </Link>
          <h1 className="text-white text-lg font-semibold ml-2">Learning Board</h1>
        </div>
        <LearningBoardView classId={classId} isEditor={true} />
      </div>
    </Shell>
  );
}
