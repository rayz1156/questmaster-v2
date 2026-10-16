"use client";

// Galeri templat sijil Kuizen, rupa v3 (KZ-024). Pentadbir aktif
// boleh: cipta item (layout lalai Grid Sijil Kuizen v1), muat naik PNG
// latar/logo (tiket + finalize, corak V2-015), suis Published dan Free tier,
// sunting susun atur (guna semula layout-editor), padam dengan alasan
// (semuanya diaudit oleh laluan API). Tiada em dash dalam rentetan UI.
// Komponen kit: PageHead, Card, Badge, Button, Input, Select, Alert;
// panggilan API dan aliran muat naik tidak berubah.

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Award } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Field,
  Input,
  PageHead,
  Select,
} from "@/components/ui";
import { authHeader } from "@/lib/peer-client";
import type { ItemPustakaApi } from "@/lib/sijil/pustaka";
import LayoutEditor from "@/app/educator/classes/[id]/certificates/layout-editor";

/**
 * Gaya label-butang fail (input sembunyi di dalam label; kit Button tidak
 * boleh membungkus input fail, jadi kelas butang outline disalin di sini).
 */
const LABEL_BUTANG_FAIL =
  "inline-flex items-center justify-center gap-2 h-9 px-[18px] py-[7px] text-[13px] font-bold tracking-[0.26px] rounded-[4px] bg-white border border-hairline text-ink-muted hover:bg-canvas transition cursor-pointer select-none disabled:opacity-40";

/** Nisbah halaman A4 landskap untuk kad pratonton. */
const A4_NISBAH = "841.89 / 595.28";

/** Had muat naik aset sijil (selari bucket certificate-assets). */
const MAX_ASET = 8 * 1024 * 1024;

