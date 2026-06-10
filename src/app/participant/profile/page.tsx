"use client";
import { PARTICIPANT_TABS } from "@/lib/participantTabs";
import Shell from "@/components/Shell";
import ProfileView from "@/components/ProfileView";
import { Home, Compass, Trophy, Users, User as UserIcon, BookOpen } from "lucide-react";


export default function Page() {
  return (
    <Shell tabs={PARTICIPANT_TABS}>
      <ProfileView role="participant" />
    </Shell>
  );
}
