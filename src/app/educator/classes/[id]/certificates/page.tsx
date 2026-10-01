"use client";

/**
 * Sijil (pendidik): templat, pratonton PDF, pengeluaran dan emel pukal.
 *
 * Bahagian:
 *   - Senarai templat dan dialog cipta dengan tiga tab (V2-016a): galeri
 *     Kuizen, Templat saya dan Blank (aliran lama).
 *   - Menu templat: "Copy to another class" dan "Save to My templates"
 *     (V2-016a; pelan Percuma disembunyi keupayaan dengan tooltip).
 *   - Panel "Certificate details" setiap templat (V2-016b): kursus, tarikh,
 *     tempat, penandatangan dan imej tandatangan (muat naik, pratonton,
 *     buang); medan kosong tidak dicetak pada sijil.
 *   - Pratonton PDF melalui POST /api/classes/[id]/certificates/preview.
 *   - "Issue certificates": jadual kelayakan daripada laluan issue tanpa
 *     confirm; butang pengeluaran memanggil semula dengan confirm: true.
 *   - Senarai sijil dikeluarkan dengan muat turun dan Revoke.
 *   - Emel pukal untuk pelan Pro/Institusi; free dikunci.
 *
 * Muat naik latar/logo dibuat terus dari pelayar ke bucket
 * certificate-assets melalui RLS (migrasi 0042), bukan melalui pelayan.
 * Tiada em dash dalam mana-mana rentetan UI.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, Eye, Mail, Plus, RefreshCw } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell, { type ClassTabKey } from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { getClass, listMyEducatorClasses, type Klass } from "@/lib/data";
import type { EducatorClassRow } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { authHeader } from "@/lib/peer-client";
import { pelanSaya } from "@/lib/pelan";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { tickLayak } from "@/lib/sijil/ui";
import { normaliseSusunAtur } from "@/lib/sijil/susunAtur";
import { normaliseMedan, type MedanSijil } from "@/lib/sijil/medan";
import type { ItemPustakaApi } from "@/lib/sijil/pustaka";
import LayoutEditor from "./layout-editor";

type Templat = {
  id: string;
  title: string;
  background_path: string | null;
  logo_path: string | null;
  layout: Record<string, unknown> | null;
  fields: Record<string, unknown> | null;
  signature_path: string | null;
  criteria: { type: string; hunt_id?: string; quiz_id?: string; min_score?: number };
};

type PratontonBaris = {
  participant_id: string;
  display_name: string;
  certificate_name: string | null;
  name_confirmed: boolean;
  eligible: boolean;
  reason: string;
  already_issued: boolean;
};

type Sijil = {
  id: string;
  code: string;
  name_snapshot: string;
  program_snapshot: string;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  template_id: string;
};

type Pilihan = { id: string; title: string };

// PNG A4 landskap 300 dpi (kira-kira 2.5 MB, kadang lebih) diterima.
const MAX_ASET = 8 * 1024 * 1024;
// Imej tandatangan (V2-016b): PNG lutsinar atau JPEG sehingga 1 MB.
const MAX_SIG = 1024 * 1024;

export default function CertificatesPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const confirm = useConfirm();

  const [klass, setKlass] = useState<Klass | null>(null);
  const [templat, setTemplat] = useState<Templat[]>([]);
  const [sijil, setSijil] = useState<Sijil[]>([]);
  const [hunts, setHunts] = useState<Pilihan[]>([]);
  const [kuiz, setKuiz] = useState<Pilihan[]>([]);
  const [plan, setPlan] = useState<string>("free");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Borang templat: null bermakna mod cipta.
  const [sunting, setSunting] = useState<string | null>(null);
  const [borangTerbuka, setBorangTerbuka] = useState(false);

  // Dialog cipta (V2-016a): tab aktif; null bermakna tertutup.
  const [dialogTab, setDialogTab] = useState<"gallery" | "mine" | "blank" | null>(null);
  const [pustaka, setPustaka] = useState<{ gallery: ItemPustakaApi[]; mine: ItemPustakaApi[] }>({ gallery: [], mine: [] });
  const [kelasPemanggil, setKelasPemanggil] = useState<EducatorClassRow[]>([]);
  const [salinBuka, setSalinBuka] = useState<string | null>(null);
  const [pustakaBusy, setPustakaBusy] = useState(false);
  const [tajuk, setTajuk] = useState("");
  const [jenis, setJenis] = useState("all_members");
  const [huntId, setHuntId] = useState("");
  const [quizId, setQuizId] = useState("");
  const [minSkor, setMinSkor] = useState("0");

  // Pengeluaran: templat dipilih dan jadual kelayakan.
  const [pilihTemplat, setPilihTemplat] = useState("");
  const [layak, setLayak] = useState<PratontonBaris[]>([]);
  const [tick, setTick] = useState<Record<string, boolean>>({});
  const [sedangHantar, setSedangHantar] = useState(false);

  const muatSemula = useCallback(async () => {
    const [{ data: t }, { data: c }, { data: h }, { data: q }] = await Promise.all([
      supabase
        .from("qm_certificate_templates")
        .select("id, title, background_path, logo_path, layout, fields, signature_path, criteria")
        .eq("class_id", classId)
        .order("created_at", { ascending: true }),
      supabase
        .from("qm_certificates")
        .select("id, code, name_snapshot, program_snapshot, issued_at, revoked_at, revoked_reason, template_id")
        .eq("class_id", classId)
        .order("issued_at", { ascending: false }),
      supabase.from("qm_hunts").select("id, title").eq("class_id", classId).order("title"),
      supabase.from("qm_live_quizzes").select("id, title").eq("class_id", classId).order("title"),
    ]);
    setTemplat((t as Templat[]) ?? []);
    setSijil((c as Sijil[]) ?? []);
    setHunts((h as Pilihan[]) ?? []);
    setKuiz((q as Pilihan[]) ?? []);
    if (!pilihTemplat && (t as Templat[] | null)?.length) setPilihTemplat(t![0].id);
  }, [classId, pilihTemplat]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [k, pl, kls] = await Promise.all([
          getClass(classId),
          pelanSaya(),
          listMyEducatorClasses().catch(() => [] as EducatorClassRow[]),
        ]);
        if (!alive) return;
        setKlass(k as Klass);
        setPlan(pl?.pelan ?? "free");
        setKelasPemanggil((kls as EducatorClassRow[]) ?? []);
        await muatSemula();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  /** Muat pustaka templat (galeri Kuizen + Templat saya) melalui API. */
  const muatPustaka = useCallback(async () => {
    const res = await fetch("/api/certificate-library", { headers: await authHeader() });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Could not load the template library.");
      return;
    }
    setPustaka({ gallery: j.gallery ?? [], mine: j.mine ?? [] });
  }, []);

  /** Buka dialog cipta dan muat pustaka sekali setiap pembukaan. */
  const bukaDialog = async (tab: "gallery" | "mine" | "blank") => {
    setDialogTab(tab);
    if (tab !== "blank") await muatPustaka();
  };

  /** Guna item pustaka (galeri atau Templat saya) dalam kelas ini. */
  const gunaItemPustaka = async (item: ItemPustakaApi) => {
    if (item.locked || pustakaBusy) return;
    setPustakaBusy(true);
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
      setMsg(null);
      setDialogTab(null);
      await muatSemula();
    } finally {
      setPustakaBusy(false);
    }
  };

  /** Simpan templat kelas ini ke Templat saya (V2-016a). */
  const simpanKePustaka = async (t: Templat) => {
    if (!pro || pustakaBusy) return;
    setPustakaBusy(true);
    try {
      const res = await fetch("/api/certificate-library", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ from_template_id: t.id, class_id: classId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not save the template.");
        return;
      }
      setMsg(`Saved "${t.title}" to My templates.`);
    } finally {
      setPustakaBusy(false);
    }
  };

  /** Salin templat kelas ini ke kelas lain yang pemanggil pendidiknya. */
  const salinKeKelasLain = async (t: Templat, targetClassId: string) => {
    if (!targetClassId || pustakaBusy) return;
    setPustakaBusy(true);
    try {
      const res = await fetch(
        `/api/classes/${classId}/certificates/templates/${t.id}/copy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ target_class_id: targetClassId }),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not copy the template.");
        return;
      }
      const nama = kelasPemanggil.find((k) => k.id === targetClassId)?.name ?? "the other class";
      setMsg(
        j.background_removed === true
          ? `Copied to ${nama}. The background was removed because that class is on the Free plan.`
          : `Copied to ${nama}.`,
      );
      setSalinBuka(null);
    } finally {
      setPustakaBusy(false);
    }
  };

  const pro = plan === "pro" || plan === "institution" || plan === "unlimited";

  const api = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    return res;
  };

  const simpanTemplat = async () => {
    if (!tajuk.trim()) {
      setMsg("Title is required.");
      return;
    }
    if (jenis === "hunt_completed" && !huntId) {
      setMsg("Choose an activity for this criteria.");
      return;
    }
    if (jenis === "live_attended" && !quizId) {
      setMsg("Choose a live quiz for this criteria.");
      return;
    }
    const criteria: Templat["criteria"] = { type: jenis };
    if (jenis === "hunt_completed") criteria.hunt_id = huntId;
    if (jenis === "live_attended") criteria.quiz_id = quizId;
    if (jenis === "min_score") criteria.min_score = Number(minSkor) || 0;

    const payload = {
      template_id: sunting ?? undefined,
      title: tajuk.trim(),
      criteria,
    };
    const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
      method: sunting ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Could not save the template.");
      return;
    }
    setMsg(null);
    setBorangTerbuka(false);
    setSunting(null);
    setTajuk("");
    setJenis("all_members");
    await muatSemula();
  };

  const muatNaikAset = async (templateId: string, jenisAset: "background" | "logo", fail: File | null) => {
    if (!fail) return;
    if (!fail.type.startsWith("image/")) {
      setMsg("Only image files are allowed.");
      return;
    }
    if (fail.size > MAX_ASET) {
      setMsg("Image must be 8 MB or smaller.");
      return;
    }
    const laluan = `${classId}/${crypto.randomUUID()}-${fail.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("certificate-assets")
      .upload(laluan, fail, { contentType: fail.type });
    if (error) {
      setMsg(error.message);
      return;
    }
    const body: Record<string, unknown> = { template_id: templateId };
    body[jenisAset === "background" ? "background_path" : "logo_path"] = laluan;
    const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Pencetus pelan menolak latar/logo untuk pelan free.
      setMsg(j.error ?? "Could not attach the image.");
    } else {
      setMsg(null);
    }
    await muatSemula();
  };

  /**
   * Suis "latar ialah reka bentuk penuh": tetapkan mode layout templat
   * (V2-015) sambil mengekalkan kedudukan nama, QR dan kod yang sudah
   * disimpan. Route PATCH yang menormalkan layout.
   */
  const togolMod = async (t: Templat, penuh: boolean) => {
    const susun = { ...normaliseSusunAtur(t.layout), mode: penuh ? ("full_background" as const) : ("standard" as const) };
    const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ template_id: t.id, layout: susun }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Could not save the mode.");
      return;
    }
    setMsg(null);
    await muatSemula();
  };

  const pratontonPdf = async () => {
    if (!pilihTemplat) return;
    const res = await api(`/api/classes/${classId}/certificates/preview`, {
      template_id: pilihTemplat,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error ?? "Preview failed.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const bacaKelayakan = async () => {
    if (!pilihTemplat) return;
    setSedangHantar(true);
    try {
      const res = await api(`/api/classes/${classId}/certificates/issue`, {
        template_id: pilihTemplat,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not read eligibility.");
        return;
      }
      setLayak(j.preview ?? []);
      setTick({});
    } finally {
      setSedangHantar(false);
    }
  };

  const keluarkan = async () => {
    const ids = tickLayak(layak, tick);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: "Issue certificates",
      description: `Issue certificates to ${ids.length} participant${ids.length === 1 ? "" : "s"}? This cannot be undone except by revoking.`,
      confirmLabel: "Issue",
    });
    if (!ok) return;
    const res = await api(`/api/classes/${classId}/certificates/issue`, {
      template_id: pilihTemplat,
      participant_ids: ids,
      confirm: true,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Could not issue certificates.");
      return;
    }
    setMsg(null);
    await bacaKelayakan();
    await muatSemula();
  };

  const emelPukal = async () => {
    const ok = await confirm({
      title: "Email certificates",
      description: "Send certificate emails to participants who have not received one yet?",
      confirmLabel: "Send",
    });
    if (!ok) return;
    const res = await api(`/api/classes/${classId}/certificates/email`, {});
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Could not send certificate emails.");
      return;
    }
    setMsg(`Emails sent: ${j.sent ?? 0}.`);
  };

  const [revokeSijil, setRevokeSijil] = useState<Sijil | null>(null);
  const [sebabBatalkan, setSebabBatalkan] = useState("");

  // Editor susun atur (V2-015): templat yang sedang dibuka.
  const [editor, setEditor] = useState<Templat | null>(null);

  // Panel medan isian (V2-016b): templat yang sedang dibuka dan borangnya.
  const [medanBuka, setMedanBuka] = useState<string | null>(null);
  const [borangMedan, setBorangMedan] = useState<MedanSijil>({});
  const [sigUrl, setSigUrl] = useState<Record<string, string>>({});
  const [medanBusy, setMedanBusy] = useState(false);

  /** Buka panel Certificate details dan isikan borang daripada templat. */
  const bukaMedan = async (t: Templat) => {
    if (medanBuka === t.id) {
      setMedanBuka(null);
      return;
    }
    setBorangMedan(normaliseMedan(t.fields));
    setMedanBuka(t.id);
    setMsg(null);
    // Pratonton imej tandatangan melalui URL bertandatangan pelayan.
    if (t.signature_path) {
      const res = await fetch(
        `/api/classes/${classId}/certificates/templates/${t.id}/signature-url`,
        { headers: await authHeader() },
      );
      const j = await res.json().catch(() => ({}));
      if (res.ok && typeof j.url === "string") {
        setSigUrl((p) => ({ ...p, [t.id]: j.url }));
      } else {
        setSigUrl((p) => ({ ...p, [t.id]: "" }));
      }
    } else {
      setSigUrl((p) => ({ ...p, [t.id]: "" }));
    }
  };

  /** Simpan medan isian templat melalui PATCH templates (semantik ganti). */
  const simpanMedan = async (t: Templat) => {
    if (medanBusy) return;
    // Tarikh tamat mesti sama hari atau lebih lewat daripada tarikh mula.
    if (
      borangMedan.date_start && borangMedan.date_end
      && borangMedan.date_end < borangMedan.date_start
    ) {
      setMsg("End date must be on or after the start date.");
      return;
    }
    setMedanBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ template_id: t.id, fields: borangMedan }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not save the certificate details.");
        return;
      }
      setMsg(null);
      setMedanBuka(null);
      await muatSemula();
    } finally {
      setMedanBusy(false);
    }
  };

  /**
   * Muat naik imej tandatangan melalui aliran tiket (V2-016b):
   * asset-ticket kind signature, PUT terus ke storan, kemudian asset-finalize.
   */
  const muatNaikTandatangan = async (t: Templat, fail: File | null) => {
    if (!fail || medanBusy) return;
    if (fail.type !== "image/png" && fail.type !== "image/jpeg") {
      setMsg("The signature must be a PNG or JPEG image.");
      return;
    }
    if (fail.size > MAX_SIG) {
      setMsg("The signature image must be 1 MB or smaller.");
      return;
    }
    setMedanBusy(true);
    try {
      const tiketRes = await fetch(
        `/api/classes/${classId}/certificates/templates/${t.id}/asset-ticket`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ kind: "signature", mimeType: fail.type, size: fail.size }),
        },
      );
      const tiket = await tiketRes.json().catch(() => ({}));
      if (!tiketRes.ok || typeof tiket.upload_url !== "string") {
        setMsg(tiket.error ?? "Could not start the signature upload.");
        return;
      }
      const put = await fetch(tiket.upload_url, {
        method: "PUT",
        headers: { "Content-Type": fail.type },
        body: fail,
      });
      if (!put.ok) {
        setMsg("Could not upload the signature image.");
        return;
      }
      const finRes = await fetch(
        `/api/classes/${classId}/certificates/templates/${t.id}/asset-finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ kind: "signature", path: tiket.path }),
        },
      );
      const fin = await finRes.json().catch(() => ({}));
      if (!finRes.ok) {
        setMsg(fin.error ?? "Could not attach the signature image.");
        return;
      }
      setMsg(null);
      await muatSemula();
    } finally {
      setMedanBusy(false);
    }
  };

  /** Buang imej tandatangan templat (PATCH clear_signature). */
  const buangTandatangan = async (t: Templat) => {
    if (medanBusy) return;
    setMedanBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ template_id: t.id, clear_signature: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Could not remove the signature image.");
        return;
      }
      setMsg(null);
      setSigUrl((p) => ({ ...p, [t.id]: "" }));
      await muatSemula();
    } finally {
      setMedanBusy(false);
    }
  };

  const batalkan = async (s: Sijil) => {
    const ok = await confirm({
      title: "Revoke certificate",
      description: `Revoke the certificate for ${s.name_snapshot}? The public page will show it as Revoked.`,
      confirmLabel: "Revoke",
      tone: "danger",
    });
    if (!ok) return;
    if (!sebabBatalkan.trim()) {
      setMsg("A revocation reason is required.");
      return;
    }
    const res = await fetch(`/api/certificates/${s.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ reason: sebabBatalkan.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Could not revoke the certificate.");
      return;
    }
    setRevokeSijil(null);
    setSebabBatalkan("");
    await muatSemula();
  };

  const muatTurun = async (s: Sijil) => {
    const res = await fetch(`/api/certificates/${s.id}/download`, { headers: await authHeader() });
    if (!res.ok) {
      setMsg("Download is not ready yet.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.code}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Shell tabs={EDU_TABS}>
        <div className="p-8 text-slate-500">Loading...</div>
      </Shell>
    );
  }

  const bilanganTick = tickLayak(layak, tick).length;

  return (
    <Shell tabs={EDU_TABS}>
            <ClassShell classId={classId} current={"certificates" as ClassTabKey} klass={klass}>
        {msg && <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm">{msg}</div>}

        {/* Templat */}
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Certificate templates</h2>
          <div className="flex items-center gap-2">
            <Link href="/educator/certificates" className="btn-quiet">
              My templates
            </Link>
            <button
              className="btn-primary"
              onClick={() => {
                setSunting(null);
                setTajuk("");
                setJenis("all_members");
                bukaDialog("gallery");
              }}
            >
              <Plus className="w-4 h-4" /> New certificate
            </button>
          </div>
        </div>

        {/* Dialog cipta (V2-016a): galeri Kuizen, Templat saya, Blank. */}
        {dialogTab !== null && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  ["gallery", "Kuizen gallery"],
                  ["mine", "My templates"],
                  ["blank", "Blank"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    dialogTab === k
                      ? "bg-violet-50 border border-violet-200 text-brand-purple"
                      : "bg-white border-hairline text-ink-muted hover:text-ink"
                  }`}
                  onClick={() => {
                    if (k === "blank") {
                      setSunting(null);
                      setTajuk("");
                      setJenis("all_members");
                      setBorangTerbuka(true);
                      setDialogTab("blank");
                    } else {
                      setBorangTerbuka(false);
                      setSunting(null);
                      bukaDialog(k);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                className="btn-quiet ml-auto"
                onClick={() => {
                  setDialogTab(null);
                  setBorangTerbuka(false);
                  setSunting(null);
                }}
              >
                Close
              </button>
            </div>

            {dialogTab !== "blank" && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {(dialogTab === "gallery" ? pustaka.gallery : pustaka.mine).map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border bg-white overflow-hidden flex flex-col ${
                      item.locked ? "border-hairline" : "border-violet-200"
                    }`}
                  >
                    <div className="relative bg-slate-100" style={{ aspectRatio: "841.89 / 595.28" }}>
                      {item.preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.preview_url}
                          alt={item.title}
                          className="absolute inset-0 w-full h-full object-fill"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                          Text only
                        </div>
                      )}
                      {item.locked && (
                        <Link
                          href="/#harga"
                          title="Available on Pro"
                          className="absolute top-2 right-2 rounded-md bg-amber-400 text-black text-[10px] font-bold px-2 py-0.5"
                        >
                          Pro
                        </Link>
                      )}
                    </div>
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div className="text-sm font-semibold truncate" title={item.title}>
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.text_tone === "light" ? "Light text" : "Dark text"}
                        {item.kind === "participation"
                          ? " · Participation"
                          : item.kind === "achievement"
                            ? " · Achievement"
                            : ""}
                      </div>
                      <div className="mt-auto">
                        {item.locked ? (
                          <Link
                            href="/#harga"
                            className="btn-quiet w-full text-center block"
                            title="Available on Pro"
                          >
                            Pro plan required
                          </Link>
                        ) : (
                          <button
                            className="btn-primary w-full"
                            disabled={pustakaBusy}
                            onClick={() => gunaItemPustaka(item)}
                          >
                            Use in class
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {(dialogTab === "gallery" ? pustaka.gallery : pustaka.mine).length === 0 && (
                  <div className="col-span-full rounded-xl border border-hairline p-8 text-center text-slate-500">
                    No templates yet
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {borangTerbuka && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-6 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                className="input w-full"
                value={tajuk}
                onChange={(e) => setTajuk(e.target.value)}
                placeholder="Certificate of Completion"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Criteria</label>
              <select className="input w-full" value={jenis} onChange={(e) => setJenis(e.target.value)}>
                <option value="all_members">All members</option>
                <option value="hunt_completed">Completed a specific activity</option>
                <option value="min_score">Minimum score</option>
                <option value="live_attended">Attended a live quiz</option>
              </select>
            </div>
            {jenis === "hunt_completed" && (
              <select className="input w-full" value={huntId} onChange={(e) => setHuntId(e.target.value)}>
                <option value="">Choose an activity...</option>
                {hunts.map((h) => (
                  <option key={h.id} value={h.id}>{h.title}</option>
                ))}
              </select>
            )}
            {jenis === "live_attended" && (
              <select className="input w-full" value={quizId} onChange={(e) => setQuizId(e.target.value)}>
                <option value="">Choose a live quiz...</option>
                {kuiz.map((q) => (
                  <option key={q.id} value={q.id}>{q.title}</option>
                ))}
              </select>
            )}
            {jenis === "min_score" && (
              <input
                className="input w-full"
                type="number"
                min={0}
                value={minSkor}
                onChange={(e) => setMinSkor(e.target.value)}
                placeholder="Minimum score"
              />
            )}
            <div className="flex gap-2">
              <button className="btn-primary" onClick={simpanTemplat}>Save template</button>
              <button className="btn-quiet" onClick={() => { setBorangTerbuka(false); setSunting(null); }}>Cancel</button>
            </div>
          </div>
        )}

        {templat.length === 0 ? (
          <div className="rounded-xl border border-hairline p-8 text-center text-slate-500 mb-8">
            No certificate templates yet. Create one to start issuing certificates.
          </div>
        ) : (
          <div className="space-y-3 mb-8">
            {templat.map((t) => (
              <div key={t.id}>
                <div className="rounded-xl border border-hairline bg-white p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold">{t.title}</div>
                  <div className="text-sm text-slate-500">
                    {t.criteria?.type === "all_members" && "All members"}
                    {t.criteria?.type === "hunt_completed" && "Completed a specific activity"}
                    {t.criteria?.type === "min_score" && `Minimum score: ${t.criteria.min_score ?? 0}`}
                    {t.criteria?.type === "live_attended" && "Attended a live quiz"}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className={`btn-quiet ${pro ? "" : "opacity-50 cursor-not-allowed"}`} title={pro ? "Upload background image" : "Available on Pro"}>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!pro}
                      onChange={(e) => muatNaikAset(t.id, "background", e.target.files?.[0] ?? null)}
                    />
                    Background {pro ? "" : "(Pro)"}
                  </label>
                  <label className={`btn-quiet ${pro ? "" : "opacity-50 cursor-not-allowed"}`} title={pro ? "Upload logo" : "Available on Pro"}>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!pro}
                      onChange={(e) => muatNaikAset(t.id, "logo", e.target.files?.[0] ?? null)}
                    />
                    Logo {pro ? "" : "(Pro)"}
                  </label>
                  {t.background_path && (
                    <label
                      className="flex items-center gap-2 text-sm"
                      title="When on, the background is a complete design: only the name, QR and code are printed over it"
                    >
                      <input
                        type="checkbox"
                        checked={(t.layout?.mode as string) === "full_background"}
                        onChange={(e) => togolMod(t, e.target.checked)}
                      />
                      Complete design
                    </label>
                  )}
                  {t.background_path && (
                    <button className="btn-quiet" onClick={() => setEditor(t)}>
                      Edit layout
                    </button>
                  )}
                  <button
                    className="btn-quiet"
                    onClick={() => {
                      setSunting(t.id);
                      setTajuk(t.title);
                      setJenis(t.criteria?.type ?? "all_members");
                      setHuntId(t.criteria?.hunt_id ?? "");
                      setQuizId(t.criteria?.quiz_id ?? "");
                      setMinSkor(String(t.criteria?.min_score ?? 0));
                      setBorangTerbuka(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className={`btn-quiet ${pro ? "" : "opacity-50 cursor-not-allowed"}`}
                    title={pro ? "Save this template to My templates" : "Available on Pro"}
                    disabled={!pro || pustakaBusy}
                    onClick={() => simpanKePustaka(t)}
                  >
                    Save to My templates
                  </button>
                  {salinBuka === t.id ? (
                    <select
                      className="input"
                      value=""
                      disabled={pustakaBusy}
                      onChange={(e) => {
                        if (e.target.value) salinKeKelasLain(t, e.target.value);
                      }}
                    >
                      <option value="">Choose a class...</option>
                      {kelasPemanggil
                        .filter((k) => k.id !== classId)
                        .map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <button
                      className="btn-quiet"
                      title="Copy this template to another class you teach"
                      disabled={kelasPemanggil.filter((k) => k.id !== classId).length === 0}
                      onClick={() => setSalinBuka(salinBuka === t.id ? null : t.id)}
                    >
                      Copy to another class
                    </button>
                  )}
                  <button className="btn-quiet" onClick={() => bukaMedan(t)}>
                    Certificate details
                  </button>
                </div>
                </div>

                {/* Panel medan isian (V2-016b) */}
                {medanBuka === t.id && (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mt-2 space-y-3">
                    <h4 className="font-semibold">Certificate details</h4>
                    <p className="text-sm text-slate-500">
                      These values are printed on every certificate of this template. Empty
                      fields are never printed.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">Course / programme</label>
                        <input
                          className="input w-full"
                          value={borangMedan.course ?? ""}
                          maxLength={160}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, course: e.target.value }))}
                          placeholder="Bengkel Robotik 2026"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Location</label>
                        <input
                          className="input w-full"
                          value={borangMedan.location ?? ""}
                          maxLength={120}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, location: e.target.value }))}
                          placeholder="Dewan Kuliah FKMT, UPSI"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Start date</label>
                        <input
                          className="input w-full"
                          type="date"
                          value={borangMedan.date_start ?? ""}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, date_start: e.target.value || undefined }))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">End date (optional)</label>
                        <input
                          className="input w-full"
                          type="date"
                          value={borangMedan.date_end ?? ""}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, date_end: e.target.value || undefined }))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Signer name</label>
                        <input
                          className="input w-full"
                          value={borangMedan.signer_name ?? ""}
                          maxLength={100}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, signer_name: e.target.value }))}
                          placeholder="Dr Hariz"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Signer title</label>
                        <input
                          className="input w-full"
                          value={borangMedan.signer_title ?? ""}
                          maxLength={120}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, signer_title: e.target.value }))}
                          placeholder="Pensyarah"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label
                        className={`btn-quiet ${pro ? "" : "opacity-50 cursor-not-allowed"}`}
                        title={pro ? "Upload signature image (PNG or JPEG, max 1 MB)" : "Available on Pro"}
                      >
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          disabled={!pro || medanBusy}
                          onChange={(e) => muatNaikTandatangan(t, e.target.files?.[0] ?? null)}
                        />
                        Upload signature {pro ? "" : "(Pro)"}
                      </label>
                      {sigUrl[t.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sigUrl[t.id]}
                          alt="Signature"
                          className="h-10 rounded border border-hairline bg-white px-1"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">
                          {t.signature_path ? "Loading signature..." : "No signature image yet"}
                        </span>
                      )}
                      {t.signature_path && (
                        <button
                          className="btn-quiet text-red-600"
                          disabled={medanBusy}
                          onClick={() => buangTandatangan(t)}
                        >
                          Remove signature
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={() => simpanMedan(t)} disabled={medanBusy}>
                        Save
                      </button>
                      <button className="btn-quiet" onClick={() => setMedanBuka(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {editor && (() => {
          // Templat segar daripada senarai supaya mode terkini digunakan
          // walaupun suis di baris templat diketik semasa editor terbuka.
          const t = templat.find((x) => x.id === editor.id) ?? editor;
          return (
            <LayoutEditor
              classId={classId}
              templateId={t.id}
              mode={
                (t.layout?.mode as string) === "full_background"
                  ? "full_background"
                  : "standard"
              }
              layout={t.layout}
              backgroundPath={t.background_path ?? ""}
              medan={t.fields}
              onClose={() => setEditor(null)}
              onSaved={muatSemula}
            />
          );
        })()}

        {/* Pengeluaran */}
        <div className="rounded-xl border border-hairline bg-white p-4 mb-8">
          <h3 className="font-semibold mb-3">Issue certificates</h3>
          <div className="flex items-end gap-2 mb-4 flex-wrap">
            <div>
              <label className="block text-sm font-medium mb-1">Template</label>
              <select className="input" value={pilihTemplat} onChange={(e) => setPilihTemplat(e.target.value)}>
                {templat.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <button className="btn-primary" onClick={bacaKelayakan} disabled={sedangHantar || !pilihTemplat}>
              <RefreshCw className="w-4 h-4" /> Check eligibility
            </button>
            <button className="btn-quiet" onClick={pratontonPdf} disabled={!pilihTemplat}>
              <Eye className="w-4 h-4" /> Preview PDF
            </button>
            <button
              className="btn-primary"
              onClick={pro ? emelPukal : undefined}
              disabled={!pro}
              title={pro ? "Send certificate emails" : "Available on Pro"}
            >
              <Mail className="w-4 h-4" /> Email certificates{pro ? "" : " (Pro)"}
            </button>
          </div>

          {layak.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-hairline">
                    <th className="py-2 pr-3"></th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Certificate name</th>
                    <th className="py-2 pr-3">Eligible</th>
                    <th className="py-2 pr-3">Reason</th>
                    <th className="py-2 pr-3">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {layak.map((r) => (
                    <tr key={r.participant_id} className="border-b border-hairline">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          disabled={!r.eligible || r.already_issued}
                          checked={!!tick[r.participant_id]}
                          onChange={(e) => setTick((p) => ({ ...p, [r.participant_id]: e.target.checked }))}
                        />
                      </td>
                      <td className="py-2 pr-3">{r.display_name}</td>
                      <td className="py-2 pr-3">
                        {r.name_confirmed ? r.certificate_name : <span className="text-amber-600">Waiting for name confirmation</span>}
                      </td>
                      <td className="py-2 pr-3">{r.eligible ? "Yes" : "No"}</td>
                      <td className="py-2 pr-3 text-slate-500">{r.reason}</td>
                      <td className="py-2 pr-3">{r.already_issued ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn-primary mt-3" onClick={keluarkan} disabled={bilanganTick === 0}>
                <Plus className="w-4 h-4" /> Issue to {bilanganTick} participant{bilanganTick === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </div>

        {/* Sijil dikeluarkan */}
        <div className="rounded-xl border border-hairline bg-white p-4">
          <h3 className="font-semibold mb-3">Issued certificates</h3>
          {sijil.length === 0 ? (
            <p className="text-sm text-slate-500">No certificates issued yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-hairline">
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sijil.map((s) => (
                    <tr key={s.id} className="border-b border-hairline">
                      <td className="py-2 pr-3 font-mono">{s.code}</td>
                      <td className="py-2 pr-3">{s.name_snapshot}</td>
                      <td className="py-2 pr-3">{new Date(s.issued_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">
                        {s.revoked_at ? (
                          <span className="text-red-600">Revoked</span>
                        ) : (
                          <span className="text-emerald-600">Active</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <button className="btn-quiet" onClick={() => muatTurun(s)}>
                          <Download className="w-4 h-4" /> Download
                        </button>
                        {!s.revoked_at && (
                          <button
                            className="btn-quiet text-red-600"
                            onClick={() => {
                              setRevokeSijil(s);
                              setSebabBatalkan("");
                            }}
                          >
                            Revoke
                          </button>
                        )}
                        {revokeSijil?.id === s.id && (
                          <span className="inline-flex items-center gap-2">
                            <input
                              className="input"
                              value={sebabBatalkan}
                              onChange={(e) => setSebabBatalkan(e.target.value)}
                              placeholder="Reason for revocation"
                            />
                            <button className="btn-primary" onClick={() => batalkan(s)}>
                              Confirm
                            </button>
                            <button className="btn-quiet" onClick={() => setRevokeSijil(null)}>
                              Cancel
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ClassShell>
      </Shell>
    );
}