export default function Page() {
  const [items, setItems] = useState<ItemPustakaApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Borang cipta item baharu.
  const [borang, setBorang] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"" | "participation" | "achievement">("");
  const [tone, setTone] = useState<"dark" | "light">("dark");

  // Padam dengan alasan (satu item pada satu masa).
  const [padamId, setPadamId] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");

  // Editor susun atur: item yang dibuka dan latar bertandatangan.
  const [editor, setEditor] = useState<ItemPustakaApi | null>(null);
  const [editorLatar, setEditorLatar] = useState<string | null>(null);

  const muat = useCallback(async () => {
    const res = await fetch("/api/admin/certificate-gallery", { headers: await authHeader() });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Could not load the gallery.");
      return;
    }
    setItems(j.items ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await muat();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [muat]);

  /** Cipta item galeri (belum diterbitkan, layout grid lalai). */
  const cipta = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/certificate-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          title: title.trim(),
          kind: kind || null,
          text_tone: tone,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not create the item.");
        return;
      }
      setMsg(null);
      setBorang(false);
      setTitle("");
      setKind("");
      setTone("dark");
      await muat();
    } finally {
      setBusy(false);
    }
  };

  /** Kemas kini medan ringkas item (tajuk, jenis, nada, suis, susunan). */
  const kemas = async (id: string, badan: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/certificate-gallery/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(badan),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not update the item.");
        return;
      }
      setMsg(null);
      await muat();
    } finally {
      setBusy(false);
    }
  };

  /** Padam item dengan alasan (diaudit). */
  const padam = async () => {
    if (!padamId || alasan.trim().length < 5 || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/certificate-gallery/${padamId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ reason: alasan.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not delete the item.");
        return;
      }
      setMsg(null);
      setPadamId(null);
      setAlasan("");
      await muat();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Muat naik PNG latar/logo item: tiket bertandatangan, PUT terus ke
   * storan, kemudian finalize yang menyemak tandatangan bait (corak
   * V2-015). Fail tidak pernah melalui pelayan aplikasi.
   */
  const muatNaik = async (id: string, jenis: "background" | "logo", fail: File | null) => {
    if (!fail || busy) return;
    if (fail.type !== "image/png" && fail.type !== "image/jpeg") {
      setMsg("Only PNG and JPEG images are allowed.");
      return;
    }
    if (fail.size > MAX_ASET) {
      setMsg("Image must be 8 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const tiket = await fetch(`/api/admin/certificate-gallery/${id}/asset-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ kind: jenis, mimeType: fail.type, size: fail.size }),
      });
      const j = await tiket.json().catch(() => ({}));
      if (!tiket.ok || !j.upload_url || !j.path) {
        setMsg(j.error ?? "Could not create the upload ticket.");
        return;
      }
      const put = await fetch(j.upload_url as string, {
        method: "PUT",
        headers: { "Content-Type": fail.type },
        body: fail,
      });
      if (!put.ok) {
        setMsg("Could not upload the image to storage.");
        return;
      }
      const sah = await fetch(`/api/admin/certificate-gallery/${id}/asset-finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ kind: jenis, path: j.path }),
      });
      const j2 = await sah.json().catch(() => ({}));
      if (!sah.ok) {
        setMsg(j2.error ?? "Could not attach the image.");
        return;
      }
      setMsg(null);
      await muat();
    } finally {
      setBusy(false);
    }
  };

  /** Buka editor susun atur item: dapatkan latar bertandatangan dahulu. */
  const bukaEditor = async (item: ItemPustakaApi) => {
    if (!item.background_path) {
      setMsg("Upload a background image first.");
      return;
    }
    const res = await fetch(`/api/admin/certificate-gallery/${item.id}/background-url`, {
      headers: await authHeader(),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || typeof j.url !== "string") {
      setMsg(j.error ?? "Could not load the background image.");
      return;
    }
    setEditorLatar(j.url);
    setEditor(item);
  };

  return (
    <AdminShell>
      <PageHead
        title="Certificates"
        description="Published templates are visible to every educator. Free tier items can be used by Free plan classes."
        primaryAction={{
          label: "New gallery template",
          icon: <Plus className="w-4 h-4" />,
          onSelect: () => setBorang((v) => !v),
        }}
      />

      {msg && (
        <Alert tone="info" className="mb-4">
          {msg}
        </Alert>
      )}

      {borang && (
        <Card className="mb-5">
          <CardHead
            title="New gallery template"
            subtitle="New items start unpublished with the Kuizen grid v1 layout. Upload a background PNG, adjust the layout, then publish."
          />
          <div className="mt-4 space-y-4">
            <Field label="Title" htmlFor="tajuk-templat">
              <Input
                id="tajuk-templat"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Certificate of Participation"
              />
            </Field>
            <div className="flex items-end gap-3 flex-wrap">
              <Field label="Kind" htmlFor="jenis-templat" className="w-44">
                <Select
                  id="jenis-templat"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "" | "participation" | "achievement")}
                >
                  <option value="">None</option>
                  <option value="participation">Participation</option>
                  <option value="achievement">Achievement</option>
                </Select>
              </Field>
              <Field label="Text tone" htmlFor="nada-teks" className="w-44">
                <Select
                  id="nada-teks"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as "dark" | "light")}
                >
                  <option value="dark">Dark text</option>
                  <option value="light">Light text</option>
                </Select>
              </Field>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => setBorang(false)}>
                  Cancel
                </Button>
                <Button disabled={!title.trim() || busy} onClick={cipta}>
                  Create
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-[14px] text-ink-faint py-8">Loading...</p>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Award className="w-6 h-6" />}
            title="No gallery templates"
            text="Create one to share a design with every educator."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {items.map((item) => (
            <Card key={item.id} padat className="overflow-hidden flex flex-col">
              <div className="relative bg-slate-100" style={{ aspectRatio: A4_NISBAH }}>
                {item.preview_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.preview_url}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-fill"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[12px] text-ink-faint">
                    No background yet
                  </div>
                )}
                <span className="absolute top-2 left-2">
                  {item.published ? (
                    <Badge variant="dim" warna="green">
                      Published
                    </Badge>
                  ) : (
                    <Badge variant="dim" warna="purple">
                      Draft
                    </Badge>
                  )}
                </span>
                {item.free_tier && (
                  <span className="absolute top-2 right-2">
                    <Badge variant="dim" warna="green">
                      Free tier
                    </Badge>
                  </span>
                )}
              </div>
              <div className="p-6 flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-[15px] font-bold text-ink truncate" title={item.title}>
                    {item.title}
                  </div>
                </div>
                <div className="text-[12px] text-ink-faint">
                  {item.kind === "participation"
                    ? "Participation"
                    : item.kind === "achievement"
                      ? "Achievement"
                      : "No kind"}
                  {" · "}
                  {item.text_tone === "light" ? "Light text" : "Dark text"}
                  {` · Order ${item.sort_order}`}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className={LABEL_BUTANG_FAIL} title="Upload a background PNG or JPEG">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => muatNaik(item.id, "background", e.target.files?.[0] ?? null)}
                    />
                    Background
                  </label>
                  <label className={LABEL_BUTANG_FAIL} title="Upload a logo PNG or JPEG">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => muatNaik(item.id, "logo", e.target.files?.[0] ?? null)}
                    />
                    Logo
                  </label>
                  <Button
                    variant="outline"
                    disabled={busy || !item.background_path}
                    title={item.background_path ? "Adjust name, QR and code positions" : "Upload a background first"}
                    onClick={() => bukaEditor(item)}
                  >
                    Edit layout
                  </Button>
                </div>
                <div className="flex items-center gap-3 flex-wrap text-[13px]">
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Visible to all educators">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-purple"
                      checked={item.published}
                      disabled={busy}
                      onChange={(e) => kemas(item.id, { published: e.target.checked })}
                    />
                    Published
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Usable by Free plan classes">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-purple"
                      checked={item.free_tier}
                      disabled={busy}
                      onChange={(e) => kemas(item.id, { free_tier: e.target.checked })}
                    />
                    Free tier
                  </label>
                  <label className="flex items-center gap-1.5" title="Order in the educator gallery">
                    Order
                    <Input
                      className="w-16"
                      type="number"
                      defaultValue={item.sort_order}
                      disabled={busy}
                      onBlur={(e) => {
                        const v = Math.trunc(Number(e.target.value));
                        if (Number.isFinite(v) && v !== item.sort_order) {
                          kemas(item.id, { sort_order: v });
                        }
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    className="text-kz-down ml-auto"
                    disabled={busy}
                    title="Delete this gallery template (reason required)"
                    onClick={() => {
                      setPadamId(padamId === item.id ? null : item.id);
                      setAlasan("");
                    }}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </div>
                {padamId === item.id && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      className="flex-1 min-w-[200px]"
                      value={alasan}
                      onChange={(e) => setAlasan(e.target.value)}
                      placeholder="Reason (at least 5 characters)"
                      aria-label="Reason for deleting this template"
                    />
                    <Button
                      variant="primary"
                      warna="red"
                      disabled={alasan.trim().length < 5 || busy}
                      onClick={padam}
                    >
                      Confirm delete
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editor && (
        <LayoutEditor
          // Parameter admin: latar, simpan dan pratonton semuanya melalui
          // laluan galeri, bukan laluan kelas pendidik.
          classId={editor.id}
          templateId={editor.id}
          mode={
            (editor.layout?.mode as string) === "full_background" ? "full_background" : "standard"
          }
          layout={editor.layout}
          backgroundPath={editor.background_path ?? ""}
          latarUrl={editorLatar}
          onSimpan={async (susun) => {
            const res = await fetch(`/api/admin/certificate-gallery/${editor.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...(await authHeader()) },
              body: JSON.stringify({ layout: susun }),
            });
            return res.ok;
          }}
          onPratonton={async () => {
            const res = await fetch(`/api/certificate-library/${editor.id}/sample?format=url`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(await authHeader()) },
              body: JSON.stringify({}),
            });
            const j = await res.json().catch(() => ({}));
            return res.ok && typeof j.url === "string" ? j.url : null;
          }}
          onClose={() => {
            setEditor(null);
            setEditorLatar(null);
          }}
          onSaved={muat}
        />
      )}
    </AdminShell>
  );
}
