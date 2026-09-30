"use client";

/**
 * Editor susun atur sijil (V2-015): pratonton latar bertandatangan dalam
 * bekas nisbah A4 landskap dengan kotak nama "Participant Name", QR dan
 * kod sijil yang boleh diseret dengan tetikus atau sentuhan. Semua
 * kedudukan disimpan sebagai pecahan halaman 0 hingga 1, sama seperti
 * layout yang dibaca janaPdf.ts.
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

const NAMA_LALAI: SusunNama = {
  x: 0.5, y: 0.5, maxWidth: 0.6, size: 40, color: "#001F4B", weight: "bold", align: "center",
};
const QR_LALAI: SusunQr = { x: 0.815, y: 0.75, size: 0.08 };
const KOD_LALAI: SusunKod = { x: 0.855, y: 0.885, size: 8, color: "#001F4B", align: "center" };

type Susun = {
  mode: "standard" | "full_background";
  name: SusunNama;
  qr: SusunQr | false;
  code: SusunKod | false;
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
  };
}

type SasaranSeret = "name" | "qr" | "code";

export default function LayoutEditor({
  classId,
  templateId,
  mode,
  layout,
  backgroundPath,
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
          : (susun.code || KOD_LALAI);
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
      return { ...p, code: { ...(p.code || KOD_LALAI), x, y } };
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
        <h3 className="font-semibold">Layout editor</h3>
        <button className="btn-quiet" onClick={onClose}>
          <X className="w-4 h-4" /> Close
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Drag the name, QR and code boxes onto the background. Positions are saved as page
        fractions and used when the background is a complete design (only the name, QR and
        code are printed).
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

          {/* Kotak kod sijil */}
          {susun.code !== false && (
            <div
              role="button"
              tabIndex={0}
              onPointerDown={mulaSeret("code")}
              onPointerMove={gerakSeret}
              onPointerUp={tamatSeret}
              onPointerCancel={tamatSeret}
              className="absolute cursor-move whitespace-nowrap"
              style={{
                left: `${susun.code.x * 100}%`,
                top: `${susun.code.y * 100}%`,
                fontSize: `${lebar ? (susun.code.size / A4_W) * lebar : 8}px`,
                color: susun.code.color,
                transform:
                  susun.code.align === "center"
                    ? "translate(-50%, -80%)"
                    : susun.code.align === "right"
                      ? "translate(-100%, -80%)"
                      : "translateY(-80%)",
                touchAction: "none",
              }}
            >
              CONTOH0000
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={susun.code !== false}
              onChange={(e) => setSusun((p) => ({ ...p, code: e.target.checked ? { ...KOD_LALAI } : false }))}
            />
            Print certificate code
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
