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
import { Award, Download, Eye, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import {
  idBolehPilih,
  idRekaBentukLama,
  idTerpilihKemasKini,
  pecahKelompok,
  tickLayak,
} from "@/lib/sijil/ui";
import { normaliseSusunAtur } from "@/lib/sijil/susunAtur";
import { normaliseMedan, type MedanSijil } from "@/lib/sijil/medan";
import type { ItemPustakaApi } from "@/lib/sijil/pustaka";
import { LOKAL, terjemahBilangan } from "@/lib/i18n";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
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

/** KZ-030: templat dianggap ada penandatangan bila fields.signer_name
 *  ialah rentetan tidak kosong; dipakai lencana "Missing signer". */
function adaSigner(t: Templat): boolean {
  return typeof t.fields?.signer_name === "string" && (t.fields.signer_name as string).trim() !== "";
}

/** Gambar kecil latar sebuah templat: muat URL bertandatangan sekali bagi
 *  setiap templat dan papar nisbah A4 landskap. Klik membuka editor.
 *  Templat tanpa background_path tidak memaparkan apa-apa. */
function LakaranLatar({
  classId,
  templat,
  onBuka,
}: {
  classId: string;
  templat: Templat;
  onBuka: (templat: Templat) => void;
}) {
  const { t } = useBahasa();
  const [url, setUrl] = useState<string | null>(null);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    if (!templat.background_path) return;
    let alive = true;
    setUrl(null);
    setGagal(false);
    (async () => {
      const res = await fetch(
        `/api/classes/${classId}/certificates/templates/${templat.id}/background-url`,
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
  }, [classId, templat.id, templat.background_path]);

  if (!templat.background_path) return null;
  return (
    <button
      type="button"
      className="shrink-0 block w-[120px]"
      title={t("certificates.classPage.editLayout")}
      onClick={() => onBuka(templat)}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={t("certificates.classPage.bgAlt", { tajuk: templat.title })}
          className="block w-[120px] rounded-lg border border-hairline"
          style={{ aspectRatio: "841.89 / 595.28" }}
          draggable={false}
        />
      ) : (
        <div
          className="flex w-[120px] items-center justify-center rounded-lg border border-hairline bg-slate-100 text-[10px] text-slate-500"
          style={{ aspectRatio: "841.89 / 595.28" }}
        >
          {gagal ? t("certificates.classPage.noPreview") : t("common.loadingDots")}
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
  const { t, bahasa } = useBahasa();

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
      setMsg(j.error ?? t("certificates.classPage.loadFailedLibrary"));
      return;
    }
    setPustaka({ gallery: j.gallery ?? [], mine: j.mine ?? [] });
  }, [t]);

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
        setMsg(j.error ?? t("certificates.list.useFailed"));
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
  const simpanKePustaka = async (tpl: Templat) => {
    if (!pro || pustakaBusy) return;
    setPustakaBusy(true);
    try {
      const res = await fetch("/api/certificate-library", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ from_template_id: tpl.id, class_id: classId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? t("certificates.classPage.saveFailed"));
        return;
      }
      setMsg(t("certificates.classPage.savedToMine", { tajuk: tpl.title }));
    } finally {
      setPustakaBusy(false);
    }
  };

  /** Salin templat kelas ini ke kelas lain yang pemanggil pendidiknya. */
  const salinKeKelasLain = async (tpl: Templat, targetClassId: string) => {
    if (!targetClassId || pustakaBusy) return;
    setPustakaBusy(true);
    try {
      const res = await fetch(
        `/api/classes/${classId}/certificates/templates/${tpl.id}/copy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ target_class_id: targetClassId }),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? t("certificates.classPage.copyFailed"));
        return;
      }
      const nama = kelasPemanggil.find((k) => k.id === targetClassId)?.name ?? t("certificates.classPage.otherClass");
      setMsg(
        j.background_removed === true
          ? t("certificates.classPage.copiedBgRemoved", { kelas: nama })
          : t("certificates.classPage.copiedTo", { kelas: nama }),
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
      setMsg(t("certificates.classPage.titleRequired"));
      return;
    }
    if (jenis === "hunt_completed" && !huntId) {
      setMsg(t("certificates.classPage.chooseActivity"));
      return;
    }
    if (jenis === "live_attended" && !quizId) {
      setMsg(t("certificates.classPage.chooseQuiz"));
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
      setMsg(j.error ?? t("certificates.classPage.saveFailed"));
      return;
    }
    setMsg(null);
    setBorangTerbuka(false);
    setSunting(null);
    setTajuk("");
    setJenis("all_members");
    await muatSemula();
  };

  const muatNaikAset = async (tpl: Templat, jenisAset: "background" | "logo", fail: File | null) => {
    if (!fail) return;
    if (!fail.type.startsWith("image/")) {
      setMsg(t("certificates.classPage.onlyImages"));
      return;
    }
    if (fail.size > MAX_ASET) {
      setMsg(t("certificates.classPage.maxAsset"));
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
    const body: Record<string, unknown> = { template_id: tpl.id };
    body[jenisAset === "background" ? "background_path" : "logo_path"] = laluan;
    const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Pencetus pelan menolak latar/logo untuk pelan free.
      setMsg(j.error ?? t("certificates.classPage.attachFailed"));
    } else {
      setMsg(null);
      // KZ-009: latar dimuat naik pada templat mod standard menghidupkan
      // "Complete design" secara automatik supaya sempadan dan tajuk
      // lalai tidak bertindih dengan latar reka bentuk lengkap; Boss
      // masih boleh nyahtanda suis selepas ini.
      if (jenisAset === "background" && (tpl.layout?.mode as string) !== "full_background") {
        const berjaya = await togolMod(tpl, true);
        if (berjaya) {
          setMsg(t("certificates.classPage.bgAdded"));
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
  const togolMod = async (tpl: Templat, penuh: boolean): Promise<boolean> => {
    const susun = { ...normaliseSusunAtur(tpl.layout), mode: penuh ? ("full_background" as const) : ("standard" as const) };
    const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ template_id: tpl.id, layout: susun }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? t("certificates.classPage.saveModeFailed"));
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
  const tetapAktif = async (tpl: Templat) => {
    if (aktifBusy) return;
    setAktifBusy(tpl.id);
    try {
      const { error } = await supabase.rpc("qm_set_active_certificate_template", {
        p_template: tpl.id,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      await muatSemula();
      setPilihTemplat(tpl.id);
      setMsg(t("certificates.classPage.nowActive", { tajuk: tpl.title }));
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
      setMsg(j.error ?? t("certificates.classPage.previewFailed"));
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
        setMsg(j.error ?? t("certificates.classPage.readEligibilityFailed"));
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
      title: t("certificates.classPage.issueTitle"),
      description: terjemahBilangan(
        bahasa,
        "certificates.classPage.issueDescOne",
        "certificates.classPage.issueDescOther",
        ids.length,
        { n: ids.length },
      ),
      confirmLabel: t("certificates.classPage.issueConfirm"),
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
          ralatKeluarkan = j.error ?? t("certificates.classPage.issueFailed");
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
        terjemahBilangan(
          bahasa,
          "certificates.classPage.issuedBeforeOne",
          "certificates.classPage.issuedBeforeOther",
          jumlahDikeluarkan,
          { n: jumlahDikeluarkan, ralat: ralatKeluarkan },
        ),
      );
    } else if (jumlahDikeluarkan === 0) {
      setMsg(t("certificates.classPage.noneIssued"));
    } else {
      setMsg(
        terjemahBilangan(
          bahasa,
          "certificates.classPage.issuedDoneOne",
          "certificates.classPage.issuedDoneOther",
          jumlahDikeluarkan,
          { n: jumlahDikeluarkan },
        ),
      );
    }
    // KZ-011: segar semula sekali sahaja selepas semua kelompok tamat
    // (termasuk apabila satu kelompok gagal), bukan selepas setiap kelompok.
    await bacaKelayakan();
    await muatSemula();
  };

  // KZ-007: pilihan kotak semak sijil untuk emel terpilih.
  const [pilihEmel, setPilihEmel] = useState<Record<string, boolean>>({});
  const [emelBusy, setEmelBusy] = useState(false);

  // KZ-029: kemas kini reka bentuk sijil (jana semula PDF dengan templat
  // aktif). Pilihan kotak semak sedia ada (pilihEmel) dipakai semula.
  const [regenBusy, setRegenBusy] = useState(false);
  const [kemajuanRegen, setKemajuanRegen] = useState<{ semasa: number; jumlah: number } | null>(null);

  // KZ-029: templat aktif kelas dan sijil yang reka bentuknya lapuk.
  const templatAktif = templat.find((t) => t.is_active) ?? null;
  const idsRekaLama = idRekaBentukLama(sijil, templatAktif?.id ?? null);
  const idsTerpilihReka = idTerpilihKemasKini(sijil, pilihEmel);

  // Sijil boleh diemel: tidak dibatalkan dan PDF sudah ada.
  const sijilBolehEmel = (s: Sijil) => !s.revoked_at && !!s.pdf_path;
  const terpilihEmel = sijil.filter((s) => sijilBolehEmel(s) && pilihEmel[s.id]);
  const bilanganPilihEmel = terpilihEmel.length;
  const semuaPilihEmel = sijil.some(sijilBolehEmel) && bilanganPilihEmel === sijil.filter(sijilBolehEmel).length;

  const emelPukal = async () => {
    const ok = await confirm({
      title: t("certificates.classPage.emailAllTitle"),
      description: t("certificates.classPage.emailAllDesc"),
      confirmLabel: t("certificates.classPage.send"),
    });
    if (!ok) return;
    await hantarEmel(null, false);
  };

  /** KZ-007: emel sijil terpilih (resend supaya yang sudah diemel boleh dihantar semula). */
  const emelTerpilih = async () => {
    if (bilanganPilihEmel === 0) return;
    const ok = await confirm({
      title: t("certificates.classPage.emailSelectedTitle"),
      description: terjemahBilangan(
        bahasa,
        "certificates.classPage.emailSelectedDescOne",
        "certificates.classPage.emailSelectedDescOther",
        bilanganPilihEmel,
        { n: bilanganPilihEmel },
      ),
      confirmLabel: t("certificates.classPage.send"),
    });
    if (!ok) return;
    await hantarEmel(terpilihEmel.map((s) => s.id), true);
  };

  /** KZ-007: emel satu sijil daripada baris jadual (Send atau Resend). */
  const emelSatu = async (s: Sijil) => {
    const ok = await confirm({
      title: s.emailed_at ? t("certificates.classPage.resendEmailTitle") : t("certificates.classPage.sendEmailTitle"),
      description: t("certificates.classPage.emailOneDesc", { nama: s.name_snapshot }),
      confirmLabel: t("certificates.classPage.send"),
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
          setMsg(j.error ?? t("certificates.classPage.emailFailed"));
          return;
        }
        const gagal = (j.failed ?? []) as { error?: string }[];
        jumlahSent += j.sent ?? 0;
        jumlahGagal += gagal.length;
        jumlahTanpaLampiran += j.no_attachment ?? 0;
        ralatPertama = ralatPertama ?? gagal[0]?.error;
        // Kemajuan semasa gelung kelompok; diganti oleh mesej akhir.
        setMsg(t("certificates.classPage.sending", { n: jumlahSent }));
        // Tanpa ids: ulang selagi pelayan masih ada sasaran (more) dan ada
        // yang berjaya dihantar; maksimum 10 pusingan (pusingan < 9).
        if (senaraiIds === null && j.more === true && (j.sent ?? 0) > 0 && pusingan < 9) {
          kelompok.push(null);
        }
      }
      setMsg(
        t("certificates.classPage.emailsSent", { hantar: jumlahSent, gagal: jumlahGagal }) +
          (jumlahTanpaLampiran > 0
            ? ` ${t("certificates.classPage.emailsNoPdf", { n: jumlahTanpaLampiran })}`
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

  /**
   * KZ-029: kemas kini reka bentuk sijil terpilih (atau semua yang lapuk):
   * jana semula PDF dengan templat aktif melalui laluan regenerate,
   * berkelompok 10 berurutan. Kod, nama, tarikh dan status emel kekal;
   * pendidik menekan Resend selepas itu untuk menghantar PDF baharu.
   */
  const kemasKiniReka = async (ids: string[]) => {
    if (!templatAktif || ids.length === 0 || regenBusy) return;
    const ok = await confirm({
      title: t("certificates.classPage.updateDesignTitle"),
      description: terjemahBilangan(
        bahasa,
        "certificates.classPage.updateDesignDescOne",
        "certificates.classPage.updateDesignDescOther",
        ids.length,
        { n: ids.length, templat: templatAktif.title },
      ),
      confirmLabel: t("certificates.classPage.updateDesignConfirm"),
    });
    if (!ok) return;
    setRegenBusy(true);
    setKemajuanRegen({ semasa: 0, jumlah: ids.length });
    let jumlahDikemas = 0;
    let jumlahLangkau = 0;
    let ralatRegen: string | null = null;
    try {
      const kelompok = pecahKelompok(ids, 10);
      for (let i = 0; i < kelompok.length; i++) {
        setKemajuanRegen({ semasa: Math.min((i + 1) * 10, ids.length), jumlah: ids.length });
        const res = await api(`/api/classes/${classId}/certificates/regenerate`, {
          certificate_ids: kelompok[i],
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          ralatRegen = j.error ?? t("certificates.classPage.updateFailed");
          break;
        }
        jumlahDikemas += j.updated ?? 0;
        jumlahLangkau += j.skipped ?? 0;
      }
    } finally {
      setRegenBusy(false);
      setKemajuanRegen(null);
    }
    if (ralatRegen) {
      setMsg(
        terjemahBilangan(
          bahasa,
          "certificates.classPage.updatedBeforeOne",
          "certificates.classPage.updatedBeforeOther",
          jumlahDikemas,
          { n: jumlahDikemas, ralat: ralatRegen },
        ),
      );
    } else {
      setMsg(t("certificates.classPage.updatedDone", { kemas: jumlahDikemas, langkau: jumlahLangkau }));
    }
    setPilihEmel({});
    await muatSemula();
  };

  /**
   * KZ-029: padam templat sijil melalui RPC qm_delete_certificate_template
   * terus dengan klien Supabase (sesi pengguna). Mesej ralat RPC dipapar
   * apa adanya. Selepas berjaya: jika templat itu dipilih di bahagian
   * Issue, pilih templat aktif.
   */
  const [padamBusy, setPadamBusy] = useState<string | null>(null);
  const padamTemplat = async (tpl: Templat) => {
    if (padamBusy) return;
    const ok = await confirm({
      title: t("certificates.list.deleteTitle"),
      description: t("certificates.classPage.deleteDesc", { tajuk: tpl.title }),
      confirmLabel: t("certificates.list.deleteConfirm"),
      tone: "danger",
    });
    if (!ok) return;
    setPadamBusy(tpl.id);
    try {
      const { error } = await supabase.rpc("qm_delete_certificate_template", {
        p_template: tpl.id,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      setMsg(null);
      const senarai = await muatSemula();
      if (pilihTemplat === tpl.id) {
        const aktif = senarai.find((x) => x.is_active) ?? senarai[0] ?? null;
        setPilihTemplat(aktif ? aktif.id : "");
      }
    } finally {
      setPadamBusy(null);
    }
  };

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
  const bukaMedan = async (tpl: Templat) => {
    if (medanBuka === tpl.id) {
      setMedanBuka(null);
      return;
    }
    setBorangMedan(normaliseMedan(tpl.fields));
    setMedanBuka(tpl.id);
    setMsg(null);
    // Pratonton imej tandatangan melalui URL bertandatangan pelayan.
    if (tpl.signature_path) {
      const res = await fetch(
        `/api/classes/${classId}/certificates/templates/${tpl.id}/signature-url`,
        { headers: await authHeader() },
      );
      const j = await res.json().catch(() => ({}));
      if (res.ok && typeof j.url === "string") {
        setSigUrl((p) => ({ ...p, [tpl.id]: j.url }));
      } else {
        setSigUrl((p) => ({ ...p, [tpl.id]: "" }));
      }
    } else {
      setSigUrl((p) => ({ ...p, [tpl.id]: "" }));
    }
  };

  /** Simpan medan isian templat melalui PATCH templates (semantik ganti). */
  const simpanMedan = async (tpl: Templat) => {
    if (medanBusy) return;
    // Tarikh tamat mesti sama hari atau lebih lewat daripada tarikh mula.
    if (
      borangMedan.date_start && borangMedan.date_end
      && borangMedan.date_end < borangMedan.date_start
    ) {
      setMsg(t("certificates.classPage.dateOrder"));
      return;
    }
    setMedanBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ template_id: tpl.id, fields: borangMedan }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? t("certificates.classPage.saveDetailsFailed"));
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
  const muatNaikTandatangan = async (tpl: Templat, fail: File | null) => {
    if (!fail || medanBusy) return;
    if (fail.type !== "image/png" && fail.type !== "image/jpeg") {
      setMsg(t("certificates.classPage.sigFormat"));
      return;
    }
    if (fail.size > MAX_SIG) {
      setMsg(t("certificates.classPage.sigMax"));
      return;
    }
    setMedanBusy(true);
    try {
      const tiketRes = await fetch(
        `/api/classes/${classId}/certificates/templates/${tpl.id}/asset-ticket`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ kind: "signature", mimeType: fail.type, size: fail.size }),
        },
      );
      const tiket = await tiketRes.json().catch(() => ({}));
      if (!tiketRes.ok || typeof tiket.upload_url !== "string") {
        setMsg(tiket.error ?? t("certificates.classPage.sigStartFailed"));
        return;
      }
      const put = await fetch(tiket.upload_url, {
        method: "PUT",
        headers: { "Content-Type": fail.type },
        body: fail,
      });
      if (!put.ok) {
        setMsg(t("certificates.classPage.sigUploadFailed"));
        return;
      }
      const finRes = await fetch(
        `/api/classes/${classId}/certificates/templates/${tpl.id}/asset-finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ kind: "signature", path: tiket.path }),
        },
      );
      const fin = await finRes.json().catch(() => ({}));
      if (!finRes.ok) {
        setMsg(fin.error ?? t("certificates.classPage.sigAttachFailed"));
        return;
      }
      setMsg(null);
      await muatSemula();
    } finally {
      setMedanBusy(false);
    }
  };

  /** Buang imej tandatangan templat (PATCH clear_signature). */
  const buangTandatangan = async (tpl: Templat) => {
    if (medanBusy) return;
    setMedanBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/certificates/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ template_id: tpl.id, clear_signature: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? t("certificates.classPage.sigRemoveFailed"));
        return;
      }
      setMsg(null);
      setSigUrl((p) => ({ ...p, [tpl.id]: "" }));
      await muatSemula();
    } finally {
      setMedanBusy(false);
    }
  };

  const batalkan = async (s: Sijil) => {
    const ok = await confirm({
      title: t("certificates.classPage.revokeTitle"),
      description: t("certificates.classPage.revokeDesc", { nama: s.name_snapshot }),
      confirmLabel: t("certificates.classPage.revokeConfirm"),
      tone: "danger",
    });
    if (!ok) return;
    if (!sebabBatalkan.trim()) {
      setMsg(t("certificates.classPage.revokeReasonRequired"));
      return;
    }
    const res = await fetch(`/api/certificates/${s.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ reason: sebabBatalkan.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error ?? t("certificates.classPage.revokeFailed"));
      return;
    }
    setRevokeSijil(null);
    setSebabBatalkan("");
    await muatSemula();
  };

  const muatTurun = async (s: Sijil) => {
    const res = await fetch(`/api/certificates/${s.id}/download`, { headers: await authHeader() });
    if (!res.ok) {
      setMsg(t("certificates.classPage.downloadNotReady"));
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
        <div className="p-8 text-slate-500">{t("common.loadingDots")}</div>
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
          title={t("certificates.classPage.selectAllEligibleTitle")}
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
      header: t("certificates.classPage.colName"),
      render: (r, i) => (
        <span className="flex items-center gap-3 min-w-0">
          <Avatar name={r.display_name} size="sm" index={i} />
          <span className="text-[13px] font-bold text-ink truncate">{r.display_name}</span>
        </span>
      ),
    },
    {
      key: "nama_sijil",
      header: t("certificates.classPage.colCertName"),
      render: (r) =>
        /* KZ-007: nama sandaran (display name) dipapar dengan label kecil
           kelabu bila nama sijil belum disahkan. */
        r.name_confirmed ? (
          r.certificate_name
        ) : r.certificate_name ? (
          <span>
            {r.certificate_name}{" "}
            <span className="text-[12px] text-ink-faint">{t("certificates.classPage.displayNameLabel")}</span>
          </span>
        ) : (
          <span className="text-amber-600">{t("certificates.classPage.waitingName")}</span>
        ),
    },
    {
      key: "layak",
      header: t("certificates.classPage.colEligible"),
      render: (r) =>
        r.eligible ? <Badge warna="green">{t("certificates.classPage.yes")}</Badge> : <Badge warna="red">{t("certificates.classPage.no")}</Badge>,
    },
    {
      key: "sebab",
      header: t("certificates.classPage.colReason"),
      hideOnMobile: true,
      render: (r) => <span className="text-ink-faint">{r.reason}</span>,
    },
    {
      key: "dikeluarkan",
      header: t("certificates.classPage.colIssued"),
      render: (r) =>
        r.already_issued ? <Badge warna="green">{t("certificates.classPage.yes")}</Badge> : <Badge warna="gray">{t("certificates.classPage.no")}</Badge>,
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
          title={t("certificates.classPage.selectAllEmailableTitle")}
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
      header: t("certificates.classPage.colCode"),
      render: (s) => <span className="font-mono text-[13px]">{s.code}</span>,
    },
    {
      key: "nama",
      header: t("certificates.classPage.colName"),
      render: (s) => <span className="text-[13px] font-bold text-ink">{s.name_snapshot}</span>,
    },
    {
      key: "tarikh",
      header: t("certificates.classPage.colDate"),
      hideOnMobile: true,
      render: (s) => (
        <span className="text-ink-faint">{new Date(s.issued_at).toLocaleDateString(LOKAL[bahasa])}</span>
      ),
    },
    {
      /* KZ-029: tajuk templat sijil dan lencana Old design bila templatnya
         bukan templat aktif kelas. */
      key: "templat",
      header: t("certificates.classPage.templateLabel"),
      hideOnMobile: true,
      render: (s) => (
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-ink truncate max-w-[180px]">
            {templat.find((x) => x.id === s.template_id)?.title ?? t("certificates.classPage.unknownTemplate")}
          </span>
          {!s.revoked_at && templatAktif && s.template_id !== templatAktif.id && (
            <Badge warna="yellow">{t("certificates.classPage.oldDesign")}</Badge>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: t("certificates.classPage.colStatus"),
      render: (s) =>
        s.revoked_at ? <Badge warna="red">{t("certificates.classPage.revoked")}</Badge> : <Badge warna="green">{t("certificates.classPage.active")}</Badge>,
    },
    {
      key: "emel",
      header: t("certificates.classPage.colEmail"),
      hideOnMobile: true,
      render: (s) => (
        /* KZ-007: tarikh penghantaran emel atau Not sent. */
        <span className="text-ink-faint">
          {s.emailed_at ? new Date(s.emailed_at).toLocaleString(LOKAL[bahasa]) : t("certificates.classPage.notSent")}
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
              title={pro ? (s.emailed_at ? t("certificates.classPage.resendTitle") : t("certificates.classPage.sendTitle")) : t("certificates.classPage.proOnly")}
              onClick={() => emelSatu(s)}
            >
              <Mail className="w-4 h-4" /> {s.emailed_at ? t("certificates.classPage.resend") : t("certificates.classPage.send")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => muatTurun(s)}>
            <Download className="w-4 h-4" /> {t("common.download")}
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
              {t("certificates.classPage.revokeConfirm")}
            </Button>
          )}
          {revokeSijil?.id === s.id && (
            <span className="inline-flex items-center gap-2">
              <span className="block w-56">
                <Input
                  value={sebabBatalkan}
                  onChange={(e) => setSebabBatalkan(e.target.value)}
                  placeholder={t("certificates.classPage.revokeReasonPlaceholder")}
                />
              </span>
              <Button size="sm" onClick={() => batalkan(s)}>
                {t("common.confirm")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRevokeSijil(null)}>
                {t("common.cancel")}
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
            title={t("certificates.classPage.templatesTitle")}
            right={
              <>
                <Button variant="outline" href="/educator/certificates">
                  {t("certificates.classPage.myTemplates")}
                </Button>
                <Button
                  onClick={() => {
                    setSunting(null);
                    setTajuk("");
                    setJenis("all_members");
                    bukaDialog("gallery");
                  }}
                >
                  <Plus className="w-4 h-4" /> {t("certificates.classPage.newCert")}
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
                    label: t("certificates.classPage.galleryTab"),
                    aktif: dialogTab === "gallery",
                    onSelect: () => {
                      setBorangTerbuka(false);
                      setSunting(null);
                      bukaDialog("gallery");
                    },
                  },
                  {
                    label: t("certificates.classPage.myTemplates"),
                    aktif: dialogTab === "mine",
                    onSelect: () => {
                      setBorangTerbuka(false);
                      setSunting(null);
                      bukaDialog("mine");
                    },
                  },
                  {
                    label: t("certificates.classPage.blankTab"),
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
                {t("common.close")}
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
                          {t("certificates.list.textOnly")}
                        </div>
                      )}
                      {item.locked && (
                        <Link
                          href="/#harga"
                          title={t("certificates.classPage.proOnly")}
                          className="absolute top-2 right-2 rounded-md bg-amber-400 text-black text-[10px] font-bold px-2 py-0.5"
                        >
                          {t("certificates.classPage.proBadge")}
                        </Link>
                      )}
                    </div>
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div className="text-sm font-semibold truncate" title={item.title}>
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.text_tone === "light" ? t("certificates.list.lightText") : t("certificates.list.darkText")}
                        {item.kind === "participation"
                          ? t("certificates.classPage.participationKind")
                          : item.kind === "achievement"
                            ? t("certificates.classPage.achievementKind")
                            : ""}
                      </div>
                      <div className="mt-auto">
                        {item.locked ? (
                          <Button
                            variant="outline"
                            href="/#harga"
                            title={t("certificates.classPage.proOnly")}
                            className="w-full"
                          >
                            {t("certificates.classPage.proPlanRequired")}
                          </Button>
                        ) : (
                          <Button
                            className="w-full"
                            disabled={pustakaBusy}
                            onClick={() => gunaItemPustaka(item)}
                          >
                            {t("certificates.list.useInClass")}
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
                      title={t("certificates.classPage.noTemplates")}
                    />
                  </div>
                )}
              </div>
            )}
          </CardSection>
        )}

        {borangTerbuka && (
          <CardSection className="mt-6 space-y-4">
            <Field label={t("certificates.classPage.titleLabel")}>
              <Input
                value={tajuk}
                onChange={(e) => setTajuk(e.target.value)}
                placeholder={t("certificates.classPage.titlePlaceholder")}
              />
            </Field>
            <Field label={t("certificates.classPage.criteria")}>
              <Select value={jenis} onChange={(e) => setJenis(e.target.value)}>
                <option value="all_members">{t("certificates.classPage.optAll")}</option>
                <option value="hunt_completed">{t("certificates.classPage.optHunt")}</option>
                <option value="min_score">{t("certificates.classPage.optMinScore")}</option>
                <option value="live_attended">{t("certificates.classPage.optLive")}</option>
              </Select>
            </Field>
            {jenis === "hunt_completed" && (
              <Select value={huntId} onChange={(e) => setHuntId(e.target.value)}>
                <option value="">{t("certificates.classPage.chooseActivityOption")}</option>
                {hunts.map((h) => (
                  <option key={h.id} value={h.id}>{h.title}</option>
                ))}
              </Select>
            )}
            {jenis === "live_attended" && (
              <Select value={quizId} onChange={(e) => setQuizId(e.target.value)}>
                <option value="">{t("certificates.classPage.chooseQuizOption")}</option>
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
                placeholder={t("certificates.classPage.optMinScore")}
              />
            )}
            <div className="flex gap-2">
              <Button onClick={simpanTemplat}>{t("certificates.classPage.saveTemplate")}</Button>
              <Button
                variant="outline"
                onClick={() => { setBorangTerbuka(false); setSunting(null); }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </CardSection>
        )}

        {templat.length === 0 ? (
          <EmptyState
            className="mt-2"
            icon={<Award className="h-8 w-8" />}
            title={t("certificates.classPage.noTemplatesYet")}
            text={t("certificates.classPage.createToStart")}
          />
        ) : (
          <div className="mt-6">
            {templat.map((tpl) => (
              <CardSection key={tpl.id} baris className="first:border-t-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                <LakaranLatar classId={classId} templat={tpl} onBuka={setEditor} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-ink truncate" title={tpl.title}>
                      {tpl.title}
                    </span>
                    {/* KZ-009: lencana kit pada templat aktif kelas. */}
                    {tpl.is_active && <Badge variant="solid" warna="purple">{t("certificates.classPage.active")}</Badge>}
                    {/* KZ-030: petunjuk butiran kurang (bukan penghalang). */}
                    {!adaSigner(tpl) && <Badge warna="yellow">{t("certificates.classPage.missingSigner")}</Badge>}
                    {!tpl.signature_path && <Badge warna="yellow">{t("certificates.classPage.noSignature")}</Badge>}
                  </div>
                  <div className="text-[13px] text-ink-faint">
                    {tpl.criteria?.type === "all_members" && t("certificates.classPage.optAll")}
                    {tpl.criteria?.type === "hunt_completed" && t("certificates.classPage.optHunt")}
                    {tpl.criteria?.type === "min_score" && t("certificates.classPage.minScoreValue", { n: tpl.criteria.min_score ?? 0 })}
                    {tpl.criteria?.type === "live_attended" && t("certificates.classPage.optLive")}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* KZ-009: tukar templat aktif melalui RPC; tiada pada
                      templat yang sudah aktif (ia memakai lencana). */}
                  {!tpl.is_active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={aktifBusy === tpl.id}
                      title={t("certificates.classPage.setActiveTitle")}
                      onClick={() => tetapAktif(tpl)}
                    >
                      {t("certificates.classPage.setActive")}
                    </Button>
                  )}
                  <label className={`${LABEL_FAIL} ${pro ? "" : "opacity-50 cursor-not-allowed"}`} title={pro ? t("certificates.classPage.uploadBgTitle") : t("certificates.classPage.proOnly")}>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!pro}
                      onChange={(e) => muatNaikAset(tpl, "background", e.target.files?.[0] ?? null)}
                    />
                    {t("certificates.classPage.background")}{pro ? "" : t("certificates.classPage.proSuffix")}
                  </label>
                  <label className={`${LABEL_FAIL} ${pro ? "" : "opacity-50 cursor-not-allowed"}`} title={pro ? t("certificates.classPage.uploadLogoTitle") : t("certificates.classPage.proOnly")}>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!pro}
                      onChange={(e) => muatNaikAset(tpl, "logo", e.target.files?.[0] ?? null)}
                    />
                    {t("certificates.classPage.logo")}{pro ? "" : t("certificates.classPage.proSuffix")}
                  </label>
                  {tpl.background_path && (
                    <CheckRadio
                      label={t("certificates.classPage.completeDesign")}
                      title={t("certificates.classPage.completeDesignTitle")}
                      checked={(tpl.layout?.mode as string) === "full_background"}
                      onChange={(e) => togolMod(tpl, e.target.checked)}
                    />
                  )}
                  {tpl.background_path && (
                    <Button size="sm" variant="ghost" onClick={() => setEditor(tpl)}>
                      {t("certificates.classPage.editLayout")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSunting(tpl.id);
                      setTajuk(tpl.title);
                      setJenis(tpl.criteria?.type ?? "all_members");
                      setHuntId(tpl.criteria?.hunt_id ?? "");
                      setQuizId(tpl.criteria?.quiz_id ?? "");
                      setMinSkor(String(tpl.criteria?.min_score ?? 0));
                      setBorangTerbuka(true);
                    }}
                  >
                    {t("certificates.classPage.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={pro ? "" : "opacity-50 cursor-not-allowed"}
                    title={pro ? t("certificates.classPage.saveToMineTitle") : t("certificates.classPage.proOnly")}
                    disabled={!pro || pustakaBusy}
                    onClick={() => simpanKePustaka(tpl)}
                  >
                    {t("certificates.classPage.saveToMine")}
                  </Button>
                  {salinBuka === tpl.id ? (
                    <span className="block w-56">
                      <Select
                        value=""
                        disabled={pustakaBusy}
                        onChange={(e) => {
                          if (e.target.value) salinKeKelasLain(tpl, e.target.value);
                        }}
                      >
                        <option value="">{t("certificates.list.chooseClass")}</option>
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
                      title={t("certificates.classPage.copyTitle")}
                      disabled={kelasPemanggil.filter((k) => k.id !== classId).length === 0}
                      onClick={() => setSalinBuka(salinBuka === tpl.id ? null : tpl.id)}
                    >
                      {t("certificates.classPage.copyToClass")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => bukaMedan(tpl)}>
                    {t("certificates.classPage.details")}
                  </Button>
                  {/* KZ-029: padam templat; merah lembut, hujung baris tindakan. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-kz-down"
                    disabled={padamBusy === tpl.id}
                    title={t("certificates.classPage.deleteThisTitle")}
                    onClick={() => padamTemplat(tpl)}
                  >
                    <Trash2 className="w-4 h-4" /> {t("certificates.list.deleteLabel")}
                  </Button>
                </div>
                </div>

                {/* Panel medan isian (V2-016b) */}
                {medanBuka === tpl.id && (
                  <div className="mt-4 rounded-[4px] border border-kz-line bg-canvas p-6 space-y-4">
                    <div>
                      <h4 className="text-[16.8px] font-bold text-ink">{t("certificates.classPage.details")}</h4>
                      <p className="text-[13px] text-ink-faint mt-1">
                        {t("certificates.classPage.detailsNote")}
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* KZ-010: medan kosong guna nama kelas pada sijil. */}
                      <Field
                        label={t("certificates.classPage.course")}
                        note={t("certificates.classPage.courseNote")}
                      >
                        <Input
                          value={borangMedan.course ?? ""}
                          maxLength={160}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, course: e.target.value }))}
                          placeholder={klass?.name ?? t("certificates.classPage.coursePlaceholder")}
                        />
                      </Field>
                      <Field label={t("certificates.classPage.location")}>
                        <Input
                          value={borangMedan.location ?? ""}
                          maxLength={120}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, location: e.target.value }))}
                          placeholder={t("certificates.classPage.locationPlaceholder")}
                        />
                      </Field>
                      <Field label={t("certificates.classPage.startDate")}>
                        <Input
                          type="date"
                          value={borangMedan.date_start ?? ""}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, date_start: e.target.value || undefined }))}
                        />
                      </Field>
                      <Field label={t("certificates.classPage.endDate")}>
                        <Input
                          type="date"
                          value={borangMedan.date_end ?? ""}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, date_end: e.target.value || undefined }))}
                        />
                      </Field>
                      <Field label={t("certificates.classPage.signerName")}>
                        <Input
                          value={borangMedan.signer_name ?? ""}
                          maxLength={100}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, signer_name: e.target.value }))}
                          placeholder="Dr Hariz"
                        />
                      </Field>
                      <Field label={t("certificates.classPage.signerTitle")}>
                        <Input
                          value={borangMedan.signer_title ?? ""}
                          maxLength={120}
                          onChange={(e) => setBorangMedan((p) => ({ ...p, signer_title: e.target.value }))}
                          placeholder={t("certificates.classPage.signerTitlePlaceholder")}
                        />
                      </Field>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label
                        className={`${LABEL_FAIL} ${pro ? "" : "opacity-50 cursor-not-allowed"}`}
                        title={pro ? t("certificates.classPage.uploadSigTitle") : t("certificates.classPage.proOnly")}
                      >
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          disabled={!pro || medanBusy}
                          onChange={(e) => muatNaikTandatangan(tpl, e.target.files?.[0] ?? null)}
                        />
                        {t("certificates.classPage.uploadSig")} {pro ? "" : t("certificates.classPage.proSuffix")}
                      </label>
                      {sigUrl[tpl.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sigUrl[tpl.id]}
                          alt={t("certificates.classPage.sigAlt")}
                          className="h-10 rounded border border-hairline bg-white px-1"
                        />
                      ) : (
                        <span className="text-[12px] text-ink-faint">
                          {tpl.signature_path ? t("certificates.classPage.loadingSig") : t("certificates.classPage.noSig")}
                        </span>
                      )}
                      {tpl.signature_path && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-kz-down"
                          disabled={medanBusy}
                          onClick={() => buangTandatangan(tpl)}
                        >
                          {t("certificates.classPage.removeSig")}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => simpanMedan(tpl)} disabled={medanBusy}>
                        {t("certificates.list.save")}
                      </Button>
                      <Button variant="outline" onClick={() => setMedanBuka(null)}>
                        {t("common.cancel")}
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
          const tpl = templat.find((x) => x.id === editor.id) ?? editor;
          return (
            // KZ-025b: editor susun atur hanya dibingkai kad; kanvas,
            // koordinat dan fon sijil di dalam LayoutEditor tidak diubah.
            <Card padat className="mb-8 overflow-hidden">
              <div ref={editorRef}>
                <LayoutEditor
                // key: mulakan semula keadaan dalaman (susun, latar)
                // bila templat bertukar.
                key={tpl.id}
                classId={classId}
                templateId={tpl.id}
                title={tpl.title}
                mode={
                  (tpl.layout?.mode as string) === "full_background"
                    ? "full_background"
                    : "standard"
                }
                layout={tpl.layout}
                backgroundPath={tpl.background_path ?? ""}
                medan={tpl.fields}
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
          <CardHead title={t("certificates.classPage.issueTitle")} />
          <div className="mt-6 flex items-end gap-2 flex-wrap">
            <div className="w-64">
              {/* KZ-009: jelaskan beza pilihan semasa dengan templat aktif. */}
              <Field
                label={t("certificates.classPage.templateLabel")}
                note={t("certificates.classPage.templateNote")}
              >
                <Select value={pilihTemplat} onChange={(e) => setPilihTemplat(e.target.value)}>
                  {templat.map((tpl) => (
                    // KZ-009: label templat aktif berakhir " (aktif)".
                    <option key={tpl.id} value={tpl.id}>{tpl.title}{tpl.is_active ? t("certificates.classPage.activeSuffix") : ""}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button onClick={bacaKelayakan} disabled={sedangHantar || !pilihTemplat}>
              <RefreshCw className="w-4 h-4" /> {t("certificates.classPage.checkEligibility")}
            </Button>
            <Button variant="outline" onClick={pratontonPdf} disabled={!pilihTemplat}>
              <Eye className="w-4 h-4" /> {t("certificates.classPage.previewPdf")}
            </Button>
            <Button
              onClick={pro ? emelPukal : undefined}
              disabled={!pro}
              title={pro ? t("certificates.classPage.emailAllUnsentTitle") : t("certificates.classPage.proOnly")}
            >
              <Mail className="w-4 h-4" /> {t("certificates.classPage.emailAllUnsent")}{pro ? "" : t("certificates.classPage.proSuffix")}
            </Button>
            <Button
              onClick={pro ? emelTerpilih : undefined}
              disabled={!pro || bilanganPilihEmel === 0}
              title={pro ? t("certificates.classPage.emailSelectedTitle2") : t("certificates.classPage.proOnly")}
            >
              <Mail className="w-4 h-4" /> {t("certificates.classPage.emailSelected", { n: bilanganPilihEmel })}{pro ? "" : t("certificates.classPage.proSuffix")}
            </Button>
          </div>

          {layak.length > 0 && (
            <div>
              {/* KZ-011: ringkasan kecil dan butang pilih semua di atas jadual. */}
              <div className="flex flex-wrap items-center gap-2 mt-6 mb-3">
                <span className="text-[13px] text-ink-faint">
                  {t("certificates.classPage.eligibilitySummary", { layak: bilanganLayak, dikeluarkan: bilanganSudahDikeluarkan, tidak: bilanganTidakLayak })}
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
                  {t("certificates.classPage.selectAllEligibleBtn", { n: barisBolehPilih.length })}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTick({})}
                  disabled={bilanganTick === 0 || issueBusy}
                >
                  {t("certificates.classPage.clear")}
                </Button>
              </div>
              <DataTable
                label={t("certificates.classPage.eligibilityTable")}
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
                  ? t("certificates.classPage.issuing", { semasa: kemajuan.semasa, jumlah: kemajuan.jumlah })
                  : terjemahBilangan(
                      bahasa,
                      "certificates.classPage.issueToOne",
                      "certificates.classPage.issueToOther",
                      bilanganTick,
                      { n: bilanganTick },
                    )}
              </Button>
            </div>
          )}
        </Card>

        {/* Sijil dikeluarkan */}
        <Card>
          <CardHead
            title={t("certificates.classPage.issuedTitle")}
            right={
              <div className="flex items-center gap-2 flex-wrap">
                {/* KZ-029: kemas kini reka bentuk sijil terpilih dengan
                    templat aktif; pilihan kotak semak sedia ada dipakai. */}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!templatAktif || idsTerpilihReka.length === 0 || regenBusy || emelBusy}
                  title={
                    templatAktif
                      ? t("certificates.classPage.regenSelectedTitle")
                      : t("certificates.classPage.noActive")
                  }
                  onClick={() => kemasKiniReka(idsTerpilihReka)}
                >
                  <RefreshCw className="w-4 h-4" />
                  {kemajuanRegen
                    ? t("certificates.classPage.updating", { semasa: kemajuanRegen.semasa, jumlah: kemajuanRegen.jumlah })
                    : t("certificates.classPage.updateDesignSelected", { n: idsTerpilihReka.length })}
                </Button>
                {/* KZ-029: semua sijil tidak dibatalkan yang reka bentuknya
                    bukan templat aktif. */}
                <Button
                  size="sm"
                  disabled={!templatAktif || idsRekaLama.length === 0 || regenBusy || emelBusy}
                  title={
                    templatAktif
                      ? t("certificates.classPage.regenAllTitle")
                      : t("certificates.classPage.noActive")
                  }
                  onClick={() => kemasKiniReka(idsRekaLama)}
                >
                  <RefreshCw className="w-4 h-4" />
                  {kemajuanRegen
                    ? t("certificates.classPage.updating", { semasa: kemajuanRegen.semasa, jumlah: kemajuanRegen.jumlah })
                    : t("certificates.classPage.updateAllDesign", { n: idsRekaLama.length })}
                </Button>
              </div>
            }
          />
          {sijil.length === 0 ? (
            <EmptyState
              className="mt-2"
              icon={<Award className="h-8 w-8" />}
              title={t("certificates.classPage.noIssued")}
            />
          ) : (
            <div className="mt-6">
              <DataTable
                label={t("certificates.classPage.issuedTitle")}
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

