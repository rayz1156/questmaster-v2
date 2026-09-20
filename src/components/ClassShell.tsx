"use client";

/**
 * Kepala kelas yang dikongsi oleh setiap skrin dalam sesebuah kelas.
 *
 * Sebelum ini setiap skrin kelas membina kepalanya sendiri, jadi tajuk,
 * kod kelas dan jubin navigasi berubah rupa dari satu tab ke satu tab.
 * Satu komponen menyelesaikannya: breadcrumb, nama kelas, kod kelas, satu
 * tindakan utama, dan enam tab nipis.
 *
 * Enam tab itu ialah keseluruhan kelas:
 *   Overview    kod, jemputan, pendidik, tetapan
 *   Learning    papan pembelajaran dan papan pengenalan
 *   Activities  kerja yang dihantar dan dinilai
 *   Quizzes     kuiz langsung
 *   People      pelajar, kumpulan, pendidik
 *   Rankings    markah kumpulan
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, Check, UserPlus } from "lucide-react";
import { getClass, type Klass } from "@/lib/data";

export type ClassTabKey =
  | "overview"
  | "learning"
  | "activities"
  | "quizzes"
  | "people"
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
  const pathname = usePathname();
  const sp = useSearchParams();
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
    { key: "learning", label: "Learning", href: `/educator/classes/${classId}/learning-board` },
    { key: "activities", label: "Activities", href: `/educator/activities?classId=${classId}` },
    { key: "quizzes", label: "Quizzes", href: `/educator/live?classId=${classId}` },
    { key: "people", label: "People", href: `/educator/classes/${classId}/people` },
    { key: "rankings", label: "Rankings", href: `/educator/rankings?classId=${classId}` },
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

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-ink-faint mb-3">
        <Link href="/educator/classes" className="hover:text-ink transition">Classes</Link>
        <span aria-hidden>›</span>
        <span className="text-ink-muted truncate max-w-[40ch]">{klass?.name || "Class"}</span>
      </nav>

      {/* Tajuk, kod kelas, satu tindakan utama */}
      <div className="flex items-start justify-between gap-5 flex-wrap mb-5">
        <div className="min-w-0">
          <h1 className="page-title truncate">{klass?.name || " "}</h1>
          {(klass?.description || typeof studentCount === "number") && (
            <p className="page-subtitle">
              {klass?.description ? klass.description : null}
              {klass?.description && typeof studentCount === "number" ? " · " : null}
              {typeof studentCount === "number"
                ? `${studentCount} ${studentCount === 1 ? "student" : "students"}`
                : null}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {klass?.join_code && (
            <div className="flex items-center gap-3 rounded-xl border border-hairline bg-white px-3.5 py-2">
              <div>
                <div className="text-[11px] text-ink-faint leading-none mb-1">Class code</div>
                <div className="font-mono text-sm font-semibold tracking-wider text-ink leading-none">
                  {klass.join_code}
                </div>
              </div>
              <button onClick={copyCode} className="btn-quiet text-brand-purple" title="Copy class code">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          )}
          <Link href={`/educator/classes/${classId}`} className="btn-primary">
            <UserPlus className="w-4 h-4" /> Invite people
          </Link>
        </div>
      </div>

      {/* Tab nipis */}
      <div className="border-b border-hairline mb-7 -mx-5 px-5 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((t) => {
            const on = t.key === current;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={`relative px-3 pb-3 pt-1 text-[15px] transition ${
                  on ? "text-brand-purple font-semibold" : "text-ink-muted hover:text-ink font-medium"
                }`}
              >
                {t.label}
                {on && <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-brand-purple rounded-full" />}
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
