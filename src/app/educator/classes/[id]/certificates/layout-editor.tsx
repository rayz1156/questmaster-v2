"use client";

/**
 * Editor susun atur sijil (V2-015): pratonton latar bertandatangan dalam
 * bekas nisbah A4 landskap dengan kotak nama "Participant Name", QR,
 * kursus, butiran, penandatangan dan tandatangan yang boleh diseret
 * dengan tetikus atau sentuhan. Semua kedudukan disimpan sebagai pecahan
 * halaman 0 hingga 1, sama seperti layout yang dibaca janaPdf.ts.
 *
 * KZ-009: penanda seret kod sijil dibuang. Kod sijil tidak lagi dicetak
 * pada PDF (QR sahaja); kedudukan code lama masih disimpan semula supaya
 * layout data lama tidak berubah nilai.
 *
 * "Save layout" menulis PATCH /certificates/templates (route yang
 * menormalkan layout); "Preview PDF" memanggil laluan sample dengan
 * format=url dan membuka tab baharu. Layout disimpan bersama mod semasa
 * templat (suis mod ada pada baris templat di halaman utama).
 *
 * V2-016a: latar dimuat melalui laluan background-url pelayan (polisi
 * storan 0042 tidak meliputi laluan gallery/ dan library/), dan editor
 * boleh dipakai semula oleh halaman galeri admin melalui props latarUrl,
 * onSimpan dan onPratonton; tanpa props itu tingkah laku kelas kekal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Save, X } from "lucide-react";
import { authHeader } from "@/lib/peer-client";
import { normaliseSusunAtur, type SusunAturSijil } from "@/lib/sijil/susunAtur";
import { normaliseMedan, barisButiran } from "@/lib/sijil/medan";

// Nisbah halaman A4 landskap, sama dengan janaPdf.ts.
const A4_W = 841.89;
const A4_H = 595.28;

type SusunNama = {
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  color: string;
  weight: "bold" | "regular";
  align: "center" | "left";
};
type SusunQr = { x: number; y: number; size: number };
type SusunKod = {
  x: number;
  y: number;
  size: number;
  color: string;
  align: "center" | "left" | "right";
};
type SusunSigner = {
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  color: string;
  align: "center" | "left";
};
type SusunSignature = { x: number; y: number; width: number };

const NAMA_LALAI: SusunNama = {
  x: 0.5, y: 0.5, maxWidth: 0.6, size: 40, color: "#001F4B", weight: "bold", align: "center",
};
const QR_LALAI: SusunQr = { x: 0.815, y: 0.75, size: 0.08 };
const KOD_LALAI: SusunKod = { x: 0.855, y: 0.885, size: 8, color: "#001F4B", align: "center" };
// Lalai medan baharu (V2-016b): kemas dan tidak bertindih dengan lalai
// name/QR/kod.
const KURSUS_LALAI: SusunNama = {
  x: 0.5, y: 0.24, maxWidth: 0.6, size: 18, color: "#001F4B", weight: "bold", align: "center",
};
const BUTIRAN_LALAI: SusunNama = {
  x: 0.5, y: 0.64, maxWidth: 0.8, size: 11, color: "#001F4B", weight: "regular", align: "center",
};
const PENA_LALAI: SusunSigner = {
  x: 0.12, y: 0.9, maxWidth: 0.3, size: 12, color: "#001F4B", align: "left",
};
const SIG_LALAI: SusunSignature = { x: 0.12, y: 0.72, width: 0.12 };

type Susun = {
  mode: "standard" | "full_background";
  name: SusunNama;
  qr: SusunQr | false;
  code: SusunKod | false;
  course: SusunNama | false;
  details: SusunNama | false;
  signer: SusunSigner | false;
  signature: SusunSignature | false;
};

/** Bina keadaan editor daripada layout templat, dengan lalai penuh supaya
 *  setiap kotak boleh diseret serta merta. */
