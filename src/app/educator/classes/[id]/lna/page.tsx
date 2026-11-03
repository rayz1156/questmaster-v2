"use client";
/**
 * /educator/classes/[id]/lna: persediaan, pusingan dan laporan Learning
 * Needs Analysis (KZ-035).
 *
 * Guru menyediakan senarai item 3 hingga 15 melalui tiga cara (Outcomes
 * sedia ada, taip pantas mencipta Outcomes baharu, salin dari kelas
 * lain miliknya), membuka pusingan PRA dan PASCA (pautan + QR ke
 * /lna/<roundId>), menutup pusingan (snapshot penguasaan disimpan oleh
 * API) dan membaca laporan keutamaan (MWDS, RDS, kuadran IPA, bendera
 * keyakinan lawan penguasaan, delta pra/pasca).
 *
 * KZ-038: item bebas tanpa Outcome. Mod "Taip baharu" memilih sama ada
 * baris menjadi Outcome kelas atau item LNA sahaja; mod "Outcomes
 * sedia ada" menerima item tambahan bukan Outcome. Laporan menandakan
 * item bebas dan tidak mengira penguasaan, bendera serta delta
 * penguasaan bagi item tersebut.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ClipboardList, Copy, Plus, QrCode, Sparkles, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { supabase } from "@/lib/supabase";
import { listMyEducatorClasses } from "@/lib/data";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import type { LaporanLna, PerbandinganLna } from "@/lib/lna";
import { LOKAL } from "@/lib/i18n";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";

interface RoundUi {
  id: string;
  kind: string;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  responden: number;
}

interface LnaUi {
  id: string;
  title: string;
  createdAt: string;
  rounds: RoundUi[];
}

interface OutcomeUi {
  id: string;
  code: string | null;
  label: string;
}

interface KelasUi {
  id: string;
  name: string;
}

interface LaporanPenuh {
  lna: { id: string; title: string };
  rounds: { id: string; kind: string; status: string; jawapan: number }[];
  pra: LaporanLna | null;
  pasca: LaporanLna | null;
  perbandingan: PerbandinganLna | null;
  pelajar: { userId: string; nama: string }[];
}

async function pengepalaBearer(): Promise<Record<string, string>> {
  const ses = await supabase.auth.getSession();
  return ses.data.session
    ? { Authorization: `Bearer ${ses.data.session.access_token}` }
    : {};
}

async function baca(url: string, init?: RequestInit): Promise<Response> {
  const pengepala = await pengepalaBearer();
  return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), ...pengepala } });
}

/** Amaran lembut: label yang kelihatan mengandungi dua kemahiran. */
function adaDan(label: string): boolean {
  const r = label.toLowerCase();
  return r.includes(" dan ") || r.includes(" and ");
}

