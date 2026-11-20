/**
 * Destinasi utama pendidik, semakan Oktober 2026 (KZ-021).
 *
 * KZ-021 (KZ-DS-v3 bahagian 3): bar sisi pendidik kini berkumpulan.
 * Setiap tab membawa medan `group` supaya Shell memaparkan tajuk
 * kumpulan tanpa memecahkan pemanggil `<Shell tabs={EDU_TABS}>` lama.
 *
 * Kumpulan mengikut spesifikasi:
 *   MAIN       rumah pendidik. Tiada halaman `/educator` berasingan,
 *              jadi rumahnya ialah `/educator/classes` (laluan yang
 *              wujud), seperti diminta KZ-DS-v3 bahagian 3.
 *   TEACHING   Activities, Live Quiz, Library.
 *   ASSESSMENT Rankings, Outcomes, Certificates, Analytics.
 *   ACCOUNT    Teams, Invites, Profile.
 *
 * Semua laluan di bawah disahkan wujud (git ls-files src/app | grep
 * page.tsx). `match` menyenaraikan laluan lain yang masih dikira
 * destinasi yang sama, contohnya halaman sesi kuiz langsung menyalakan
 * Live Quiz.
 */
import {
  GraduationCap,
  Compass,
  Radio,
  BookOpen,
  Trophy,
  Target,
  Award,
  BarChart3,
  Users,
  MailPlus,
  User as UserIcon,
  Bot,
} from "lucide-react";
import type { KunciKamus } from "@/lib/i18n";

export type EduTab = {
  href: string;
  label: string;
  /** Kunci i18n label; `label` kekal English sebagai fallback. */
  kunci?: KunciKamus;
  /** Kunci i18n kumpulan; `group` kekal English sebagai fallback. */
  kunciGroup?: KunciKamus;
  /** Kumpulan bar sisi (KZ-021). */
  group?: string;
  /** Ikon lucide 20px. */
  icon?: React.ReactNode;
  /** Awalan laluan tambahan yang dikira aktif untuk tab ini. */
  match?: string[];
};

export const EDU_TABS: EduTab[] = [
  {
    href: "/educator/classes",
    label: "Classes",
    kunci: "nav.eduClasses",
    group: "Main",
    kunciGroup: "nav.groupMain",
    icon: <GraduationCap className="w-5 h-5" />,
  },
  {
    href: "/educator/activities",
    label: "Activities",
    kunci: "nav.activities",
    group: "Teaching",
    kunciGroup: "nav.groupTeaching",
    icon: <Compass className="w-5 h-5" />,
  },
  {
    href: "/educator/live",
    label: "Live Quiz",
    kunci: "nav.eduLiveQuiz",
    group: "Teaching",
    kunciGroup: "nav.groupTeaching",
    icon: <Radio className="w-5 h-5" />,
  },
  {
    href: "/educator/ai-rooms",
    label: "AI Chatroom",
    kunci: "nav.eduAiChatroom",
    group: "Teaching",
    kunciGroup: "nav.groupTeaching",
    icon: <Bot className="w-5 h-5" />,
  },
  {
    href: "/educator/library",
    label: "Library",
    kunci: "nav.eduLibrary",
    group: "Teaching",
    kunciGroup: "nav.groupTeaching",
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    href: "/educator/rankings",
    label: "Rankings",
    kunci: "nav.eduRankings",
    group: "Assessment",
    kunciGroup: "nav.groupAssessment",
    icon: <Trophy className="w-5 h-5" />,
  },
  {
    href: "/educator/outcomes",
    label: "Outcomes",
    kunci: "nav.eduOutcomes",
    group: "Assessment",
    kunciGroup: "nav.groupAssessment",
    icon: <Target className="w-5 h-5" />,
  },
  {
    href: "/educator/certificates",
    label: "Certificates",
    kunci: "nav.certificates",
    group: "Assessment",
    kunciGroup: "nav.groupAssessment",
    icon: <Award className="w-5 h-5" />,
  },
  {
    href: "/educator/analytics",
    label: "Analytics",
    kunci: "nav.eduAnalytics",
    group: "Assessment",
    kunciGroup: "nav.groupAssessment",
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    href: "/educator/teams",
    label: "Teams",
    kunci: "nav.teams",
    group: "Account",
    kunciGroup: "nav.groupAccount",
    icon: <Users className="w-5 h-5" />,
  },
  {
    href: "/educator/invites",
    label: "Invites",
    kunci: "nav.eduInvites",
    group: "Account",
    kunciGroup: "nav.groupAccount",
    icon: <MailPlus className="w-5 h-5" />,
  },
  {
    href: "/educator/profile",
    label: "Profile",
    kunci: "nav.profile",
    group: "Account",
    kunciGroup: "nav.groupAccount",
    icon: <UserIcon className="w-5 h-5" />,
  },
];