function bacaSusun(layout: Record<string, unknown> | null | undefined): Susun {
  const n = normaliseSusunAtur(layout) as SusunAturSijil;
  return {
    mode: n.mode === "full_background" ? "full_background" : "standard",
    name: { ...NAMA_LALAI, ...(n.name ?? {}) },
    qr: n.qr === false ? false : { ...QR_LALAI, ...(n.qr ?? {}) },
    code: n.code === false ? false : { ...KOD_LALAI, ...(n.code ?? {}) },
    course: n.course === false ? false : { ...KURSUS_LALAI, ...(n.course ?? {}) },
    details: n.details === false ? false : { ...BUTIRAN_LALAI, ...(n.details ?? {}) },
    signer: n.signer === false ? false : { ...PENA_LALAI, ...(n.signer ?? {}) },
    signature: n.signature === false ? false : { ...SIG_LALAI, ...(n.signature ?? {}) },
  };
}

// KZ-009: tiada lagi sasaran seret "code"; kod sijil tidak dicetak pada PDF.
type SasaranSeret = "name" | "qr" | "course" | "details" | "signer" | "signature";

export default function LayoutEditor({
  classId,
  templateId,
  mode,
  layout,
  backgroundPath,
  medan,
  title,
  latarUrl,
  onSimpan,
  onPratonton,
  onClose,
  onSaved,
}: {
  classId: string;
  templateId: string;
  mode: "standard" | "full_background";
  layout: Record<string, unknown> | null;
  backgroundPath: string;
  /** Medan isian templat (V2-016b): teks sebenar pada penanda; nilai contoh
   *  dipakai bila medan kosong. */
  medan?: Record<string, unknown> | null;
  /** Nama templat dipaparkan pada tajuk editor (pilihan; halaman admin
   *  tidak menghantarnya). */
  title?: string;
  /** URL latar sedia ditandatangan (guna halaman admin); lalai: route kelas. */
  latarUrl?: string | null;
  /** Simpan melalui pemanggil luar (guna halaman admin); lalai: PATCH kelas. */
  onSimpan?: (susun: Susun) => Promise<boolean>;
  /** Dapatkan URL pratonton (guna halaman admin); lalai: sample route kelas. */
  onPratonton?: () => Promise<string | null>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [susun, setSusun] = useState<Susun>(() => bacaSusun(layout));
  const [latar, setLatar] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  // Medan isian dinormalkan sekali untuk teks penanda (V2-016b).
  const medanSijil = normaliseMedan(medan);

  const bekasRef = useRef<HTMLDivElement>(null);
  const seretRef = useRef<{
    sasaran: SasaranSeret;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [lebar, setLebar] = useState(0);

  // Pratonton latar: URL bertandatangan 10 minit daripada laluan
  // background-url pelayan (V2-016a) supaya latar galeri dan peribadi
  // turut berfungsi; polisi storan 0042 hanya meliputi laluan <class_id>/.
  // latarUrl (hala admin) terus dipakai bila diberikan.
  useEffect(() => {
    if (latarUrl !== undefined) {
      setLatar(latarUrl);
      if (!latarUrl) setMsg("Could not load the background image.");
      return;
    }
    let alive = true;
    (async () => {
      const res = await fetch(
        `/api/classes/${classId}/certificates/templates/${templateId}/background-url`,
        { headers: await authHeader() },
      );
      const j = await res.json().catch(() => ({}));
      if (!alive) return;
      if (!res.ok || typeof j.url !== "string") {
        setMsg(j.error ?? "Could not load the background image.");
        return;
      }
      setLatar(j.url);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundPath]);

  // Ukur lebar bekas supaya saiz fon dan kotak mengikut skala sebenar
  // (WYSIWYG: pt PDF dipetakan kepada piksel bekas).
  useEffect(() => {
    const el = bekasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLebar(el.getBoundingClientRect().width));
    ro.observe(el);
    setLebar(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const saizFonPx = lebar ? (susun.name.size / A4_W) * lebar : 24;

  const mulaSeret = (sasaran: SasaranSeret) => (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const kotak =
      sasaran === "name" ? susun.name
        : sasaran === "qr" ? (susun.qr || QR_LALAI)
          : sasaran === "course" ? (susun.course || KURSUS_LALAI)
            : sasaran === "details" ? (susun.details || BUTIRAN_LALAI)
              : sasaran === "signer" ? (susun.signer || PENA_LALAI)
                : (susun.signature || SIG_LALAI);
    seretRef.current = {
      sasaran,
      startX: e.clientX,
      startY: e.clientY,
      origX: kotak.x,
      origY: kotak.y,
    };
  };

  const gerakSeret = (e: React.PointerEvent<HTMLElement>) => {
    const s = seretRef.current;
    const bekas = bekasRef.current;
    if (!s || !bekas) return;
    const rect = bekas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dx = (e.clientX - s.startX) / rect.width;
    const dy = (e.clientY - s.startY) / rect.height;
    const x = Math.min(1, Math.max(0, s.origX + dx));
    const y = Math.min(1, Math.max(0, s.origY + dy));
    setSusun((p) => {
      if (s.sasaran === "name") return { ...p, name: { ...p.name, x, y } };
      if (s.sasaran === "qr") {
        return { ...p, qr: { ...(p.qr || QR_LALAI), x, y } };
      }
      if (s.sasaran === "course") {
        return { ...p, course: { ...(p.course || KURSUS_LALAI), x, y } };
      }
      if (s.sasaran === "details") {
        return { ...p, details: { ...(p.details || BUTIRAN_LALAI), x, y } };
      }
      if (s.sasaran === "signer") {
        return { ...p, signer: { ...(p.signer || PENA_LALAI), x, y } };
      }
      return { ...p, signature: { ...(p.signature || SIG_LALAI), x, y } };
    });
  };

  const tamatSeret = () => {
    seretRef.current = null;
  };

  const simpan = useCallback(async () => {
    setMenyimpan(true);
    try {
      // Hala admin (galeri): simpan melalui pemanggil luar.
      if (onSimpan) {
        const ok = await onSimpan({ ...susun, mode });
        if (!ok) {
          setMsg("Could not save the layout.");
          return;
        }
        setMsg(null);
        await onSaved();
        return;
      }
      const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ template_id: templateId, layout: { ...susun, mode } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not save the layout.");
        return;
      }
      setMsg(null);
      await onSaved();
    } finally {
      setMenyimpan(false);
    }
  }, [classId, templateId, susun, mode, onSaved, onSimpan]);

  const pratonton = useCallback(async () => {
    // Hala admin (galeri): URL pratonton daripada pemanggil luar.
    if (onPratonton) {
      const url = await onPratonton();
      if (url) window.open(url, "_blank");
      else setMsg("Preview failed.");
      return;
    }
    const res = await fetch(
      `/api/classes/${classId}/certificates/templates/${templateId}/sample?format=url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({}),
      },
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Preview failed.");
      return;
    }
    if (typeof j.url === "string") window.open(j.url, "_blank");
  }, [classId, templateId, onPratonton]);

  const namaKiri =
    susun.name.align === "left"
      ? susun.name.x * lebar
      : susun.name.x * lebar - (susun.name.maxWidth * lebar) / 2;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-6 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold">{title ? `Edit layout: ${title}` : "Layout editor"}</h3>
        <button className="btn-quiet" onClick={onClose}>
          <X className="w-4 h-4" /> Close
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Drag the name, QR, course, date and location, signer and signature boxes onto the
        background. Positions are saved as page fractions. Boxes with empty fields show sample
        values; empty fields are never printed on the certificate.
      </p>
      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Pratonton WYSIWYG dalam nisbah A4 landskap */}
        <div
          ref={bekasRef}
          className="relative w-full max-w-[840px] bg-slate-200 border border-hairline rounded-lg overflow-hidden select-none"
          style={{ aspectRatio: `${A4_W} / ${A4_H}`, minHeight: 200 }}
        >
          {latar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={latar} alt="Certificate background" className="absolute inset-0 w-full h-full object-fill" draggable={false} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
              Loading background...
            </div>
          )}

          {/* Kotak nama: garis dasar di y, mengikut jajaran dan lebar maksimum */}
          <div
            role="button"
            tabIndex={0}
            onPointerDown={mulaSeret("name")}
            onPointerMove={gerakSeret}
            onPointerUp={tamatSeret}
            onPointerCancel={tamatSeret}
            className="absolute cursor-move border-2 border-dashed border-violet-600 bg-white/10 text-center"
            style={{
              left: lebar ? namaKiri : "50%",
              top: `${susun.name.y * 100}%`,
              width: lebar ? susun.name.maxWidth * lebar : "60%",
              fontSize: `${saizFonPx}px`,
              fontWeight: susun.name.weight === "bold" ? 700 : 400,
              color: susun.name.color,
              transform: "translateY(-80%)",
              touchAction: "none",
            }}
          >
            Participant Name
          </div>

          {/* Kotak QR */}
          {susun.qr !== false && (
            <div
              role="button"
              tabIndex={0}
              onPointerDown={mulaSeret("qr")}
              onPointerMove={gerakSeret}
              onPointerUp={tamatSeret}
              onPointerCancel={tamatSeret}
              className="absolute cursor-move border-2 border-dashed border-violet-600 bg-white flex items-center justify-center text-[10px] text-slate-500"
              style={{
                left: lebar ? susun.qr.x * lebar : "80%",
                top: `${susun.qr.y * 100}%`,
                width: lebar ? susun.qr.size * lebar : 40,
                height: lebar ? (susun.qr.size * lebar * A4_W) / A4_H : 40,
                touchAction: "none",
              }}
            >
              QR
            </div>
          )}

          {/* KZ-009: kotak seret kod sijil dibuang; kod tidak dicetak pada
              PDF (QR sahaja). Kedudukan code lama kekal dalam layout yang
              disimpan supaya data sedia ada tidak berubah. */}

          {/* Kotak kursus (V2-016b): teks sebenar atau nilai contoh */}
          {susun.course !== false && (
            <div
              role="button"
              tabIndex={0}
              onPointerDown={mulaSeret("course")}
              onPointerMove={gerakSeret}
              onPointerUp={tamatSeret}
              onPointerCancel={tamatSeret}
              className="absolute cursor-move border-2 border-dashed border-violet-600 bg-white/10 text-center truncate"
              style={{
                left: lebar
                  ? susun.course.align === "left"
                    ? susun.course.x * lebar
                    : susun.course.x * lebar - (susun.course.maxWidth * lebar) / 2
                  : "50%",
                top: `${susun.course.y * 100}%`,
                width: lebar ? susun.course.maxWidth * lebar : "60%",
                fontSize: `${lebar ? (susun.course.size / A4_W) * lebar : 18}px`,
                fontWeight: susun.course.weight === "bold" ? 700 : 400,
                color: susun.course.color,
                transform: "translateY(-80%)",
                touchAction: "none",
              }}
              title="Course or programme printed on the certificate"
            >
              {medanSijil.course || "Course / programme"}
            </div>
          )}

          {/* Kotak butiran (V2-016b): tarikh | tempat */}
          {susun.details !== false && (
            <div
              role="button"
              tabIndex={0}
              onPointerDown={mulaSeret("details")}
              onPointerMove={gerakSeret}
              onPointerUp={tamatSeret}
              onPointerCancel={tamatSeret}
              className="absolute cursor-move border-2 border-dashed border-violet-600 bg-white/10 text-center truncate"
              style={{
                left: lebar
                  ? susun.details.align === "left"
                    ? susun.details.x * lebar
                    : susun.details.x * lebar - (susun.details.maxWidth * lebar) / 2
                  : "50%",
                top: `${susun.details.y * 100}%`,
                width: lebar ? susun.details.maxWidth * lebar : "80%",
                fontSize: `${lebar ? (susun.details.size / A4_W) * lebar : 11}px`,
                fontWeight: susun.details.weight === "bold" ? 700 : 400,
                color: susun.details.color,
                transform: "translateY(-80%)",
                touchAction: "none",
              }}
              title="Date and location line"
            >
              {barisButiran(medanSijil) || "1 hingga 3 Oktober 2026 | Location"}
            </div>
          )}

          {/* Kotak penandatangan (V2-016b): nama tebal, jawatan di bawah */}
          {susun.signer !== false && (
            <div
              role="button"
              tabIndex={0}
              onPointerDown={mulaSeret("signer")}
              onPointerMove={gerakSeret}
              onPointerUp={tamatSeret}
              onPointerCancel={tamatSeret}
              className="absolute cursor-move border-2 border-dashed border-violet-600 bg-white/10"
              style={{
                left: lebar
                  ? susun.signer.align === "left"
                    ? susun.signer.x * lebar
                    : susun.signer.x * lebar - (susun.signer.maxWidth * lebar) / 2
                  : "12%",
                top: `${susun.signer.y * 100}%`,
                width: lebar ? susun.signer.maxWidth * lebar : "30%",
                fontSize: `${lebar ? (susun.signer.size / A4_W) * lebar : 12}px`,
                color: susun.signer.color,
                textAlign: susun.signer.align === "left" ? "left" : "center",
                transform: "translateY(-80%)",
                touchAction: "none",
              }}
              title="Signer name and title"
            >
              <div className="font-bold truncate">{medanSijil.signer_name || "Signer name"}</div>
              <div className="truncate" style={{ fontSize: "85%" }}>
                {medanSijil.signer_title || "Signer title"}
              </div>
            </div>
          )}

          {/* Kotak imej tandatangan (V2-016b) */}
          {susun.signature !== false && (
            <div
              role="button"
              tabIndex={0}
              onPointerDown={mulaSeret("signature")}
              onPointerMove={gerakSeret}
              onPointerUp={tamatSeret}
              onPointerCancel={tamatSeret}
              className="absolute cursor-move border-2 border-dashed border-violet-600 bg-white flex items-center justify-center text-[10px] text-slate-500"
              style={{
                left: lebar ? susun.signature.x * lebar : "12%",
                top: `${susun.signature.y * 100}%`,
                width: lebar ? susun.signature.width * lebar : 60,
                height: lebar
                  ? Math.min(susun.signature.width * lebar * 0.4, 0.12 * lebar * (A4_H / A4_W))
                  : 24,
                touchAction: "none",
              }}
              title="Signature image"
            >
              Signature
            </div>
          )}
        </div>

        {/* Kawalan */}
        <div className="space-y-3 text-sm w-full lg:w-64 shrink-0">
          <div>
            <label className="block font-medium mb-1">Name font size ({susun.name.size}pt)</label>
            <input
              className="w-full"
              type="range"
              min={8}
              max={96}
              value={susun.name.size}
              onChange={(e) =>
                setSusun((p) => ({ ...p, name: { ...p.name, size: Number(e.target.value) } }))
              }
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Name color</label>
            <input
              type="color"
              value={susun.name.color}
              onChange={(e) =>
                setSusun((p) => ({ ...p, name: { ...p.name, color: e.target.value } }))
              }
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Max width ({Math.round(susun.name.maxWidth * 100)}%)</label>
            <input
              className="w-full"
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={susun.name.maxWidth}
              onChange={(e) =>
                setSusun((p) => ({
                  ...p,
                  name: { ...p.name, maxWidth: Number(e.target.value) },
                }))
              }
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Alignment</label>
            <select
              className="input w-full"
              value={susun.name.align}
              onChange={(e) =>
                setSusun((p) => ({
                  ...p,
                  name: { ...p.name, align: e.target.value as "center" | "left" },
                }))
              }
            >
              <option value="center">Center</option>
              <option value="left">Left</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={susun.qr !== false}
              onChange={(e) => setSusun((p) => ({ ...p, qr: e.target.checked ? { ...QR_LALAI } : false }))}
            />
            Print QR code
          </label>
          {/* KZ-009: kotak semak "Print certificate code" dibuang; kod
              sijil tidak dicetak lagi (QR sahaja). */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={susun.course !== false}
              onChange={(e) => setSusun((p) => ({ ...p, course: e.target.checked ? { ...KURSUS_LALAI } : false }))}
            />
            Print course
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={susun.details !== false}
              onChange={(e) => setSusun((p) => ({ ...p, details: e.target.checked ? { ...BUTIRAN_LALAI } : false }))}
            />
            Print date and location
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={susun.signer !== false}
              onChange={(e) => setSusun((p) => ({ ...p, signer: e.target.checked ? { ...PENA_LALAI } : false }))}
            />
            Print signer
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={susun.signature !== false}
              onChange={(e) => setSusun((p) => ({ ...p, signature: e.target.checked ? { ...SIG_LALAI } : false }))}
            />
            Print signature image
          </label>
          <div className="flex gap-2 pt-2">
            <button className="btn-primary" onClick={simpan} disabled={menyimpan}>
              <Save className="w-4 h-4" /> Save layout
            </button>
            <button className="btn-quiet" onClick={pratonton}>
              <Eye className="w-4 h-4" /> Preview PDF
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Save first, then preview: the preview shows the saved template.
          </p>
        </div>
      </div>
    </div>
  );
}
