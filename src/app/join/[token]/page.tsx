"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

export default function Page() {
  const { t } = useBahasa();
  const router = useRouter();
  useEffect(() => {
    router.replace("/participant/join");
  }, [router]);
  return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">{t("sertai.redirectingToJoin")}</p></div>;
}
