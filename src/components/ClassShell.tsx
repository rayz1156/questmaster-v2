"use client";

/**
 * Kepala kelas yang dikongsi oleh setiap skrin dalam sesebuah kelas, rupa v3
 * (KZ-022b).
 *
 * Kepala guna PageHead varian breadcrumb ("Classes / <nama kelas>") dengan
 * keterangan ringkas sedia ada (penerangan kelas dan bilangan pelajar), dan
 * navigasi antara halaman kelas guna Tabs kit sebagai pautan. Tab aktif
 * datang daripada prop `current` melalui prop `aktif` pada setiap item (lihat
 * Tabs) supaya tepat untuk setiap laluan kelas; halaman global yang meminjam
 * kepala ini (Activities, Live Quiz, Rankings, Teams) tidak menyalakan
 * mana-mana tab kerana ia bukan halaman kelas.
 *
 * Enam tab kelas (laluan SEDIA ADA sahaja, ikut tiket KZ-022b):
 *   Overview        kod, jemputan, pendidik, tetapan
 *   People          pelajar, kumpulan, pendidik
 *   Board           papan pengenalan kelas
 *   Learning Board  papan pembelajaran
 *   Certificates    sijil
 *   Peer review     penilaian rakan sebaya
 *
 * Aliran data tidak berubah: kelas dimuat sekali (atau diterima melalui prop
 * `klass`), kod kelas disalin ke papan keratan, pautan jemputan kekal pada
 * laluan yang sama seperti sebelum ini.
 */

import { useEffect, useState } from "react";
import { Copy, Check, UserPlus } from "lucide-react";
import { getClass, type Klass } from "@/lib/data";
import { PageHead, Tabs } from "@/components/ui";
import { PAPAR_PENILAIAN_RAKAN } from "@/lib/ciriPaparan";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { terjemahBilangan } from "@/lib/i18n";
import type { KunciKamus } from "@/lib/i18n";

export type ClassTabKey =
  | "overview"
  | "people"
  | "board"
  | "learning"
  | "ai-rooms"
  | "lna"
  | "certificates"
  | "peer-review"
  // Kunci yang terus diterima supaya pemanggil sedia ada (halaman global
  // Activities, Live Quiz, Rankings, Teams) tidak pecah. Tiada tab kelas
  // padan, jadi tiada tab disalakan pada halaman tersebut.
  | "activities"
  | "quizzes"
  | "rankings";

export default function ClassShell({
  classId,
  current,
  klass: klassProp,
  children,
}: {
  classId: string;
  current: ClassTabKey;
  /** Hantar kelas kalau halaman sudah memuatkannya, untuk elak pertanyaan kedua. */
  klass?: Klass | null;
  children: React.ReactNode;
}) {
  const { t, bahasa } = useBahasa();
  const [klass, setKlass] = useState<Klass | null>(klassProp ?? null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (klassProp) { setKlass(klassProp); return; }
    let alive = true;
    getClass(classId)
      .then((k) => { if (alive) setKlass(k as Klass); })
      .catch(() => { /* kepala kekal senyap kalau kelas gagal dimuat */ });
    return () => { alive = false; };
  }, [classId, klassProp]);

  const semuaTab: { key: ClassTabKey; label: string; kunci: KunciKamus; href: string }[] = [
    { key: "overview", label: t("kelas.overview"), kunci: "kelas.overview", href: `/educator/classes/${classId}` },
    { key: "people", label: t("kelas.people"), kunci: "kelas.people", href: `/educator/classes/${classId}/people` },
    { key: "board", label: t("kelas.board"), kunci: "kelas.board", href: `/educator/classes/${classId}/board` },
    { key: "learning", label: t("kelas.learningBoard"), kunci: "kelas.learningBoard", href: `/educator/classes/${classId}/learning-board` },
    { key: "ai-rooms", label: t("kelas.aiChatroom"), kunci: "kelas.aiChatroom", href: `/educator/classes/${classId}/ai-rooms` },
    { key: "lna", label: t("kelas.lna"), kunci: "kelas.lna", href: `/educator/classes/${classId}/lna` },
    { key: "certificates", label: t("kelas.certificates"), kunci: "kelas.certificates", href: `/educator/classes/${classId}/certificates` },
    { key: "peer-review", label: t("kelas.peerReview"), kunci: "kelas.peerReview", href: `/educator/classes/${classId}/peer-review` },
  ];
  // Tab Peer review disembunyikan bersama ciri (src/lib/ciriPaparan.ts).
  const tabs = semuaTab.filter((t) => PAPAR_PENILAIAN_RAKAN || t.key !== "peer-review");

  const copyCode = async () => {
    if (!klass?.join_code) return;
    try {
      await navigator.clipboard.writeText(klass.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* pelayar mungkin tidak membenarkan */ }
  };

  const studentCount = (klass as unknown as { member_count?: number } | null)?.member_count;

  // Keterangan ringkas sedia ada: penerangan kelas dan bilangan pelajar.
  // KZ-040: bilangan peserta ikut jamak bahasa semasa (student/students,
  // BM tanpa jamak nahu).
  const huraian = [
    klass?.description || null,
    typeof studentCount === "number"
      ? terjemahBilangan(
          bahasa,
          "kelas.studentOne",
          "kelas.studentOther",
          studentCount,
          { n: studentCount }
        )
      : null,
  ]
    .filter((x) => x != null)
    .join(" · ");

  return (
    <div>
      <PageHead
        crumb={t("kelas.crumb")}
        name={klass?.name || t("kelas.nameFallback")}
        description={huraian || undefined}
        secondaryActions={
          klass?.join_code
            ? [
                {
                  label: copied ? t("kelas.codeCopied") : t("kelas.classCodeOf", { kod: klass.join_code }),
                  icon: copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />,
                  onSelect: copyCode,
                },
              ]
            : []
        }
        primaryAction={{
          label: t("kelas.invitePeople"),
          icon: <UserPlus className="w-4 h-4" />,
          href: `/educator/classes/${classId}`,
        }}
      />

      <Tabs
        className="mb-7"
        items={tabs.map((t) => ({ label: t.label, href: t.href, aktif: t.key === current }))}
      />

      {children}
    </div>
  );
}
