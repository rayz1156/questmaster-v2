"use client";
/**
 * Profile pendidik, rupa v3 KZ-022.
 *
 * Fail kecil yang membungkus komponen lain: cukup PageHead di atas;
 * EmailIntegrationCard dan ProfileView tidak diubah (komponen dalaman
 * besar di luar tiket ini).
 */
import Shell from "@/components/Shell";
import { EDU_TABS } from '@/lib/eduTabs';
import ProfileView from "@/components/ProfileView";
import EmailIntegrationCard from "@/components/EmailIntegrationCard";
import { PageHead } from "@/components/ui";

export default function Page() {
  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        title="Profile"
        description="Your account details, educator intro card and email integration."
      />
      <EmailIntegrationCard />
      <ProfileView role="educator" />
    </Shell>
  );
}