"use client";

/**
 * Sijil (pendidik): templat, pratonton PDF, pengeluaran dan emel pukal.
 *
 * Bahagian:
 *   - Senarai templat dan dialog cipta dengan tiga tab (V2-016a): galeri
 *     Kuizen, Templat saya dan Blank (aliran lama).
 *   - Templat AKTIF kelas (KZ-009): lencana "Active", butang Set as active
 *     (RPC qm_set_active_certificate_template), templat aktif dipilih
 *     secara lalai; latar baharu pada templat standard menghidupkan
 *     Complete design secara automatik.
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
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Award, Download, Eye, Mail, Plus, RefreshCw } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell, { type ClassTabKey } from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { getClass, listMyEducatorClasses, type Klass } from "@/lib/data";
import type { EducatorClassRow } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { authHeader } from "@/lib/peer-client";
import { pelanSaya } from "@/lib/pelan";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  CardSection,
  CheckRadio,
  DataTable,
  EmptyState,
  Field,
  Input,
  Select,
  Tabs,
  type DataColumn,
} from "@/components/ui";
import { idBolehPilih, pecahKelompok, tickLayak } from "@/lib/sijil/ui";
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
  // KZ-009: templat aktif kelas (satu sahaja per kelas); dipilih secara
  // lalai dan ditukar melalui RPC qm_set_active_certificate_template.
  is_active: boolean;
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
  // KZ-007: untuk lajur Email dan kotak semak pilihan emel.
  emailed_at: string | null;
  pdf_path: string | null;
};

type Pilihan = { id: string; title: string };

/** Gambar kecil latar sebuah templat: muat URL bertandatangan sekali bagi
 *  setiap templat dan papar nisbah A4 landskap. Klik membuka editor.
 *  Templat tanpa background_path tidak memaparkan apa-apa. */
