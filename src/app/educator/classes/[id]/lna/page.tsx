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
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ClipboardList, Copy, Plus, QrCode, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { supabase } from "@/lib/supabase";
import { listMyEducatorClasses } from "@/lib/data";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import type { LaporanLna, PerbandinganLna } from "@/lib/lna";
import { LABEL_BENDERA_LNA } from "@/lib/lna";
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

/** Label kuadran IPA (BM, ikut enjin). */
const LABEL_KUADRAN: Record<string, string> = {
  fokus: "Fokus",
  kekal: "Kekal",
  keutamaan_rendah: "Keutamaan rendah",
  berlebihan: "Berlebihan",
};

/** Amaran lembut: label yang kelihatan mengandungi dua kemahiran. */
function adaDan(label: string): boolean {
  const r = label.toLowerCase();
  return r.includes(" dan ") || r.includes(" and ");
}

export default function HalamanLnaKelas() {
  const params = useParams<{ id: string }>();
  const id = String(params.id || "");
  const confirm = useConfirm();

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
        setErr(String(j?.error ?? "Senarai LNA tidak dapat dibaca."));
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
      setErr("Senarai LNA tidak dapat dibaca.");
    } finally {
      setSedia(true);
    }
  }, [id]);

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

  const barisBaharu = teksBaharu
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const jumlahPilihan = terpilih.size + barisBaharu.length + (salinDari ? 1 : 0);

  // Amaran lembut bagi label yang mengandungi "dan"/"and" (panduan
  // menulis satu kemahiran bagi setiap item).
  const labelBerat: string[] = [];
  for (const o of outcomes) {
    if (terpilih.has(o.id) && adaDan(o.label)) labelBerat.push(o.label);
  }
  for (const b of barisBaharu) {
    if (adaDan(b)) labelBerat.push(b);
  }

  const cipta = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (tajuk.trim().length < 1) {
      setErr("Tajuk LNA mesti sekurang-kurangnya 1 aksara.");
      return;
    }
    if (jumlahPilihan < 3 || jumlahPilihan > 15) {
      setErr("Jumlah item LNA mesti 3 hingga 15.");
      return;
    }
    setBusy(true);
    try {
      const badan: Record<string, unknown> = { title: tajuk.trim() };
      if (terpilih.size > 0) badan.outcomeIds = Array.from(terpilih);
      if (barisBaharu.length > 0) badan.newOutcomes = barisBaharu;
      if (salinDari) badan.copyFromClassId = salinDari;
      const r = await baca(`/api/classes/${id}/lna`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(badan),
      });
      const j = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) {
        setErr(String(j?.error ?? "LNA tidak dapat dicipta."));
        return;
      }
      setTajuk("");
      setTerpilih(new Set());
      setTeksBaharu("");
      setSalinDari("");
      setMsg("LNA dicipta. Buka pusingan PRA apabila sedia.");
      await muat();
    } finally {
      setBusy(false);
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
      setErr(String(j?.error ?? "Pusingan tidak dapat dibuka."));
      return;
    }
    setMsg(kind === "pre" ? "Pusingan PRA dibuka." : "Pusingan PASCA dibuka.");
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
      setErr(String(j?.error ?? "Pusingan tidak dapat ditutup."));
      return;
    }
    setMsg("Pusingan ditutup dan snapshot penguasaan disimpan.");
    await muat();
  };

  const padam = async (lna: LnaUi) => {
    if (
      !(await confirm({
        title: `Padam LNA "${lna.title}"? Semua pusingan dan jawapan akan hilang.`,
        tone: "danger",
      }))
    ) {
      return;
    }
    const r = await baca(`/api/lna/${lna.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? "LNA tidak dapat dipadam."));
      return;
    }
    setMsg("LNA dipadam.");
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
      setErr("QR tidak dapat dilukis.");
    }
  };

  const salinPautan = async (roundId: string) => {
    try {
      await navigator.clipboard.writeText(`https://kuizen.fun/lna/${roundId}`);
      setMsg("Pautan disalin ke papan keratan.");
      setErr("");
    } catch {
      setErr("Papan keratan tidak dapat digunakan oleh pelayar ini.");
    }
  };

  const muatLaporan = async (lnaId: string) => {
    setErr("");
    const r = await baca(`/api/lna/${lnaId}/report`);
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? "Laporan tidak dapat dibaca."));
      return;
    }
    setLaporan(j as LaporanPenuh);
    setPusinganPapar("pra");
  };

  const laporanAktif =
    laporan == null ? null : pusinganPapar === "pra" ? laporan.pra : laporan.pasca;

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={id} current="lna">
        <div className="max-w-4xl mx-auto pb-10">
          {err ? <Alert tone="danger" className="mb-4">{err}</Alert> : null}
          {msg ? <Alert tone="success" className="mb-4">{msg}</Alert> : null}

          <Card className="mb-6">
            <CardHead
              title="Learning Needs Analysis (LNA)"
              subtitle="Analisis Keperluan Pembelajaran"
            />
            {/* Panduan tetap (tiket E): kotak violet. */}
            <div className="mt-4 bg-violet-50 border border-violet-200 rounded-xl p-4 text-[14px] text-ink">
              Panduan senarai item: 3 hingga 15 item. Satu kemahiran bagi
              setiap item (jangan guna &quot;dan&quot;). Tulis sebagai
              &quot;Saya boleh ...&quot; supaya pelajar faham apa yang dinilai.
            </div>
            <form onSubmit={cipta} className="mt-4 grid gap-4">
              <Field label="Tajuk LNA" htmlFor="lna-title">
                <Input
                  id="lna-title"
                  value={tajuk}
                  maxLength={120}
                  onChange={(e) => setTajuk(e.target.value)}
                  placeholder="cth. Analisis keperluan awal kursus"
                />
              </Field>

              {/* Tiga cara isi senarai (tab kecil). */}
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    ["sedia", "Outcomes sedia ada"],
                    ["taip", "Taip baharu"],
                    ["salin", "Salin dari kelas lain"],
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
                <div className="grid gap-1.5">
                  {outcomes.length === 0 ? (
                    <p className="text-[13px] text-ink-faint">
                      Kelas ini belum ada Outcomes. Guna &quot;Taip baharu&quot;
                      untuk menciptanya sekali gus.
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
              ) : null}

              {cara === "taip" ? (
                <Field
                  label="Satu Outcome setiap baris"
                  htmlFor="lna-baris"
                  note="Setiap baris mencipta Outcome baharu dalam kelas ini (1 hingga 200 aksara)."
                >
                  <Textarea
                    id="lna-baris"
                    value={teksBaharu}
                    rows={5}
                    onChange={(e) => setTeksBaharu(e.target.value)}
                    placeholder={"Saya boleh ...\nSaya boleh ..."}
                  />
                </Field>
              ) : null}

              {cara === "salin" ? (
                <Field
                  label="Kelas sumber"
                  htmlFor="lna-salin"
                  note="Label, kod dan penerangan Outcomes kelas sumber disalin sebagai Outcomes baharu kelas ini."
                >
                  <Select
                    id="lna-salin"
                    value={salinDari}
                    onChange={(e) => setSalinDari(e.target.value)}
                  >
                    <option value="">Pilih kelas</option>
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
                Item dipilih: {jumlahPilihan} (3 hingga 15)
              </p>
              {labelBerat.length > 0 ? (
                <p className="text-[13px] text-yellow-700">
                  Amaran lembut: label ini mengandungi &quot;dan&quot;, ia
                  mungkin dua kemahiran digabungkan: {labelBerat.slice(0, 3).join("; ")}
                </p>
              ) : null}

              <div>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 text-white bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Cipta LNA
                </button>
              </div>
            </form>
          </Card>

          {sedia && senarai.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-7 h-7" />}
              title="Belum ada LNA"
              text="Cipta LNA pertama untuk kelas ini menggunakan borang di atas."
            />
          ) : null}

          {senarai.map((lna) => {
            const pra = lna.rounds.find((r) => r.kind === "pre");
            const pasca = lna.rounds.find((r) => r.kind === "post");
            return (
              <Card key={lna.id} className="mb-6">
                <CardHead
                  title={lna.title}
                  subtitle={`Dicipta ${new Date(lna.createdAt).toLocaleDateString("ms-MY")}`}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void muatLaporan(lna.id)}
                  >
                    Lihat laporan
                  </Button>
                  {!pra ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void bukaPusingan(lna.id, "pre")}
                    >
                      Buka PRA
                    </Button>
                  ) : null}
                  {pra && pra.status === "open" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void tutupPusingan(pra.id)}
                    >
                      Tutup PRA
                    </Button>
                  ) : null}
                  {pra && pra.status === "closed" && !pasca ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void bukaPusingan(lna.id, "post")}
                    >
                      Buka PASCA
                    </Button>
                  ) : null}
                  {pasca && pasca.status === "open" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void tutupPusingan(pasca.id)}
                    >
                      Tutup PASCA
                    </Button>
                  ) : null}
                  <Button
                    variant="icon"
                    size="sm"
                    warna="red"
                    ariaLabel="Padam LNA"
                    title="Padam LNA"
                    onClick={() => void padam(lna)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Pusingan: status, kiraan jawapan, pautan dan QR. */}
                <div className="mt-4 grid gap-3">
                  {lna.rounds.length === 0 ? (
                    <p className="text-[13px] text-ink-faint">
                      Belum ada pusingan. Buka PRA untuk mengumpul jawapan
                      pelajar sebelum kursus bermula.
                    </p>
                  ) : (
                    lna.rounds.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline px-4 py-3"
                      >
                        <span className="text-[14px] font-bold text-ink">
                          {r.kind === "pre" ? "PRA" : "PASCA"}
                        </span>
                        <Badge warna={r.status === "open" ? "green" : "gray"}>
                          {r.status === "open" ? "Terbuka" : "Ditutup"}
                        </Badge>
                        <span className="text-[13px] text-ink-faint">
                          {r.responden} pelajar sudah menjawab
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
                              ariaLabel="Salin pautan"
                              title="Salin pautan"
                              onClick={() => void salinPautan(r.id)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="icon"
                              size="sm"
                              ariaLabel="Papar QR"
                              title="Papar QR"
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
                title={`Laporan: ${laporan.lna.title}`}
                subtitle="Keutamaan mengikut Borich MWDS dan RDM RDS"
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
                  PRA
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
                  PASCA
                </button>
              </div>

              {!laporanAktif ? (
                <p className="mt-4 text-[14px] text-ink-faint">
                  Belum ada jawapan untuk pusingan ini.
                </p>
              ) : (
                <>
                  {laporanAktif.amaranSampelKecil ? (
                    <Alert tone="warning" className="mt-4">
                      Sampel kecil: kurang daripada 5 pelajar menjawab.
                      Tafsir dengan berhati-hati.
                    </Alert>
                  ) : null}
                  {laporanAktif.kaedahSepakat === false ? (
                    <Alert tone="warning" className="mt-4">
                      Kaedah tidak sepakat, semak secara manual.
                    </Alert>
                  ) : null}

                  {/* Jadual keutamaan. */}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-ink-faint border-b border-hairline">
                          <th className="py-2 pr-3">Outcome</th>
                          <th className="py-2 pr-3">meanI</th>
                          <th className="py-2 pr-3">meanC</th>
                          <th className="py-2 pr-3">MWDS</th>
                          <th className="py-2 pr-3">Borich</th>
                          <th className="py-2 pr-3">RDS</th>
                          <th className="py-2 pr-3">RDM</th>
                          <th className="py-2 pr-3">Penguasaan</th>
                          <th className="py-2 pr-3">Kuadran</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laporanAktif.outcomes.map((o) => (
                          <tr key={o.outcomeId} className="border-b border-hairline">
                            <td className="py-2 pr-3 text-ink">{o.label}</td>
                            <td className="py-2 pr-3">{o.meanI ?? "-"}</td>
                            <td className="py-2 pr-3">{o.meanC ?? "-"}</td>
                            <td className="py-2 pr-3 font-semibold">{o.mwds ?? "-"}</td>
                            <td className="py-2 pr-3">{o.kedudukanBorich ?? "-"}</td>
                            <td className="py-2 pr-3">{o.rds ?? "-"}</td>
                            <td className="py-2 pr-3">{o.kedudukanRdm ?? "-"}</td>
                            <td className="py-2 pr-3">
                              {o.avgMasteryPct != null ? `${o.avgMasteryPct}%` : "-"}
                            </td>
                            <td className="py-2 pr-3">
                              {o.kuadran ? LABEL_KUADRAN[o.kuadran] : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Carta kuadran IPA (SVG ringkas, tiada pustaka carta). */}
                  <div className="mt-6">
                    <p className="text-[14px] font-semibold text-ink mb-2">
                      Carta kuadran IPA
                    </p>
                    <svg
                      viewBox="0 0 100 100"
                      className="w-full max-w-[320px] bg-canvas rounded-lg"
                      role="img"
                      aria-label="Carta kuadran IPA"
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
                            key={o.outcomeId}
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
                        Kepentingan (meanI)
                      </text>
                      <text x="4" y="50" fontSize="4" fill="#8094ae" transform="rotate(-90 4 50)" textAnchor="middle">
                        Keyakinan (meanC)
                      </text>
                      {laporanAktif.outcomes.map((o, i) => {
                        if (o.meanI == null || o.meanC == null) return null;
                        const cx = 10 + ((o.meanI - 1) / 4) * 80;
                        const cy = 90 - ((o.meanC - 1) / 4) * 80;
                        return (
                          <text
                            key={`t-${o.outcomeId}`}
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
                      Nombor mewakili susunan item dalam jadual (1 = item
                      pertama). Titik kanan bawah = penting tetapi keyakinan
                      rendah (Fokus).
                    </p>
                  </div>

                  {/* Senarai pelajar berbendera. */}
                  <div className="mt-6">
                    <p className="text-[14px] font-semibold text-ink mb-2">
                      Keyakinan lawan penguasaan
                    </p>
                    {laporanAktif.bendera.length === 0 ? (
                      <p className="text-[13px] text-ink-faint">
                        Tiada bendera. Pelajar yang yakin memang menguasai,
                        dan yang kurang yakin memang belum menguasai.
                      </p>
                    ) : (
                      <ul className="grid gap-1.5">
                        {laporanAktif.bendera.map((b, i) => {
                          const nama =
                            laporan.pelajar.find((p) => p.userId === b.userId)?.nama ?? "Pelajar";
                          const labelOutcome =
                            laporanAktif.outcomes.find((o) => o.outcomeId === b.outcomeId)?.label ?? "";
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
                                {LABEL_BENDERA_LNA[b.bendera]}
                              </span>
                              {b.masteryPct != null ? ` (penguasaan ${b.masteryPct}%)` : ""}
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
                    Perubahan PRA ke PASCA
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-ink-faint border-b border-hairline">
                          <th className="py-2 pr-3">Outcome</th>
                          <th className="py-2 pr-3">Delta keyakinan</th>
                          <th className="py-2 pr-3">Delta MWDS</th>
                          <th className="py-2 pr-3">Delta penguasaan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laporan.perbandingan.outcomes.map((d) => (
                          <tr key={d.outcomeId} className="border-b border-hairline">
                            <td className="py-2 pr-3 text-ink">{d.label}</td>
                            <td className="py-2 pr-3">{d.deltaMeanC ?? "-"}</td>
                            <td className="py-2 pr-3">{d.deltaMwds ?? "-"}</td>
                            <td className="py-2 pr-3">{d.deltaMastery ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[14px] font-semibold text-ink mt-4 mb-2">
                    Perubahan keyakinan setiap pelajar
                  </p>
                  <ul className="grid gap-1">
                    {laporan.perbandingan.pelajar.map((d, i) => {
                      const nama =
                        laporan.pelajar.find((p) => p.userId === d.userId)?.nama ?? "Pelajar";
                      const labelOutcome =
                        laporan.pra?.outcomes.find((o) => o.outcomeId === d.outcomeId)?.label
                        ?? laporan.pasca?.outcomes.find((o) => o.outcomeId === d.outcomeId)?.label
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
        <Modal open={true} onClose={() => setQr(null)} title="Imbas untuk menjawab LNA">
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.dataUrl} alt="QR pautan LNA" className="mx-auto" width={220} height={220} />
            <p className="mt-3 text-[13px] text-ink-muted break-all">{qr.pautan}</p>
            <button
              type="button"
              onClick={() => setQr(null)}
              className="mt-4 text-sm font-semibold rounded-lg px-4 py-2 text-white bg-gradient-to-r from-violet-600 to-indigo-600"
            >
              Tutup
            </button>
          </div>
        </Modal>
      ) : null}
    </Shell>
  );
}
