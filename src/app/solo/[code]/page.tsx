"use client";

/**
 * KZ-053: halaman permainan Lumba Solo. LumbaSolo mengendalikan semua fasa
 * (maklumat, lumba, keputusan) supaya boleh dimainkan semula tanpa muat
 * semula halaman.
 */
import { useParams } from "next/navigation";
import LumbaSolo from "@/components/solo/LumbaSolo";

export default function HalamanLumbaSolo() {
  const { code } = useParams<{ code: string }>() as { code: string };
  return <LumbaSolo kod={code} />;
}