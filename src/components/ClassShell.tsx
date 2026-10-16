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

export type ClassTabKey =
  | "overview"
  | "people"
  | "board"
  | "learning"
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

  const tabs: { key: ClassTabKey; label: string; href: string }[] = [
    { key: "overview", label: "Overview", href: `/educator/classes/${classId}` },
    { key: "people", label: "People", href: `/educator/classes/${classId}/people` },
    { key: "board", label: "Board", href: `/educator/classes/${classId}/board` },
    { key: "learning", label: "Learning Board", href: `/educator/classes/${classId}/learning-board` },
    { key: "certificates", label: "Certificates", href: `/educator/classes/${classId}/certificates` },
    { key: "peer-review", label: "Peer review", href: `/educator/classes/${classId}/peer-review` },
  ];

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
  const huraian = [
    klass?.description || null,
    typeof studentCount === "number"
      ? `${studentCount} ${studentCount === 1 ? "student" : "students"}`
      : null,
  ]
    .filter((x) => x != null)
    .join(" · ");

  return (
    <div>
      <PageHead
        crumb="Classes"
        name={klass?.name || "Class"}
        description={huraian || undefined}
        secondaryActions={
          klass?.join_code
            ? [
                {
                  label: copied ? "Class code copied" : `Class code ${klass.join_code}`,
                  icon: copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />,
                  onSelect: copyCode,
                },
              ]
            : []
        }
        primaryAction={{
          label: "Invite people",
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
