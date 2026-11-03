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
import { useBahasa } from "@/lib/i18n/BahasaProvider";

export default function Page() {
  const { t } = useBahasa();
  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        title={t('nav.profile')}
        description={t('educator.profile.desc')}
      />
      <EmailIntegrationCard />
      <ProfileView role="educator" />
    </Shell>
  );
}