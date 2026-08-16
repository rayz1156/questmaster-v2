"use client";
import ParticipantShell from "@/components/ParticipantShell";
import ProfileView from "@/components/ProfileView";
import { Home, Compass, Trophy, Users, User as UserIcon, BookOpen } from "lucide-react";


export default function Page() {
  return (
    <ParticipantShell>
      <ProfileView role="participant" />
    </ParticipantShell>
  );
}
