"use client";

/**
 * Dialog eksport CSV Insights (bahagian G): kotak semak "Everything" dan
 * setiap bahagian dengan penerangan satu baris. Muat turun memanggil
 * laluan eksport dengan Bearer dan menyimpan nama fail daripada
 * Content-Disposition. Esc menutup dialog dan fokus dikunci di dalamnya
 * (corak yang sama seperti laci markah). Penuh skrin pada telefon.
 */
import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { BAHAGIAN_INSIGHTS, type BahagianInsights } from "@/lib/insightsKelas";

/** Label UI dan penerangan satu baris bagi setiap bahagian eksport. */
const PENERANGAN: Record<BahagianInsights, { label: string; huraian: string }> = {
  students: {
    label: "Learners (full)",
    huraian: "Every learner with scores, accuracy, activity counts and flags.",
  },
  attention: {
    label: "Needs attention",
    huraian: "Only learners who currently need your attention.",
  },
  questions: {
    label: "Hardest questions",
    huraian: "Live Quiz questions learners get wrong the most.",
  },
  challenges: {
    label: "Hardest challenges",
    huraian: "Activity challenges with the most rejections.",
  },
  teams: {
    label: "Teams",
    huraian: "Team totals, averages and balance.",
  },
  trend: {
    label: "Progress by session",
    huraian: "One row per learner per ended Live Quiz session.",
  },
};

export default function DialogEksport({
  classId,
  tutup,
}: {
  classId: string;
  tutup: () => void;
}) {
  const [pilihan, setPilihan] = useState<Set<BahagianInsights>>(new Set());
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const butangTutupRef = useRef<HTMLButtonElement>(null);

  const semua = pilihan.size === BAHAGIAN_INSIGHTS.length;

  const toggleSemua = () => {
    setPilihan(semua ? new Set() : new Set(BAHAGIAN_INSIGHTS));
  };

  const toggleSatu = (b: BahagianInsights) => {
    setPilihan((s) => {
      const salin = new Set(s);
      if (salin.has(b)) salin.delete(b);
      else salin.add(b);
      return salin;
    });
  };

  // Esc menutup dialog; Tab berpusing dalam dialog sahaja (fokus dikunci).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        tutup();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const boleh = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (boleh.length === 0) return;
      const pertama = boleh[0];
      const akhir = boleh[boleh.length - 1];
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault();
        akhir.focus();
      } else if (!e.shiftKey && document.activeElement === akhir) {
        e.preventDefault();
        pertama.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    butangTutupRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [tutup]);

  const muatTurun = async () => {
    setRalat(null);
    setSibuk(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/classes/${classId}/insights/export?sections=${encodeURIComponent(
          pilihan.size === BAHAGIAN_INSIGHTS.length
            ? "all"
            : Array.from(pilihan).join(","),
        )}`,
        {
          headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
          cache: "no-store",
        },
      );
      if (!res.ok) {
        let msg = "Export failed.";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* badan bukan JSON: guna mesej lalai */
        }
        setRalat(msg);
        return;
      }
      // Nama fail daripada content-disposition pelayan (satu tempat sahaja).
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const m = /filename="([^"]+)"/.exec(cd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m ? m[1] : "kuizen-insights.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      tutup();
    } catch {
      setRalat("Export failed.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Latar klik luar menutup dialog. */}
      <div className="absolute inset-0 bg-black/40" onClick={tutup} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Export insights"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full sm:w-[520px] max-h-full sm:max-h-[85vh] overflow-y-auto bg-white border border-hairline rounded-2xl shadow-raised p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-semibold text-ink">Export insights</h2>
          <button
            ref={butangTutupRef}
            type="button"
            onClick={tutup}
            aria-label="Close"
            className="w-9 h-9 rounded-xl border border-hairline flex items-center justify-center text-ink-muted hover:text-ink shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-ink-muted mb-4">
          Pick the sections you want in the CSV.
        </p>

        <div className="space-y-1.5">
          <label className="flex items-center gap-3 rounded-xl border border-hairline px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={semua}
              onChange={toggleSemua}
              className="accent-[#5B42C4]"
            />
            <span className="text-sm font-semibold text-ink">Everything</span>
          </label>
          {BAHAGIAN_INSIGHTS.map((b) => (
            <label
              key={b}
              className="flex items-start gap-3 rounded-xl border border-hairline px-4 py-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={pilihan.has(b)}
                onChange={() => toggleSatu(b)}
                className="accent-[#5B42C4] mt-0.5"
              />
              <span className="min-w-0">
                <span className="text-sm text-ink block">{PENERANGAN[b].label}</span>
                <span className="text-xs text-ink-faint block mt-0.5">
                  {PENERANGAN[b].huraian}
                </span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-xs text-ink-faint mt-4">
          Multiple sections download as one CSV with a heading for each section.
        </p>

        {ralat && <div className="text-sm text-red-600 mt-3">{ralat}</div>}

        <div className="flex items-center justify-end gap-3 mt-5">
          <button type="button" className="btn-quiet" onClick={tutup}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            onClick={muatTurun}
            disabled={sibuk || pilihan.size === 0}
          >
            <Download className="w-4 h-4" />
            {sibuk ? "Exporting…" : "Download CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}