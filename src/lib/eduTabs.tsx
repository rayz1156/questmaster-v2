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
} from "lucide-react";

export type EduTab = {
  href: string;
  label: string;
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
    group: "Main",
    icon: <GraduationCap className="w-5 h-5" />,
  },
  {
    href: "/educator/activities",
    label: "Activities",
    group: "Teaching",
    icon: <Compass className="w-5 h-5" />,
  },
  {
    href: "/educator/live",
    label: "Live Quiz",
    group: "Teaching",
    icon: <Radio className="w-5 h-5" />,
  },
  {
    href: "/educator/library",
    label: "Library",
    group: "Teaching",
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    href: "/educator/rankings",
    label: "Rankings",
    group: "Assessment",
    icon: <Trophy className="w-5 h-5" />,
  },
  {
    href: "/educator/outcomes",
    label: "Outcomes",
    group: "Assessment",
    icon: <Target className="w-5 h-5" />,
  },
  {
    href: "/educator/certificates",
    label: "Certificates",
    group: "Assessment",
    icon: <Award className="w-5 h-5" />,
  },
  {
    href: "/educator/analytics",
    label: "Analytics",
    group: "Assessment",
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    href: "/educator/teams",
    label: "Teams",
    group: "Account",
    icon: <Users className="w-5 h-5" />,
  },
  {
    href: "/educator/invites",
    label: "Invites",
    group: "Account",
    icon: <MailPlus className="w-5 h-5" />,
  },
  {
    href: "/educator/profile",
    label: "Profile",
    group: "Account",
    icon: <UserIcon className="w-5 h-5" />,
  },
];