export default function HalamanLnaKelas() {
  const params = useParams<{ id: string }>();
  const id = String(params.id || "");
  const confirm = useConfirm();
  const { t, bahasa } = useBahasa();

  // Label kuadran IPA dan bendera keyakinan (dwibahasa; kekunci enjin kekal).
  const labelKuadran: Record<string, string> = {
    fokus: t("lnaEducator.kuadranFokus"),
    kekal: t("lnaEducator.kuadranKekal"),
    keutamaan_rendah: t("lnaEducator.kuadranRendah"),
    berlebihan: t("lnaEducator.kuadranBerlebihan"),
  };
  const labelBendera: Record<string, string> = {
    yakin_tetapi_lemah: t("lnaEducator.flagConfidentButWeak"),
    kurang_yakin_tetapi_menguasai: t("lnaEducator.flagUnderconfident"),
  };

  const [senarai, setSenarai] = useState<LnaUi[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeUi[]>([]);
  const [kelasSaya, setKelasSaya] = useState<KelasUi[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [sedia, setSedia] = useState(false);

  // Borang cipta.
  const [tajuk, setTajuk] = useState("");
  const [cara, setCara] = useState<"sedia" | "taip" | "salin">("sedia");
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [teksBaharu, setTeksBaharu] = useState("");
  const [salinDari, setSalinDari] = useState("");
  const [busy, setBusy] = useState(false);
  // KZ-038: item bebas, tanpa Outcome.
  const [taipJenis, setTaipJenis] = useState<"outcome" | "bebas">("outcome");
  const [teksTambahan, setTeksTambahan] = useState("");

  // Cadangan item oleh AI (KZ-036).
  const [aiSedia, setAiSedia] = useState(false);
  const [aiTerbuka, setAiTerbuka] = useState(false);
  const [aiTeks, setAiTeks] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAmaran, setAiAmaran] = useState<string[]>([]);

  // QR modal.
  const [qr, setQr] = useState<{ pautan: string; dataUrl: string } | null>(null);

  // Laporan.
  const [laporan, setLaporan] = useState<LaporanPenuh | null>(null);
  const [pusinganPapar, setPusinganPapar] = useState<"pra" | "pasca">("pra");

  const muat = useCallback(async () => {
    try {
      const r = await baca(`/api/classes/${id}/lna`);
      const j = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) {
        setErr(String(j?.error ?? t("lnaEducator.loadFailed")));
        setSedia(true);
        return;
      }
      setSenarai((j?.lna ?? []) as LnaUi[]);
      setErr("");
      const ro = await baca(`/api/outcomes?class_id=${encodeURIComponent(id)}`);
      if (ro.ok) {
        const jo = await ro.json().catch(() => ({}) as Record<string, unknown>);
        setOutcomes(((jo?.data ?? []) as OutcomeUi[]));
      }
    } catch {
      setErr(t("lnaEducator.loadFailed"));
    } finally {
      setSedia(true);
    }
  }, [id, t]);

  useEffect(() => {
    void muat();
    // Kelas guru untuk "salin dari kelas lain".
    listMyEducatorClasses()
      .then((senarai) =>
        setKelasSaya(
          (senarai ?? []).map((k) => ({ id: String(k.id), name: String(k.name) })),
        ),
      )
      .catch(() => {});
  }, [muat]);

  // KZ-036: sama ada penyedia AI sedia. Butang "Cadang dengan AI" hanya
  // dipaparkan bila laluan suggest memulangkan available: true.
  useEffect(() => {
    let hidup = true;
    baca(`/api/classes/${id}/lna/suggest`)
      .then(async (r) => {
        if (!r.ok) return false;
        const j = await r.json().catch(() => null);
        if (hidup) setAiSedia(!!j?.available);
        return true;
      })
      .catch(() => false);
    return () => {
      hidup = false;
    };
  }, [id]);

  const barisBaharu = teksBaharu
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  // Item tambahan bukan Outcome dalam mod "Outcomes sedia ada" (KZ-038).
  const barisTambahan = teksTambahan
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const jumlahPilihan =
    terpilih.size + barisBaharu.length + (salinDari ? 1 : 0)
    + barisTambahan.length;

  // Amaran lembut bagi label yang mengandungi "dan"/"and" (panduan
  // menulis satu kemahiran bagi setiap item). Terpakai juga pada item
  // bebas (KZ-038).
  const labelBerat: string[] = [];
  for (const o of outcomes) {
    if (terpilih.has(o.id) && adaDan(o.label)) labelBerat.push(o.label);
  }
  for (const b of barisBaharu) {
    if (adaDan(b)) labelBerat.push(b);
  }
  for (const b of barisTambahan) {
    if (adaDan(b)) labelBerat.push(b);
  }

  const cipta = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (tajuk.trim().length < 1) {
      setErr(t("lnaEducator.titleMin"));
      return;
    }
    if (jumlahPilihan < 3 || jumlahPilihan > 15) {
      setErr(t("lnaEducator.itemCount"));
      return;
    }
    setBusy(true);
    try {
      // KZ-038: baris yang ditaip menjadi Outcome baharu (lalai) atau
      // item bebas ikut pilihan radio; item tambahan dalam mod
      // "Outcomes sedia ada" sentiasa item bebas.
      const bebas: string[] = [];
      const badan: Record<string, unknown> = { title: tajuk.trim() };
      if (terpilih.size > 0) badan.outcomeIds = Array.from(terpilih);
      if (barisBaharu.length > 0) {
        if (taipJenis === "bebas") bebas.push(...barisBaharu);
        else badan.newOutcomes = barisBaharu;
      }
      if (barisTambahan.length > 0) bebas.push(...barisTambahan);
      if (bebas.length > 0) badan.freeItems = bebas;
      if (salinDari) badan.copyFromClassId = salinDari;
      const r = await baca(`/api/classes/${id}/lna`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(badan),
      });
      const j = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) {
        setErr(String(j?.error ?? t("lnaEducator.createFailed")));
        return;
      }
      setTajuk("");
      setTerpilih(new Set());
      setTeksBaharu("");
      setTeksTambahan("");
      setSalinDari("");
      setMsg(t("lnaEducator.created"));
      await muat();
    } finally {
      setBusy(false);
    }
  };

  // KZ-036: jana cadangan item LNA daripada teks sinopsis/CLO. Hasil
  // mengisi textarea "Taip baharu" sahaja; guru menyemak dan menekan
  // "Cipta LNA" sendiri (tiada LNA dicipta di sini).
  const janaAi = async () => {
    setErr("");
    setMsg("");
    const teks = aiTeks.trim();
    if (teks.length < 30 || teks.length > 4000) {
      setErr(t("lnaEducator.aiTextRange"));
      return;
    }
    setAiBusy(true);
    try {
      const r = await baca(`/api/classes/${id}/lna/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: teks }),
      });
      const j = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) {
        setErr(String(j?.error ?? t("lnaEducator.aiFailed")));
        return;
      }
      const items = ((j?.items ?? []) as unknown[]).filter(
        (x): x is string => typeof x === "string",
      );
      setTeksBaharu(items.join("\n"));
      setAiAmaran(
        ((j?.amaran ?? []) as unknown[]).filter((x): x is string => typeof x === "string"),
      );
      setMsg(t("lnaEducator.aiDone"));
    } catch {
      setErr(t("lnaEducator.aiFailed"));
    } finally {
      setAiBusy(false);
    }
  };

  const bukaPusingan = async (lnaId: string, kind: "pre" | "post") => {
    setErr("");
    setMsg("");
    const r = await baca(`/api/lna/${lnaId}/rounds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? t("lnaEducator.openFailed")));
      return;
    }
    setMsg(kind === "pre" ? t("lnaEducator.openedPre") : t("lnaEducator.openedPost"));
    await muat();
  };

  const tutupPusingan = async (roundId: string) => {
    setErr("");
    setMsg("");
    const r = await baca(`/api/lna/rounds/${roundId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? t("lnaEducator.closeFailed")));
      return;
    }
    setMsg(t("lnaEducator.closedMsg"));
    await muat();
  };

  const padam = async (lna: LnaUi) => {
    if (
      !(await confirm({
        title: t("lnaEducator.deleteDesc", { tajuk: lna.title }),
        tone: "danger",
      }))
    ) {
      return;
    }
    const r = await baca(`/api/lna/${lna.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? t("lnaEducator.deleteFailed")));
      return;
    }
    setMsg(t("lnaEducator.deleted"));
    setErr("");
    setLaporan(null);
    await muat();
  };

  const paparQr = async (roundId: string) => {
    try {
      const pautan = `https://kuizen.fun/lna/${roundId}`;
      const dataUrl = await QRCode.toDataURL(pautan, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 260,
        color: { dark: "#111827", light: "#ffffff" },
      });
      setQr({ pautan, dataUrl });
    } catch {
      setErr(t("lnaEducator.qrFailed"));
    }
  };

  const salinPautan = async (roundId: string) => {
    try {
      await navigator.clipboard.writeText(`https://kuizen.fun/lna/${roundId}`);
      setMsg(t("lnaEducator.linkCopied"));
      setErr("");
    } catch {
      setErr(t("lnaEducator.clipboardFailed"));
    }
  };

  const muatLaporan = async (lnaId: string) => {
    setErr("");
    const r = await baca(`/api/lna/${lnaId}/report`);
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? t("lnaEducator.reportFailed")));
      return;
    }
    setLaporan(j as LaporanPenuh);
    setPusinganPapar("pra");
  };

  const laporanAktif =
    laporan == null ? null : pusinganPapar === "pra" ? laporan.pra : laporan.pasca;

  // KZ-038: nota bendera penguasaan hanya mengira item Outcome; jika
  // SEMUA item bebas, papar mesej khusus.
  const itemOutcome = laporanAktif?.outcomes.filter((o) => o.kind === "outcome") ?? [];
  const semuaBebas = laporanAktif != null && itemOutcome.length === 0;

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={id} current="lna">
        <div className="max-w-4xl mx-auto pb-10">
          {err ? <Alert tone="danger" className="mb-4">{err}</Alert> : null}
          {msg ? <Alert tone="success" className="mb-4">{msg}</Alert> : null}

          <Card className="mb-6">
            <CardHead
              title={t("lnaEducator.headerTitle")}
              subtitle={t("lnaEducator.headerSubtitle")}
            />
            {/* Panduan tetap (tiket E): kotak violet. */}
            <div className="mt-4 bg-violet-50 border border-violet-200 rounded-xl p-4 text-[14px] text-ink">
              {t("lnaEducator.guide")}
            </div>
            <form onSubmit={cipta} className="mt-4 grid gap-4">
              <Field label={t("lnaEducator.titleLabel")} htmlFor="lna-title">
                <Input
                  id="lna-title"
                  value={tajuk}
                  maxLength={120}
                  onChange={(e) => setTajuk(e.target.value)}
                  placeholder={t("lnaEducator.titlePlaceholder")}
                />
              </Field>

              {/* Tiga cara isi senarai (tab kecil). */}
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    ["sedia", t("lnaEducator.caraSedia")],
                    ["taip", t("lnaEducator.caraTaip")],
                    ["salin", t("lnaEducator.caraSalin")],
                  ] as const
                ).map(([kunci, label]) => (
                  <button
                    key={kunci}
                    type="button"
                    onClick={() => setCara(kunci)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border ${
                      cara === kunci
                        ? "border-violet-400 bg-violet-50 text-violet-700"
                        : "border-hairline bg-white text-ink-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {cara === "sedia" ? (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    {outcomes.length === 0 ? (
                      <p className="text-[13px] text-ink-faint">
                        {t("lnaEducator.noOutcomes")}
                      </p>
                    ) : (
                      outcomes.map((o) => (
                        <label
                          key={o.id}
                          className="flex items-start gap-2 text-[14px] text-ink"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={terpilih.has(o.id)}
                            onChange={(e) => {
                              const baharu = new Set(terpilih);
                              if (e.target.checked) baharu.add(o.id);
                              else baharu.delete(o.id);
                              setTerpilih(baharu);
                            }}
                          />
                          <span>
                            {o.code ? `${o.code} · ` : ""}
                            {o.label}
                          </span>
                        </label>
                      ))
                    )}
                  </div>

                  {/* KZ-038: item tambahan bukan Outcome, satu baris satu item. */}
                  <Field
                    label={t("lnaEducator.tambahanLabel")}
                    htmlFor="lna-tambahan"
                    note={t("lnaEducator.tambahanNote")}
                  >
                    <Textarea
                      id="lna-tambahan"
                      value={teksTambahan}
                      rows={3}
                      onChange={(e) => setTeksTambahan(e.target.value)}
                      placeholder={t("lnaEducator.tambahanPlaceholder")}
                    />
                  </Field>
                </div>
              ) : null}

              {cara === "taip" ? (
                <div className="grid gap-2">
                  {aiSedia ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setAiTerbuka((b) => !b)}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 border border-violet-300 bg-white text-violet-700 hover:bg-violet-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        {t("lnaEducator.aiSuggest")}
                      </button>
                    </div>
                  ) : null}

                  {aiSedia && aiTerbuka ? (
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 grid gap-2">
                      <Field
                        label={t("lnaEducator.aiLabel")}
                        htmlFor="lna-ai-teks"
                      >
                        <Textarea
                          id="lna-ai-teks"
                          value={aiTeks}
                          rows={6}
                          maxLength={4000}
                          onChange={(e) => setAiTeks(e.target.value)}
                          placeholder={t("lnaEducator.aiPlaceholder")}
                        />
                      </Field>
                      <p className="text-[13px] text-ink-faint">
                        {t("lnaEducator.aiNote")}
                      </p>
                      <div>
                        <button
                          type="button"
                          onClick={janaAi}
                          disabled={aiBusy}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 text-white bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50"
                        >
                          {aiBusy ? t("lnaEducator.aiGenerating") : t("lnaEducator.aiGenerate")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* KZ-038: pilihan jenis item yang ditaip. Cadangan AI
                      terus mengisi kotak teks yang sama. */}
                  <div className="grid gap-1.5">
                    <label className="flex items-start gap-2 text-[14px] text-ink">
                      <input
                        type="radio"
                        name="lna-taip-jenis"
                        className="mt-1"
                        checked={taipJenis === "outcome"}
                        onChange={() => setTaipJenis("outcome")}
                      />
                      <span>
                        {t("lnaEducator.jenisOutcome")}
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-[14px] text-ink">
                      <input
                        type="radio"
                        name="lna-taip-jenis"
                        className="mt-1"
                        checked={taipJenis === "bebas"}
                        onChange={() => setTaipJenis("bebas")}
                      />
                      <span>
                        {t("lnaEducator.jenisBebas")}
                      </span>
                    </label>
                  </div>

                  <Field
                    label={taipJenis === "outcome" ? t("lnaEducator.barisLabelOutcome") : t("lnaEducator.barisLabelBebas")}
                    htmlFor="lna-baris"
                    note={taipJenis === "outcome"
                      ? t("lnaEducator.barisNoteOutcome")
                      : t("lnaEducator.barisNoteBebas")}
                  >
                    <Textarea
                      id="lna-baris"
                      value={teksBaharu}
                      rows={5}
                      onChange={(e) => setTeksBaharu(e.target.value)}
                      placeholder={t("lnaEducator.barisPlaceholder")}
                    />
                  </Field>

                  {aiAmaran.length > 0 ? (
                    <p className="text-[13px] text-yellow-700">
                      {aiAmaran.join(" ")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {cara === "salin" ? (
                <Field
                  label={t("lnaEducator.salinLabel")}
                  htmlFor="lna-salin"
                  note={t("lnaEducator.salinNote")}
                >
                  <Select
                    id="lna-salin"
                    value={salinDari}
                    onChange={(e) => setSalinDari(e.target.value)}
                  >
                    <option value="">{t("lnaEducator.pilihKelas")}</option>
                    {kelasSaya
                      .filter((k) => k.id !== id)
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              ) : null}

              <p className="text-[13px] text-ink-faint">
                {t("lnaEducator.dipilih", { n: jumlahPilihan })}
              </p>
              {labelBerat.length > 0 ? (
                <p className="text-[13px] text-yellow-700">
                  {t("lnaEducator.beratWarn", { senarai: labelBerat.slice(0, 3).join("; ") })}
                </p>
              ) : null}

              <div>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 text-white bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {t("lnaEducator.ciptaBtn")}
                </button>
              </div>
            </form>
          </Card>

          {sedia && senarai.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-7 h-7" />}
              title={t("lnaEducator.emptyTitle")}
              text={t("lnaEducator.emptyText")}
            />
          ) : null}

          {senarai.map((lna) => {
            const pra = lna.rounds.find((r) => r.kind === "pre");
            const pasca = lna.rounds.find((r) => r.kind === "post");
            return (
              <Card key={lna.id} className="mb-6">
                <CardHead
                  title={lna.title}
                  subtitle={t("lnaEducator.createdOn", {
                    tarikh: new Date(lna.createdAt).toLocaleDateString(LOKAL[bahasa]),
                  })}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void muatLaporan(lna.id)}
                  >
                    {t("lnaEducator.lihatLaporan")}
                  </Button>
                  {!pra ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void bukaPusingan(lna.id, "pre")}
                    >
                      {t("lnaEducator.bukaPra")}
                    </Button>
                  ) : null}
                  {pra && pra.status === "open" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void tutupPusingan(pra.id)}
                    >
                      {t("lnaEducator.tutupPra")}
                    </Button>
                  ) : null}
                  {pra && pra.status === "closed" && !pasca ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void bukaPusingan(lna.id, "post")}
                    >
                      {t("lnaEducator.bukaPasca")}
                    </Button>
                  ) : null}
                  {pasca && pasca.status === "open" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void tutupPusingan(pasca.id)}
                    >
                      {t("lnaEducator.tutupPasca")}
                    </Button>
                  ) : null}
                  <Button
                    variant="icon"
                    size="sm"
                    warna="red"
                    ariaLabel={t("lnaEducator.padamAria")}
                    title={t("lnaEducator.padamAria")}
                    onClick={() => void padam(lna)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Pusingan: status, kiraan jawapan, pautan dan QR. */}
                <div className="mt-4 grid gap-3">
                  {lna.rounds.length === 0 ? (
                    <p className="text-[13px] text-ink-faint">
                      {t("lnaEducator.tiadaPusingan")}
                    </p>
                  ) : (
                    lna.rounds.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline px-4 py-3"
                      >
                        <span className="text-[14px] font-bold text-ink">
                          {r.kind === "pre" ? t("lnaEducator.praLabel") : t("lnaEducator.pascaLabel")}
                        </span>
                        <Badge warna={r.status === "open" ? "green" : "gray"}>
                          {r.status === "open" ? t("lnaEducator.terbuka") : t("lnaEducator.ditutup")}
                        </Badge>
                        <span className="text-[13px] text-ink-faint">
                          {t("lnaEducator.responden", { n: r.responden })}
                        </span>
                        <span className="grow" />
                        {r.status === "open" ? (
                          <>
                            <span className="text-[13px] text-ink-muted truncate max-w-[16rem]">
                              https://kuizen.fun/lna/{r.id}
                            </span>
                            <Button
                              variant="icon"
                              size="sm"
                              ariaLabel={t("lnaEducator.salinPautanAria")}
                              title={t("lnaEducator.salinPautanAria")}
                              onClick={() => void salinPautan(r.id)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="icon"
                              size="sm"
                              ariaLabel={t("lnaEducator.paparQrAria")}
                              title={t("lnaEducator.paparQrAria")}
                              onClick={() => void paparQr(r.id)}
                            >
                              <QrCode className="w-4 h-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            );
          })}

          {/* Laporan. */}
          {laporan ? (
            <Card className="mb-6">
              <CardHead
                title={t("lnaEducator.laporanTitle", { tajuk: laporan.lna.title })}
                subtitle={t("lnaEducator.laporanSubtitle")}
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPusinganPapar("pra")}
                  disabled={!laporan.pra}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border disabled:opacity-40 ${
                    pusinganPapar === "pra"
                      ? "border-violet-400 bg-violet-50 text-violet-700"
                      : "border-hairline bg-white text-ink-muted"
                  }`}
                >
                  {t("lnaEducator.praLabel")}
                </button>
                <button
                  type="button"
                  onClick={() => setPusinganPapar("pasca")}
                  disabled={!laporan.pasca}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border disabled:opacity-40 ${
                    pusinganPapar === "pasca"
                      ? "border-violet-400 bg-violet-50 text-violet-700"
                      : "border-hairline bg-white text-ink-muted"
                  }`}
                >
                  {t("lnaEducator.pascaLabel")}
                </button>
              </div>

              {!laporanAktif ? (
                <p className="mt-4 text-[14px] text-ink-faint">
                  {t("lnaEducator.tiadaJawapan")}
                </p>
              ) : (
                <>
                  {laporanAktif.amaranSampelKecil ? (
                    <Alert tone="warning" className="mt-4">
                      {t("lnaEducator.sampelKecil")}
                    </Alert>
                  ) : null}
                  {laporanAktif.kaedahSepakat === false ? (
                    <Alert tone="warning" className="mt-4">
                      {t("lnaEducator.takSepakat")}
                    </Alert>
                  ) : null}
                  {laporanAktif.kaedahSepakat === null &&
                  laporanAktif.bilanganResponden > 0 &&
                  laporanAktif.outcomes.length >= 3 ? (
                    <p className="mt-3 text-[12px] text-ink-faint">
                      {t("lnaEducator.kedudukanSama")}
                    </p>
                  ) : null}

                  {/* Jadual keutamaan. */}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-ink-faint border-b border-hairline">
                          <th className="py-2 pr-3">{t("lnaEducator.colItem")}</th>
                          <th className="py-2 pr-3">meanI</th>
                          <th className="py-2 pr-3">meanC</th>
                          <th className="py-2 pr-3">MWDS</th>
                          <th className="py-2 pr-3">Borich</th>
                          <th className="py-2 pr-3">RDS</th>
                          <th className="py-2 pr-3">RDM</th>
                          <th className="py-2 pr-3">{t("lnaEducator.colPenguasaan")}</th>
                          <th className="py-2 pr-3">{t("lnaEducator.colKuadran")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laporanAktif.outcomes.map((o) => (
                          <tr key={o.itemId} className="border-b border-hairline">
                            <td className="py-2 pr-3 text-ink">
                              {o.label}
                              {o.kind === "bebas" ? (
                                <span
                                  title={t("lnaEducator.bebasTitle")}
                                  className="ml-1.5 inline-block rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 align-middle"
                                >
                                  {t("lnaEducator.bebasBadge")}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">{o.meanI ?? "-"}</td>
                            <td className="py-2 pr-3">{o.meanC ?? "-"}</td>
                            <td className="py-2 pr-3 font-semibold">{o.mwds ?? "-"}</td>
                            <td className="py-2 pr-3">{o.kedudukanBorich ?? "-"}</td>
                            <td className="py-2 pr-3">{o.rds ?? "-"}</td>
                            <td className="py-2 pr-3">{o.kedudukanRdm ?? "-"}</td>
                            <td className="py-2 pr-3">
                              {o.kind === "bebas" ? (
                                <span
                                  title={t("lnaEducator.bebasTitle")}
                                  className="text-ink-faint"
                                >
                                  {t("lnaEducator.tiada")}
                                </span>
                              ) : o.avgMasteryPct != null ? `${o.avgMasteryPct}%` : "-"}
                            </td>
                            <td className="py-2 pr-3">
                              {o.kuadran ? labelKuadran[o.kuadran] : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Carta kuadran IPA (SVG ringkas, tiada pustaka carta). */}
                  <div className="mt-6">
                    <p className="text-[14px] font-semibold text-ink mb-2">
                      {t("lnaEducator.cartaKuadran")}
                    </p>
                    <svg
                      viewBox="0 0 100 100"
                      className="w-full max-w-[320px] bg-canvas rounded-lg"
                      role="img"
                      aria-label={t("lnaEducator.cartaKuadran")}
                    >
                      {/* Paksi: x = meanI (kepentingan), y = meanC (keyakinan). */}
                      <line x1="10" y1="90" x2="90" y2="90" stroke="#dbdfea" strokeWidth="1" />
                      <line x1="10" y1="10" x2="10" y2="90" stroke="#dbdfea" strokeWidth="1" />
                      {/* Garis purata keseluruhan. */}
                      <line
                        x1={10 + ((laporanAktif.purataMeanI - 1) / 4) * 80}
                        y1="10"
                        x2={10 + ((laporanAktif.purataMeanI - 1) / 4) * 80}
                        y2="90"
                        stroke="#c4b5fd"
                        strokeWidth="0.8"
                        strokeDasharray="2 2"
                      />
                      <line
                        x1="10"
                        y1={90 - ((laporanAktif.purataMeanC - 1) / 4) * 80}
                        x2="90"
                        y2={90 - ((laporanAktif.purataMeanC - 1) / 4) * 80}
                        stroke="#c4b5fd"
                        strokeWidth="0.8"
                        strokeDasharray="2 2"
                      />
                      {laporanAktif.outcomes.map((o) => {
                        if (o.meanI == null || o.meanC == null) return null;
                        const cx = 10 + ((o.meanI - 1) / 4) * 80;
                        const cy = 90 - ((o.meanC - 1) / 4) * 80;
                        return (
                          <circle
                            key={o.itemId}
                            cx={cx}
                            cy={cy}
                            r="2.6"
                            fill="#7c3aed"
                          >
                            <title>{`${o.label} (meanI ${o.meanI}, meanC ${o.meanC})`}</title>
                          </circle>
                        );
                      })}
                      <text x="50" y="98" textAnchor="middle" fontSize="4" fill="#8094ae">
                        {t("lnaEducator.paksiKepentingan")}
                      </text>
                      <text x="4" y="50" fontSize="4" fill="#8094ae" transform="rotate(-90 4 50)" textAnchor="middle">
                        {t("lnaEducator.paksiKeyakinan")}
                      </text>
                      {laporanAktif.outcomes.map((o, i) => {
                        if (o.meanI == null || o.meanC == null) return null;
                        const cx = 10 + ((o.meanI - 1) / 4) * 80;
                        const cy = 90 - ((o.meanC - 1) / 4) * 80;
                        return (
                          <text
                            key={`t-${o.itemId}`}
                            x={cx + 3.4}
                            y={cy + 1.4}
                            fontSize="3.6"
                            fill="#1f2b3a"
                          >
                            {i + 1}
                          </text>
                        );
                      })}
                    </svg>
                    <p className="text-[12px] text-ink-faint mt-1">
                      {t("lnaEducator.cartaNota")}
                    </p>
                  </div>

                  {/* Senarai pelajar berbendera. */}
                  <div className="mt-6">
                    <p className="text-[14px] font-semibold text-ink mb-2">
                      {t("lnaEducator.benderaTitle")}
                    </p>
                    {semuaBebas ? (
                      <p className="text-[13px] text-ink-faint">
                        {t("lnaEducator.semuaBebas")}
                      </p>
                    ) : laporanAktif.bendera.length === 0 &&
                    itemOutcome.every((o) => o.avgMasteryPct == null) ? (
                      <p className="text-[13px] text-ink-faint">
                        {t("lnaEducator.benderaPerluData")}
                      </p>
                    ) : laporanAktif.bendera.length === 0 ? (
                      <p className="text-[13px] text-ink-faint">
                        {t("lnaEducator.tiadaBendera")}
                      </p>
                    ) : (
                      <ul className="grid gap-1.5">
                        {laporanAktif.bendera.map((b, i) => {
                          const nama =
                            laporan.pelajar.find((p) => p.userId === b.userId)?.nama ?? t("lnaEducator.namaPelajar");
                          const labelOutcome =
                            laporanAktif.outcomes.find((o) => o.itemId === b.itemId)?.label ?? "";
                          return (
                            <li key={i} className="text-[13px] text-ink">
                              <span className="font-semibold">{nama}</span>{" "}
                              · {labelOutcome} ·{" "}
                              <span
                                className={
                                  b.bendera === "yakin_tetapi_lemah"
                                    ? "text-kz-down"
                                    : "text-kz-up"
                                }
                              >
                                {labelBendera[b.bendera]}
                              </span>
                              {b.masteryPct != null ? t("lnaEducator.penguasaanSuffix", { n: b.masteryPct }) : ""}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {/* Jadual perubahan pra/pasca. */}
              {laporan.perbandingan ? (
                <div className="mt-6">
                  <p className="text-[14px] font-semibold text-ink mb-2">
                    {t("lnaEducator.perubahanTitle")}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-ink-faint border-b border-hairline">
                          <th className="py-2 pr-3">{t("lnaEducator.colItem")}</th>
                          <th className="py-2 pr-3">{t("lnaEducator.colDeltaKeyakinan")}</th>
                          <th className="py-2 pr-3">{t("lnaEducator.colDeltaMwds")}</th>
                          <th className="py-2 pr-3">{t("lnaEducator.colDeltaPenguasaan")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laporan.perbandingan.outcomes.map((d) => (
                          <tr key={d.itemId} className="border-b border-hairline">
                            <td className="py-2 pr-3 text-ink">
                              {d.label}
                              {d.kind === "bebas" ? (
                                <span
                                  title={t("lnaEducator.bebasTitle")}
                                  className="ml-1.5 inline-block rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 align-middle"
                                >
                                  {t("lnaEducator.bebasBadge")}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">{d.deltaMeanC ?? "-"}</td>
                            <td className="py-2 pr-3">{d.deltaMwds ?? "-"}</td>
                            <td className="py-2 pr-3">{d.deltaMastery ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[14px] font-semibold text-ink mt-4 mb-2">
                    {t("lnaEducator.pelajarTitle")}
                  </p>
                  <ul className="grid gap-1">
                    {laporan.perbandingan.pelajar.map((d, i) => {
                      const nama =
                        laporan.pelajar.find((p) => p.userId === d.userId)?.nama ?? t("lnaEducator.namaPelajar");
                      const labelOutcome =
                        laporan.pra?.outcomes.find((o) => o.itemId === d.itemId)?.label
                        ?? laporan.pasca?.outcomes.find((o) => o.itemId === d.itemId)?.label
                        ?? "";
                      return (
                        <li key={i} className="text-[13px] text-ink">
                          {nama} · {labelOutcome} · {d.deltaC > 0 ? "+" : ""}
                          {d.deltaC}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </ClassShell>

      {/* Modal QR pautan pusingan. */}
      {qr ? (
        <Modal open={true} onClose={() => setQr(null)} title={t("lnaEducator.qrTitle")}>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.dataUrl} alt={t("lnaEducator.qrAlt")} className="mx-auto" width={220} height={220} />
            <p className="mt-3 text-[13px] text-ink-muted break-all">{qr.pautan}</p>
            <button
              type="button"
              onClick={() => setQr(null)}
              className="mt-4 text-sm font-semibold rounded-lg px-4 py-2 text-white bg-gradient-to-r from-violet-600 to-indigo-600"
            >
              {t("lnaEducator.tutup")}
            </button>
          </div>
        </Modal>
      ) : null}
    </Shell>
  );
}