function LakaranLatar({
  classId,
  t,
  onBuka,
}: {
  classId: string;
  t: Templat;
  onBuka: (t: Templat) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    if (!t.background_path) return;
    let alive = true;
    setUrl(null);
    setGagal(false);
    (async () => {
      const res = await fetch(
        `/api/classes/${classId}/certificates/templates/${t.id}/background-url`,
        { headers: await authHeader() },
      );
      const j = await res.json().catch(() => ({}));
      if (!alive) return;
      if (res.ok && typeof j.url === "string") {
        setUrl(j.url);
      } else {
        setGagal(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [classId, t.id, t.background_path]);

  if (!t.background_path) return null;
  return (
    <button
      type="button"
      className="shrink-0 block w-[120px]"
      title="Edit layout"
      onClick={() => onBuka(t)}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Background of ${t.title}`}
          className="block w-[120px] rounded-lg border border-hairline"
          style={{ aspectRatio: "841.89 / 595.28" }}
          draggable={false}
        />
      ) : (
        <div
          className="flex w-[120px] items-center justify-center rounded-lg border border-hairline bg-slate-100 text-[10px] text-slate-500"
          style={{ aspectRatio: "841.89 / 595.28" }}
        >
          {gagal ? "No preview" : "Loading..."}
        </div>
      )}
    </button>
  );
}

// PNG A4 landskap 300 dpi (kira-kira 2.5 MB, kadang lebih) diterima.
const MAX_ASET = 8 * 1024 * 1024;
// Imej tandatangan (V2-016b): PNG lutsinar atau JPEG sehingga 1 MB.
const MAX_SIG = 1024 * 1024;

// KZ-025b: kelas label muat naik fail (Background/Logo/Upload signature)
// yang meniru butang ghost sm kit. Komponen Button kit memulangkan <button>
// atau <a>, jadi ia tidak boleh membungkus <input type="file" tersembunyi>.
const LABEL_FAIL =
  "inline-flex items-center justify-center gap-2 font-bold tracking-[0.26px] rounded-[4px] transition select-none h-8 px-3 text-[12px] text-ink-muted hover:bg-[#ebeef2] disabled:opacity-40";

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
  // KZ-009: butang Set as active yang sedang diproses (id templat).
  const [aktifBusy, setAktifBusy] = useState<string | null>(null);
  const [layak, setLayak] = useState<PratontonBaris[]>([]);
  const [tick, setTick] = useState<Record<string, boolean>>({});
  const [sedangHantar, setSedangHantar] = useState(false);
  // KZ-011: pengeluaran berkelompok (10 peserta setiap permintaan).
  // issueBusy mengunci butang issue; kemajuan dipapar pada butang.
  const [issueBusy, setIssueBusy] = useState(false);
  const [kemajuan, setKemajuan] = useState<{ semasa: number; jumlah: number } | null>(null);
  // KZ-011: ref kotak semak kepala untuk keadaan indeterminate.
  const kepalaTickRef = useRef<HTMLInputElement>(null);

  // KZ-011: baris jadual kelayakan yang boleh dipilih, keadaan kotak kepala
  // dan ringkasan kecil di atas jadual.
  const barisBolehPilih = layak.filter(idBolehPilih);
  const semuaBolehPilihTicked =
    barisBolehPilih.length > 0 &&
    barisBolehPilih.every((r) => tick[r.participant_id] === true);
  const bilanganLayak = layak.filter((r) => r.eligible).length;
  const bilanganSudahDikeluarkan = layak.filter((r) => r.already_issued).length;
  const bilanganTidakLayak = layak.length - bilanganLayak;

  // KZ-011: kotak kepala indeterminate bila sebahagian sahaja ditanda.
  useEffect(() => {
    if (kepalaTickRef.current) {
      kepalaTickRef.current.indeterminate =
        barisBolehPilih.some((r) => tick[r.participant_id] === true) &&
        !semuaBolehPilihTicked;
    }
  }, [barisBolehPilih, layak, tick, semuaBolehPilihTicked]);

  const muatSemula = useCallback(async () => {
    const [{ data: t }, { data: c }, { data: h }, { data: q }] = await Promise.all([
      supabase
        .from("qm_certificate_templates")
        .select("id, title, background_path, logo_path, layout, fields, signature_path, criteria, is_active")
        .eq("class_id", classId)
        .order("created_at", { ascending: true }),
      supabase
        .from("qm_certificates")
        .select("id, code, name_snapshot, program_snapshot, issued_at, revoked_at, revoked_reason, template_id, emailed_at, pdf_path")
        .eq("class_id", classId)
        .order("issued_at", { ascending: false }),
      supabase.from("qm_hunts").select("id, title").eq("class_id", classId).order("title"),
      supabase.from("qm_live_quizzes").select("id, title").eq("class_id", classId).order("title"),
    ]);
    const senarai = (t as Templat[]) ?? [];
    setTemplat(senarai);
    setSijil((c as Sijil[]) ?? []);
    setHunts((h as Pilihan[]) ?? []);
    setKuiz((q as Pilihan[]) ?? []);
    // KZ-009: templat AKTIF dipilih secara lalai (templat pertama jika
    // kelas tiada templat aktif), bukan senarai[0] buta.
    if (!pilihTemplat && senarai.length) {
      const aktif = senarai.find((x) => x.is_active);
      setPilihTemplat((aktif ?? senarai[0]).id);
    }
    // Dipulangkan supaya pemanggil boleh mencari templat baharu yang
    // dimuat semula (layout dan background_path terkini).
    return senarai;
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
      // Muat semula senarai dahulu, kemudian buka editor templat baharu
      // supaya layout dan background_path terkini digunakan.
      const senarai = await muatSemula();
      const idBaharu = typeof (j as { template?: { id?: unknown } }).template?.id === "string"
        ? ((j as { template: { id: string } }).template.id)
        : "";
      const baharu = idBaharu ? senarai.find((x) => x.id === idBaharu) ?? null : null;
      if (baharu) {
        setPilihTemplat(baharu.id);
        if (baharu.background_path) setEditor(baharu);
      }
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

  const muatNaikAset = async (t: Templat, jenisAset: "background" | "logo", fail: File | null) => {
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
    const body: Record<string, unknown> = { template_id: t.id };
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
      // KZ-009: latar dimuat naik pada templat mod standard menghidupkan
      // "Complete design" secara automatik supaya sempadan dan tajuk
      // lalai tidak bertindih dengan latar reka bentuk lengkap; Boss
      // masih boleh nyahtanda suis selepas ini.
      if (jenisAset === "background" && (t.layout?.mode as string) !== "full_background") {
        const berjaya = await togolMod(t, true);
        if (berjaya) {
          setMsg('Background added. "Complete design" is on, so only the name, details, signature and QR are printed on top.');
        }
      }
    }
    await muatSemula();
  };

  /**
   * Suis "latar ialah reka bentuk penuh": tetapkan mode layout templat
   * (V2-015) sambil mengekalkan kedudukan nama, QR dan kod yang sudah
   * disimpan. Route PATCH yang menormalkan layout. KZ-009: memulangkan
   * berjaya/gagal supaya pemanggil (muatNaikAset) tahu bila mesej
   * "Background added" wajar dipapar.
   */
  const togolMod = async (t: Templat, penuh: boolean): Promise<boolean> => {
    const susun = { ...normaliseSusunAtur(t.layout), mode: penuh ? ("full_background" as const) : ("standard" as const) };
    const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ template_id: t.id, layout: susun }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? "Could not save the mode.");
      return false;
    }
    setMsg(null);
    await muatSemula();
    return true;
  };

  /**
   * KZ-009: tetapkan templat ini sebagai templat AKTIF kelas melalui RPC
   * qm_set_active_certificate_template (menukar is_active secara atomik
   * di pangkalan data; klien tidak boleh menulis lajur itu terus).
   * Selepas muat semula, templat itu menjadi pilihan bahagian Issue.
   */
  const tetapAktif = async (t: Templat) => {
    if (aktifBusy) return;
    setAktifBusy(t.id);
    try {
      const { error } = await supabase.rpc("qm_set_active_certificate_template", {
        p_template: t.id,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      await muatSemula();
      setPilihTemplat(t.id);
      setMsg(`"${t.title}" is now the active certificate.`);
    } finally {
      setAktifBusy(null);
    }
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
    // KZ-011: pengeluaran berkelompok, 10 peserta setiap permintaan, berurutan.
    // Setiap kelompok memanggil laluan issue sedia ada dengan confirm: true;
    // PDF berat tidak lagi dijana semua sekali dalam satu permintaan.
    setIssueBusy(true);
    setKemajuan({ semasa: 0, jumlah: ids.length });
    let jumlahDikeluarkan = 0;
    let ralatKeluarkan: string | null = null;
    try {
      const kelompok = pecahKelompok(ids, 10);
      for (let i = 0; i < kelompok.length; i++) {
        // Kemajuan: bilangan peserta yang terhantar setelah kelompok ini tamat.
        setKemajuan({ semasa: Math.min((i + 1) * 10, ids.length), jumlah: ids.length });
        const res = await api(`/api/classes/${classId}/certificates/issue`, {
          template_id: pilihTemplat,
          participant_ids: kelompok[i],
          confirm: true,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          ralatKeluarkan = j.error ?? "Could not issue certificates.";
          break;
        }
        const bilangan = typeof (j as { issued?: unknown }).issued === "number"
          ? (j as { issued: number }).issued
          : 0;
        jumlahDikeluarkan += bilangan;
      }
    } finally {
      setIssueBusy(false);
      setKemajuan(null);
    }
    // KZ-007: sentiasa papar mesej selepas issue supaya pendidik tahu
    // apa yang berlaku. KZ-011: jika satu kelompok gagal, mesej membawa
    // bilangan yang sudah dikeluarkan sebelum berhenti.
    if (ralatKeluarkan) {
      setMsg(
        `Issued ${jumlahDikeluarkan} certificate${jumlahDikeluarkan === 1 ? "" : "s"} before stopping: ${ralatKeluarkan}`,
      );
    } else if (jumlahDikeluarkan === 0) {
      setMsg("No new certificates were issued. Everyone selected already has a certificate or has no name.");
    } else {
      setMsg(`Issued ${jumlahDikeluarkan} certificate${jumlahDikeluarkan === 1 ? "" : "s"}.`);
    }
    // KZ-011: segar semula sekali sahaja selepas semua kelompok tamat
    // (termasuk apabila satu kelompok gagal), bukan selepas setiap kelompok.
    await bacaKelayakan();
    await muatSemula();
  };

  // KZ-007: pilihan kotak semak sijil untuk emel terpilih.
  const [pilihEmel, setPilihEmel] = useState<Record<string, boolean>>({});
  const [emelBusy, setEmelBusy] = useState(false);

  // Sijil boleh diemel: tidak dibatalkan dan PDF sudah ada.
  const sijilBolehEmel = (s: Sijil) => !s.revoked_at && !!s.pdf_path;
  const terpilihEmel = sijil.filter((s) => sijilBolehEmel(s) && pilihEmel[s.id]);
  const bilanganPilihEmel = terpilihEmel.length;
  const semuaPilihEmel = sijil.some(sijilBolehEmel) && bilanganPilihEmel === sijil.filter(sijilBolehEmel).length;

  const emelPukal = async () => {
    const ok = await confirm({
      title: "Email certificates",
      description: "Send certificate emails to participants who have not received one yet? The certificate PDF will be attached.",
      confirmLabel: "Send",
    });
    if (!ok) return;
    await hantarEmel(null, false);
  };

  /** KZ-007: emel sijil terpilih (resend supaya yang sudah diemel boleh dihantar semula). */
  const emelTerpilih = async () => {
    if (bilanganPilihEmel === 0) return;
    const ok = await confirm({
      title: "Email selected certificates",
      description: `Send certificate emails to ${bilanganPilihEmel} selected participant${bilanganPilihEmel === 1 ? "" : "s"}? Anyone already emailed will receive it again. The certificate PDF will be attached.`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    await hantarEmel(terpilihEmel.map((s) => s.id), true);
  };

  /** KZ-007: emel satu sijil daripada baris jadual (Send atau Resend). */
  const emelSatu = async (s: Sijil) => {
    const ok = await confirm({
      title: s.emailed_at ? "Resend certificate email" : "Send certificate email",
      description: `Send the certificate email to ${s.name_snapshot}? The certificate PDF will be attached.`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    await hantarEmel([s.id], true);
  };

  /**
   * Hantar permintaan emel dan papar mesej hasil; kosongkan pilihan dan muat
   * semula. KZ-008: pelayan menghantar maksimum 20 emel setiap panggilan
   * (p_limit 20) supaya tidak melebihi timeout nginx 60 saat. Tanpa ids
   * (Email all unsent): ulang panggilan selagi more === true dan sent > 0,
   * maksimum 10 pusingan. Dengan ids (Email selected): pecahkan kepada
   * kelompok 20 dan hantar berturutan.
   */
  const hantarEmel = async (ids: string[] | null, resend: boolean) => {
    if (emelBusy) return;
    setEmelBusy(true);
    try {
      const kelompok: (string[] | null)[] = [];
      if (ids && ids.length > 0) {
        for (let i = 0; i < ids.length; i += 20) kelompok.push(ids.slice(i, i + 20));
      } else {
        kelompok.push(null);
      }
      let jumlahSent = 0;
      let jumlahGagal = 0;
      let jumlahTanpaLampiran = 0;
      let ralatPertama: string | undefined;
      for (let pusingan = 0; pusingan < kelompok.length; pusingan++) {
        const senaraiIds = kelompok[pusingan];
        const res = await fetch(`/api/classes/${classId}/certificates/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          // Tanpa ids: tiada badan bererti semua yang belum diemel ({} juga sah).
          body: JSON.stringify(senaraiIds ? { certificate_ids: senaraiIds, resend } : {}),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMsg(j.error ?? "Could not send certificate emails.");
          return;
        }
        const gagal = (j.failed ?? []) as { error?: string }[];
        jumlahSent += j.sent ?? 0;
        jumlahGagal += gagal.length;
        jumlahTanpaLampiran += j.no_attachment ?? 0;
        ralatPertama = ralatPertama ?? gagal[0]?.error;
        // Kemajuan semasa gelung kelompok; diganti oleh mesej akhir.
        setMsg(`Sending... ${jumlahSent} sent so far.`);
        // Tanpa ids: ulang selagi pelayan masih ada sasaran (more) dan ada
        // yang berjaya dihantar; maksimum 10 pusingan (pusingan < 9).
        if (senaraiIds === null && j.more === true && (j.sent ?? 0) > 0 && pusingan < 9) {
          kelompok.push(null);
        }
      }
      setMsg(
        `Emails sent: ${jumlahSent}. Failed: ${jumlahGagal}.` +
          (jumlahTanpaLampiran > 0
            ? ` ${jumlahTanpaLampiran} sent without the PDF attached (file missing or too large).`
            : "") +
          (ralatPertama ? ` ${ralatPertama}` : ""),
      );
      setPilihEmel({});
      await muatSemula();
    } finally {
      setEmelBusy(false);
    }
  };

  const [revokeSijil, setRevokeSijil] = useState<Sijil | null>(null);
  const [sebabBatalkan, setSebabBatalkan] = useState("");

  // Editor susun atur (V2-015): templat yang sedang dibuka.
  const [editor, setEditor] = useState<Templat | null>(null);
  // Rujukan bekas editor untuk tatal automatik bila editor dibuka.
  const editorRef = useRef<HTMLDivElement>(null);

  // Tatal ke editor setiap kali ia dibuka atau bertukar templat.
  useEffect(() => {
    if (editor) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [editor]);

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

  // KZ-025b: lajur jadual kelayakan (DataTable kit, gaya "Students").
  // Kotak semak kekal manual dalam lajur pertama (bukan prop `selectable`
  // kit) kerana hanya baris layak yang belum dikeluarkan boleh dipilih dan
  // kotak kepala berkeadaan indeterminate melalui kepalaTickRef seperti
  // sebelum ini. Pengendali keadaan tidak berubah.
  const lajurLayak: DataColumn<PratontonBaris>[] = [
    {
      key: "pilih",
      header: (
        <input
          ref={kepalaTickRef}
          type="checkbox"
          className="h-4 w-4 accent-brand-purple"
          title="Select all eligible participants"
          disabled={barisBolehPilih.length === 0 || issueBusy}
          checked={semuaBolehPilihTicked}
          onChange={(e) => {
            const pilih = e.target.checked;
            setTick((p) => {
              const baharu = { ...p };
              for (const r of barisBolehPilih) {
                baharu[r.participant_id] = pilih;
              }
              return baharu;
            });
          }}
        />
      ),
      render: (r) => (
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand-purple"
          disabled={!r.eligible || r.already_issued}
          checked={!!tick[r.participant_id]}
          onChange={(e) => setTick((p) => ({ ...p, [r.participant_id]: e.target.checked }))}
        />
      ),
    },
    {
      key: "nama",
      header: "Name",
      render: (r, i) => (
        <span className="flex items-center gap-3 min-w-0">
          <Avatar name={r.display_name} size="sm" index={i} />
          <span className="text-[13px] font-bold text-ink truncate">{r.display_name}</span>
        </span>
      ),
    },
    {
      key: "nama_sijil",
      header: "Certificate name",
      render: (r) =>
        /* KZ-007: nama sandaran (display name) dipapar dengan label kecil
           kelabu bila nama sijil belum disahkan. */
        r.name_confirmed ? (
          r.certificate_name
        ) : r.certificate_name ? (
          <span>
            {r.certificate_name}{" "}
            <span className="text-[12px] text-ink-faint">(display name)</span>
          </span>
        ) : (
          <span className="text-amber-600">Waiting for name confirmation</span>
        ),
    },
    {
      key: "layak",
      header: "Eligible",
      render: (r) =>
        r.eligible ? <Badge warna="green">Yes</Badge> : <Badge warna="red">No</Badge>,
    },
    {
      key: "sebab",
      header: "Reason",
      hideOnMobile: true,
      render: (r) => <span className="text-ink-faint">{r.reason}</span>,
    },
    {
      key: "dikeluarkan",
      header: "Issued",
      render: (r) =>
        r.already_issued ? <Badge warna="green">Yes</Badge> : <Badge warna="gray">No</Badge>,
    },
  ];

  // KZ-025b: lajur jadual sijil dikeluarkan (DataTable kit). Kotak semak
  // emel kekal manual: hanya baris yang boleh diemel memaparkan kotak dan
  // kotak kepala berkongsi keadaan semuaPilihEmel seperti sebelum ini.
  const lajurSijil: DataColumn<Sijil>[] = [
    {
      key: "pilih",
      /* KZ-007: pilih semua sijil yang boleh diemel. */
      header: (
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand-purple"
          title="Select all certificates that can be emailed"
          disabled={!pro}
          checked={semuaPilihEmel}
          onChange={(e) => {
            const pilih = e.target.checked;
            setPilihEmel((p) => {
              const baharu = { ...p };
              for (const s of sijil) {
                if (sijilBolehEmel(s)) baharu[s.id] = pilih;
              }
              return baharu;
            });
          }}
        />
      ),
      render: (s) =>
        sijilBolehEmel(s) ? (
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-purple"
            disabled={!pro}
            checked={!!pilihEmel[s.id]}
            onChange={(e) => setPilihEmel((p) => ({ ...p, [s.id]: e.target.checked }))}
          />
        ) : null,
    },
    {
      key: "kod",
      header: "Code",
      render: (s) => <span className="font-mono text-[13px]">{s.code}</span>,
    },
    {
      key: "nama",
      header: "Name",
      render: (s) => <span className="text-[13px] font-bold text-ink">{s.name_snapshot}</span>,
    },
    {
      key: "tarikh",
      header: "Date",
      hideOnMobile: true,
      render: (s) => (
        <span className="text-ink-faint">{new Date(s.issued_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (s) =>
        s.revoked_at ? <Badge warna="red">Revoked</Badge> : <Badge warna="green">Active</Badge>,
    },
    {
      key: "emel",
      header: "Email",
      hideOnMobile: true,
      render: (s) => (
        /* KZ-007: tarikh penghantaran emel atau Not sent. */
        <span className="text-ink-faint">
          {s.emailed_at ? new Date(s.emailed_at).toLocaleString() : "Not sent"}
        </span>
      ),
    },
    {
      key: "tindakan",
      header: "",
      className: "whitespace-nowrap",
      render: (s) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          {sijilBolehEmel(s) && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!pro || emelBusy}
              title={pro ? (s.emailed_at ? "Send the certificate email again" : "Send the certificate email") : "Available on Pro"}
              onClick={() => emelSatu(s)}
            >
              <Mail className="w-4 h-4" /> {s.emailed_at ? "Resend" : "Send"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => muatTurun(s)}>
            <Download className="w-4 h-4" /> Download
          </Button>
          {!s.revoked_at && (
            <Button
              size="sm"
              variant="ghost"
              className="text-kz-down"
              onClick={() => {
                setRevokeSijil(s);
                setSebabBatalkan("");
              }}
            >
              Revoke
            </Button>
          )}
          {revokeSijil?.id === s.id && (
            <span className="inline-flex items-center gap-2">
              <span className="block w-56">
                <Input
                  value={sebabBatalkan}
                  onChange={(e) => setSebabBatalkan(e.target.value)}
                  placeholder="Reason for revocation"
                />
              </span>
              <Button size="sm" onClick={() => batalkan(s)}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRevokeSijil(null)}>
                Cancel
              </Button>
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <Shell tabs={EDU_TABS}>
            <ClassShell classId={classId} current={"certificates" as ClassTabKey} klass={klass}>
        {msg && (
          <Alert tone="info" className="mb-4">
            {msg}
          </Alert>
        )}

        {/* Templat: satu kad kit; dialog cipta, borang blank dan senarai
            templat tinggal di dalamnya supaya aliran keadaan tidak berubah. */}
        <Card className="mb-8">
          <CardHead
            title="Certificate templates"
            right={
              <>
                <Button variant="outline" href="/educator/certificates">
                  My templates
                </Button>
                <Button
                  onClick={() => {
                    setSunting(null);
                    setTajuk("");
                    setJenis("all_members");
                    bukaDialog("gallery");
                  }}
                >
                  <Plus className="w-4 h-4" /> New certificate
                </Button>
              </>
            }
          />

        {/* Dialog cipta (V2-016a): galeri Kuizen, Templat saya, Blank. */}
        {dialogTab !== null && (
          <CardSection className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Tabs
                items={[
                  {
                    label: "Kuizen gallery",
                    aktif: dialogTab === "gallery",
                    onSelect: () => {
                      setBorangTerbuka(false);
                      setSunting(null);
                      bukaDialog("gallery");
                    },
                  },
                  {
                    label: "My templates",
                    aktif: dialogTab === "mine",
                    onSelect: () => {
                      setBorangTerbuka(false);
                      setSunting(null);
                      bukaDialog("mine");
                    },
                  },
                  {
                    label: "Blank",
                    aktif: dialogTab === "blank",
                    onSelect: () => {
                      setSunting(null);
                      setTajuk("");
                      setJenis("all_members");
                      setBorangTerbuka(true);
                      setDialogTab("blank");
                    },
                  },
                ]}
              />
              <Button
                variant="ghost"
                onClick={() => {
                  setDialogTab(null);
                  setBorangTerbuka(false);
                  setSunting(null);
                }}
              >
                Close
              </Button>
            </div>

            {dialogTab !== "blank" && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {(dialogTab === "gallery" ? pustaka.gallery : pustaka.mine).map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-[4px] border bg-white overflow-hidden flex flex-col ${
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
                          <Button
                            variant="outline"
                            href="/#harga"
                            title="Available on Pro"
                            className="w-full"
                          >
                            Pro plan required
                          </Button>
                        ) : (
                          <Button
                            className="w-full"
                            disabled={pustakaBusy}
                            onClick={() => gunaItemPustaka(item)}
                          >
                            Use in class
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {(dialogTab === "gallery" ? pustaka.gallery : pustaka.mine).length === 0 && (
                  <div className="col-span-full">
                    <EmptyState
                      icon={<Award className="h-8 w-8" />}
                      title="No templates yet"
                    />
                  </div>
                )}
              </div>
            )}
          </CardSection>
        )}

        {borangTerbuka && (
          <CardSection className="mt-6 space-y-4">
            <Field label="Title">
              <Input
                value={tajuk}
                onChange={(e) => setTajuk(e.target.value)}
                placeholder="Certificate of Completion"
              />
            </Field>
            <Field label="Criteria">
              <Select value={jenis} onChange={(e) => setJenis(e.target.value)}>
                <option value="all_members">All members</option>
                <option value="hunt_completed">Completed a specific activity</option>
                <option value="min_score">Minimum score</option>
                <option value="live_attended">Attended a live quiz</option>
              </Select>
            </Field>
            {jenis === "hunt_completed" && (
              <Select value={huntId} onChange={(e) => setHuntId(e.target.value)}>
                <option value="">Choose an activity...</option>
                {hunts.map((h) => (
                  <option key={h.id} value={h.id}>{h.title}</option>
                ))}
              </Select>
            )}
            {jenis === "live_attended" && (
              <Select value={quizId} onChange={(e) => setQuizId(e.target.value)}>
                <option value="">Choose a live quiz...</option>
                {kuiz.map((q) => (
                  <option key={q.id} value={q.id}>{q.title}</option>
                ))}
              </Select>
            )}
            {jenis === "min_score" && (
              <Input
                type="number"
                min={0}
                value={minSkor}
                onChange={(e) => setMinSkor(e.target.value)}
                placeholder="Minimum score"
              />
            )}
            <div className="flex gap-2">
              <Button onClick={simpanTemplat}>Save template</Button>
              <Button
                variant="outline"
                onClick={() => { setBorangTerbuka(false); setSunting(null); }}
              >
                Cancel
              </Button>
            </div>
          </CardSection>
        )}

        {templat.length === 0 ? (
          <EmptyState
            className="mt-2"
            icon={<Award className="h-8 w-8" />}
            title="No certificate templates yet"
            text="Create one to start issuing certificates."
          />
        ) : (
          <div className="mt-6">
            {templat.map((t) => (
              <CardSection key={t.id} baris className="first:border-t-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                <LakaranLatar classId={classId} t={t} onBuka={setEditor} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-ink truncate" title={t.title}>
                      {t.title}
                    </span>
                    {/* KZ-009: lencana kit pada templat aktif kelas. */}
                    {t.is_active && <Badge variant="solid" warna="purple">Active</Badge>}
                  </div>
                  <div className="text-[13px] text-ink-faint">
                    {t.criteria?.type === "all_members" && "All members"}
                    {t.criteria?.type === "hunt_completed" && "Completed a specific activity"}
                    {t.criteria?.type === "min_score" && `Minimum score: ${t.criteria.min_score ?? 0}`}
                    {t.criteria?.type === "live_attended" && "Attended a live quiz"}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* KZ-009: tukar templat aktif melalui RPC; tiada pada
                      templat yang sudah aktif (ia memakai lencana). */}
                  {!t.is_active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={aktifBusy === t.id}
                      title="Use this template by default when opening this page"
                      onClick={() => tetapAktif(t)}
                    >
                      Set as active
                    </Button>
                  )}
                  <label className={`${LABEL_FAIL} ${pro ? "" : "opacity-50 cursor-not-allowed"}`} title={pro ? "Upload background image" : "Available on Pro"}>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!pro}
                      onChange={(e) => muatNaikAset(t, "background", e.target.files?.[0] ?? null)}
                    />
                    Background {pro ? "" : "(Pro)"}
                  </label>
                  <label className={`${LABEL_FAIL} ${pro ? "" : "opacity-50 cursor-not-allowed"}`} title={pro ? "Upload logo" : "Available on Pro"}>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!pro}
                      onChange={(e) => muatNaikAset(t, "logo", e.target.files?.[0] ?? null)}
                    />
                    Logo {pro ? "" : "(Pro)"}
                  </label>
                  {t.background_path && (
                    <CheckRadio
                      label="Complete design"
                      title="When on, the background is a complete design: only the name, QR and code are printed over it"
                      checked={(t.layout?.mode as string) === "full_background"}
                      onChange={(e) => togolMod(t, e.target.checked)}
                    />
                  )}
                  {t.background_path && (
                    <Button size="sm" variant="ghost" onClick={() => setEditor(t)}>
                      Edit layout
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
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
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={pro ? "" : "opacity-50 cursor-not-allowed"}
                    title={pro ? "Save this template to My templates" : "Available on Pro"}
                    disabled={!pro || pustakaBusy}
                    onClick={() => simpanKePustaka(t)}
                  >
                    Save to My templates
                  </Button>
                  {salinBuka === t.id ? (
                    <span className="block w-56">
                      <Select
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
                      </Select>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Copy this template to another class you teach"
                      disabled={kelasPemanggil.filter((k) => k.id !== classId).length === 0}
                      onClick={() => setSalinBuka(salinBuka === t.id ? null : t.id)}
                    >
                      Copy to another class
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => bukaMedan(t)}>
                    Certificate details
                  </Button>
                </div>
                </div>

                {/* Panel medan isian (V2-016b) */}
                {medanBuka === t.id && (
                  <div className="mt-4 rounded-[4px] border border-kz-line bg-canvas p-6 space-y-4">
                    <div>
                      <h4 className="text-[16.8px] font-bold text-ink">Certificate details</h4>
                      <p className="text-[13px] text-ink-faint mt-1">
                        These values are printed on every certificate of this template. Empty
                        fields are never printed.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* KZ-010: medan kosong guna nama kelas pada sijil. */}
                      <Field
                        label="Course / programme"
                        note="Leave empty to use the class name."
                      >
                        <Input
                          value={borangMedan.course ?? ""}
                          maxLength={160}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, course: e.target.value }))}
                          placeholder={klass?.name ?? "Bengkel Robotik 2026"}
                        />
                      </Field>
                      <Field label="Location">
                        <Input
                          value={borangMedan.location ?? ""}
                          maxLength={120}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, location: e.target.value }))}
                          placeholder="Dewan Kuliah FKMT, UPSI"
                        />
                      </Field>
                      <Field label="Start date">
                        <Input
                          type="date"
                          value={borangMedan.date_start ?? ""}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, date_start: e.target.value || undefined }))}
                        />
                      </Field>
                      <Field label="End date (optional)">
                        <Input
                          type="date"
                          value={borangMedan.date_end ?? ""}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, date_end: e.target.value || undefined }))}
                        />
                      </Field>
                      <Field label="Signer name">
                        <Input
                          value={borangMedan.signer_name ?? ""}
                          maxLength={100}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, signer_name: e.target.value }))}
                          placeholder="Dr Hariz"
                        />
                      </Field>
                      <Field label="Signer title">
                        <Input
                          value={borangMedan.signer_title ?? ""}
                          maxLength={120}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, signer_title: e.target.value }))}
                          placeholder="Pensyarah"
                        />
                      </Field>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label
                        className={`${LABEL_FAIL} ${pro ? "" : "opacity-50 cursor-not-allowed"}`}
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
                        <span className="text-[12px] text-ink-faint">
                          {t.signature_path ? "Loading signature..." : "No signature image yet"}
                        </span>
                      )}
                      {t.signature_path && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-kz-down"
                          disabled={medanBusy}
                          onClick={() => buangTandatangan(t)}
                        >
                          Remove signature
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => simpanMedan(t)} disabled={medanBusy}>
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setMedanBuka(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardSection>
            ))}
          </div>
        )}
        </Card>

        {editor && (() => {
          // Templat segar daripada senarai supaya mode terkini digunakan
          // walaupun suis di baris templat diketik semasa editor terbuka.
          const t = templat.find((x) => x.id === editor.id) ?? editor;
          return (
            // KZ-025b: editor susun atur hanya dibingkai kad; kanvas,
            // koordinat dan fon sijil di dalam LayoutEditor tidak diubah.
            <Card padat className="mb-8 overflow-hidden">
              <div ref={editorRef}>
                <LayoutEditor
                // key: mulakan semula keadaan dalaman (susun, latar)
                // bila templat bertukar.
                key={t.id}
                classId={classId}
                templateId={t.id}
                title={t.title}
                mode={
                  (t.layout?.mode as string) === "full_background"
                    ? "full_background"
                    : "standard"
                }
                layout={t.layout}
                backgroundPath={t.background_path ?? ""}
                medan={t.fields}
                namaKelas={klass?.name}
                onClose={() => setEditor(null)}
                onSaved={async () => {
                  await muatSemula();
                }}
              />
              </div>
            </Card>
          );
        })()}

        {/* Pengeluaran */}
        <Card className="mb-8">
          <CardHead title="Issue certificates" />
          <div className="mt-6 flex items-end gap-2 flex-wrap">
            <div className="w-64">
              {/* KZ-009: jelaskan beza pilihan semasa dengan templat aktif. */}
              <Field
                label="Template"
                note="Issuing uses the selected template. The active template is selected by default."
              >
                <Select value={pilihTemplat} onChange={(e) => setPilihTemplat(e.target.value)}>
                  {templat.map((t) => (
                    // KZ-009: label templat aktif berakhir " (active)".
                    <option key={t.id} value={t.id}>{t.title}{t.is_active ? " (active)" : ""}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button onClick={bacaKelayakan} disabled={sedangHantar || !pilihTemplat}>
              <RefreshCw className="w-4 h-4" /> Check eligibility
            </Button>
            <Button variant="outline" onClick={pratontonPdf} disabled={!pilihTemplat}>
              <Eye className="w-4 h-4" /> Preview PDF
            </Button>
            <Button
              onClick={pro ? emelPukal : undefined}
              disabled={!pro}
              title={pro ? "Send certificate emails to everyone who has not received one yet" : "Available on Pro"}
            >
              <Mail className="w-4 h-4" /> Email all unsent{pro ? "" : " (Pro)"}
            </Button>
            <Button
              onClick={pro ? emelTerpilih : undefined}
              disabled={!pro || bilanganPilihEmel === 0}
              title={pro ? "Send certificate emails to the selected certificates" : "Available on Pro"}
            >
              <Mail className="w-4 h-4" /> Email selected ({bilanganPilihEmel}){pro ? "" : " (Pro)"}
            </Button>
          </div>

          {layak.length > 0 && (
            <div>
              {/* KZ-011: ringkasan kecil dan butang pilih semua di atas jadual. */}
              <div className="flex flex-wrap items-center gap-2 mt-6 mb-3">
                <span className="text-[13px] text-ink-faint">
                  {bilanganLayak} eligible, {bilanganSudahDikeluarkan} already issued, {bilanganTidakLayak} not eligible.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTick((p) => {
                      const baharu = { ...p };
                      for (const r of barisBolehPilih) baharu[r.participant_id] = true;
                      return baharu;
                    });
                  }}
                  disabled={barisBolehPilih.length === 0 || issueBusy}
                >
                  Select all eligible ({barisBolehPilih.length})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTick({})}
                  disabled={bilanganTick === 0 || issueBusy}
                >
                  Clear
                </Button>
              </div>
              <DataTable
                label="Certificate eligibility"
                rows={layak}
                rowKey={(r) => r.participant_id}
                columns={lajurLayak}
              />
              <Button
                className="mt-4"
                onClick={keluarkan}
                disabled={bilanganTick === 0 || issueBusy}
              >
                <Plus className="w-4 h-4" />
                {kemajuan
                  ? `Issuing ${kemajuan.semasa} of ${kemajuan.jumlah}...`
                  : `Issue to ${bilanganTick} participant${bilanganTick === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}
        </Card>

        {/* Sijil dikeluarkan */}
        <Card>
          <CardHead title="Issued certificates" />
          {sijil.length === 0 ? (
            <EmptyState
              className="mt-2"
              icon={<Award className="h-8 w-8" />}
              title="No certificates issued yet"
            />
          ) : (
            <div className="mt-6">
              <DataTable
                label="Issued certificates"
                rows={sijil}
                rowKey={(s) => s.id}
                columns={lajurSijil}
              />
            </div>
          )}
        </Card>
      </ClassShell>
      </Shell>
    );
}

