// adminTabs.tsx
// Senarai destinasi ruang kerja admin. V2-011b: diselaraskan supaya
// sepadan dengan bar sisi AdminShell (Help kekal terasing di bawah bar
// sisi dan tidak ditulis di sini). Masih dieksport untuk keserasian
// dengan fail lama yang mengimportnya.
import {
  LayoutDashboard,
  Users,
  Map,
  ShieldCheck,
  ScrollText,
  GraduationCap,
  MessageSquare,
  Settings,
} from "lucide-react";
export const adminTabs = [
  { href: "/admin/overview", label: "Overview", icon: <LayoutDashboard className="w-5 h-5"/> },
  { href: "/admin/users", label: "Users", icon: <Users className="w-5 h-5"/> },
  { href: "/admin/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/admin/hunts", label: "Activities", icon: <Map className="w-5 h-5"/> },
  { href: "/admin/moderation", label: "Moderation", icon: <ShieldCheck className="w-5 h-5"/> },
  { href: "/admin/audit", label: "Audit", icon: <ScrollText className="w-5 h-5"/> },
  { href: "/admin/feedback", label: "Feedback", icon: <MessageSquare className="w-5 h-5"/> },
  { href: "/admin/settings", label: "Settings", icon: <Settings className="w-5 h-5"/> },
];
