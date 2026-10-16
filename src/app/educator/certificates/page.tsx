"use client";

/**
 * My certificate templates (V2-016a): senarai "Templat saya" educator,
 * merentas semua kelas yang dia urus. Tindakan: tukar nama, padam (dengan
 * pengesahan) dan "Use in class" (pilih kelas; templat kelas baharu
 * dicipta melalui laluan from-library).
 *
 * KZ-022: rupa v3 (PageHead, Card/CardSection, Button, EmptyState); semua
 * fungsi tidak berubah.
 *
 * Semak pelan: penciptaan item peribadi memerlukan pelan berbayar
 * (dikuatkuasakan pangkalan data); halaman ini tetap boleh dibaca supaya
 * item lama kekal boleh diguna selepas pelan turun.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Trash2, Award } from "lucide-react";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { authHeader } from "@/lib/peer-client";
import { listMyEducatorClasses } from "@/lib/data";
import type { EducatorClassRow } from "@/lib/types";
import type { ItemPustakaApi } from "@/lib/sijil/pustaka";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { Button, Card, CardSection, EmptyState, Input, PageHead } from "@/components/ui";

/** Nisbah halaman A4 landskap untuk kad pratonton. */
const A4_NISBAH = "841.89 / 595.28";

export default function MyCertificateTemplatesPage() {
  const confirm = useConfirm();

  const [mine, setMine] = useState<ItemPustakaApi[]>([]);
  const [kelas, setKelas] = useState<EducatorClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Tukar nama: id item yang sedang disunting dan nilai inputnya.
  const [namaBaru, setNamaBaru] = useState<{ id: string; tajuk: string } | null>(null);

  // "Use in class": id item yang menunggu pilihan kelas.
  const [gunaBuka, setGunaBuka] = useState<string | null>(null);

  const muat = useCallback(async () => {
    const [resPustaka, senaraiKelas] = await Promise.all([
      fetch("/api/certificate-library", { headers: await authHeader() }),
      listMyEducatorClasses().catch(() => [] as EducatorClassRow[]),
    ]);
    const j = await resPustaka.json().catch(() => ({}));
    if (!resPustaka.ok) {
      setMsg(j.error ?? "Could not load your templates.");
      return;
    }
    setMine(j.mine ?? []);
    setKelas(((senaraiKelas as EducatorClassRow[]) ?? []).filter((k) => k.id));
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

  /** Simpan nama baharu item peribadi. */
  const simpanNama = async (id: string) => {
    const tajuk = namaBaru?.tajuk.trim() ?? "";
    if (!tajuk || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/certificate-library/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ title: tajuk }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not rename the template.");
        return;
      }
      setMsg(null);
      setNamaBaru(null);
      await muat();
    } finally {
      setBusy(false);
    }
  };

  /** Padam item peribadi dengan pengesahan. */
  const padam = async (item: ItemPustakaApi) => {
    const ok = await confirm({
      title: "Delete template",
      description: `Delete "${item.title}" from My templates? Classes already using it keep their certificate templates.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/certificate-library/${item.id}`, {
        method: "DELETE",
        headers: await authHeader(),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not delete the template.");
        return;
      }
      setMsg(null);
      await muat();
    } finally {
      setBusy(false);
    }
  };

  /** Guna item peribadi dalam kelas yang dipilih (laluan from-library). */
  const gunaDalamKelas = async (item: ItemPustakaApi, classId: string) => {
    if (!classId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/certificates/templates/from-library`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ library_id: item.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not use the template.");
        return;
      }
      const nama = kelas.find((k) => k.id === classId)?.name ?? "the class";
      setMsg(`Added "${item.title}" to ${nama}.`);
      setGunaBuka(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        title="My certificate templates"
        description="Reuse your own designs in every class you teach."
      />

      {msg && <div className="mb-4 rounded-[4px] border border-violet-200 bg-violet-50 p-4 text-sm text-ink-muted">{msg}</div>}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading...</p>
      ) : mine.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Award className="w-6 h-6" />}
            title="No templates yet."
            text="Open a class, create a certificate template and use the Save to My templates action."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-7">
          {mine.map((item) => (
            <Card padat key={item.id} className="overflow-hidden flex flex-col">
              <div className="relative bg-canvas" style={{ aspectRatio: A4_NISBAH }}>
                {item.preview_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.preview_url}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-fill"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-faint">
                    Text only
                  </div>
                )}
              </div>
              <CardSection baris className="flex flex-col gap-2 flex-1">
                {namaBaru?.id === item.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={namaBaru.tajuk}
                      onChange={(e) => setNamaBaru({ id: item.id, tajuk: e.target.value })}
                      maxLength={120}
                    />
                    <Button size="sm" disabled={busy || !namaBaru.tajuk.trim()} onClick={() => simpanNama(item.id)}>
                      <Check className="w-4 h-4" /> Save
                    </Button>
                  </div>
                ) : (
                  <div className="text-[16.8px] font-bold text-ink truncate" title={item.title}>
                    {item.title}
                  </div>
                )}
                <div className="text-xs text-ink-faint">
                  {item.text_tone === "light" ? "Light text" : "Dark text"}
                </div>
                <div className="mt-auto flex items-center gap-2 flex-wrap pt-2">
                  {gunaBuka === item.id ? (
                    <select
                      className="input"
                      value=""
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.value) gunaDalamKelas(item, e.target.value);
                      }}
                    >
                      <option value="">Choose a class...</option>
                      {kelas.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Button size="sm" disabled={busy || kelas.length === 0} onClick={() => setGunaBuka(gunaBuka === item.id ? null : item.id)}>
                      Use in class
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setNamaBaru({ id: item.id, tajuk: item.title })}>
                    Rename
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} ariaLabel="Delete this template from My templates" onClick={() => padam(item)}>
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </div>
              </CardSection>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-sm text-ink-muted">
        Need a shared design for all educators? Ask your administrator to publish it in
        the Kuizen gallery from{" "}
        <Link href="/educator/classes" className="text-brand-purple hover:underline">
          your classes
        </Link>
        .
      </p>
    </Shell>
  );
}
