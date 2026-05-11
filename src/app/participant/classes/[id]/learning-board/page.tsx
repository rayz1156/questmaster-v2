'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, ListChecks, BarChart3, BookOpen, User as UserIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import LearningBoardView from '@/components/learning-board/LearningBoardView';

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <GraduationCap className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <ListChecks className="w-5 h-5" /> },
  { href: '/participant/learning', label: 'Learning', icon: <BookOpen className="w-5 h-5" /> },
  { href: '/participant/rankings', label: 'Rankings', icon: <BarChart3 className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];

export default function ParticipantLearningBoardPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  return (
    <Shell tabs={tabs}>
      <div className="min-h-screen bg-gray-50 text-gray-900">
<div className="px-4 md:px-6 py-4 flex items-center gap-3 border-b border-gray-200 bg-white">
          <Link href={`/participant/home`} className="text-gray-600 hover:text-gray-900 inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <h1 className="text-xl font-semibold ml-2">Learning Board</h1>
        </div>
        <LearningBoardView classId={classId} isEditor={false} />
      </div>
    </Shell>
  );
}
