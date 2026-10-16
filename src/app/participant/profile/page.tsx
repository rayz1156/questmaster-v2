"use client";
/**
 * Profil peserta, rupa v3 KZ-023: PageHead ringkas + Card di sekeliling
 * ProfileView sedia ada. Komponen ProfileView tidak ditulis semula.
 */
import ParticipantShell from "@/components/ParticipantShell";
import ProfileView from "@/components/ProfileView";
import { Card, PageHead } from "@/components/ui";


export default function Page() {
  return (
    <ParticipantShell>
      <PageHead title="My profile" />
      <Card padat className="overflow-hidden">
        <ProfileView role="participant" />
      </Card>
    </ParticipantShell>
  );
}
