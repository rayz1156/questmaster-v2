"use client";
import Shell from "@/components/Shell";
import { EDU_TABS } from '@/lib/eduTabs';
import ProfileView from "@/components/ProfileView";
import EmailIntegrationCard from "@/components/EmailIntegrationCard";
import { GraduationCap, ListChecks, Users, BarChart3, User as UserIcon, Activity } from "lucide-react";

export default function Page() {
  return (
    <Shell tabs={EDU_TABS}>
      <EmailIntegrationCard />
      <ProfileView role="educator" />
    </Shell>
  );
}
