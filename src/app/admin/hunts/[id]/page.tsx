"use client";

// Butiran aktiviti ruang kerja admin (V2-011c). Tindakan lama halaman
// senarai dipindahkan ke sini: tukar status (publish/arkib), ubah mata
// challenge melalui RPC beralasan dan buang aktiviti dengan pengesahan
// menaip tajuk. Togol "Team completions" lama turut dipindahkan ke tab
// Submissions supaya tiada ciri hilang.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive, Rocket, Trash2, CheckCircle, Circle, ChevronDown, ChevronRight,
} from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, Tabs, EmptyState, relTime } from "@/components/admin/ui";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { mesejHad } from "@/lib/pelan";
import {
  adminListAllHunts,
  adminListAllClasses,
  adminListAllChallenges,
  adminListAllSubmissions,
  adminListAllTeams,
  adminListProfiles,
  adminUpdateHunt,
  adminSetChallengePoints,
  deleteHunt,
  listQuestCompletions,
  markTeamCompletion,
  unmarkTeamCompletion,
  logAudit,
  type Profile,
  type Hunt,
  type Challenge,
  type Submission,
  type Team,
} from "@/lib/data";
import { tokenJawapan } from "@/lib/adminRanking";
import type { KelasAdmin } from "@/lib/adminClasses";

type MukaTab = "questions" | "submissions";

const MATA_MAX = 100000;

function fmt(d: string | null | undefined) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

/** Jawapan dalam jadual: dipotong, URL sahaja dipaparkan sebagai pautan selamat. */
function JawapanRingkas({ answer, max = 60 }: { answer: string | null | undefined; max?: number }) {
  const penuh = tokenJawapan(answer);
  if (penuh.length === 0) return <span className="text-ink-faint">-</span>;
  // Bina paparan sehingga had aksara; token URL dikira ikut teksnya.
  const tokens: { jenis: "teks" | "url"; nilai: string }[] = [];
  let panjang = 0;
  for (const t of penuh) {
    if (panjang + t.nilai.length > max) {
      const potongan = t.nilai.slice(0, Math.max(0, max - panjang));
      if (potongan.length > 0) tokens.push({ jenis: t.jenis, nilai: potongan });
      panjang = max;
      break;
    }
    tokens.push(t);
    panjang += t.nilai.length;
  }
  const dipotong = panjang >= max;
  return (
    <span>
      {tokens.map((t, i) =>
        t.jenis === "url" ? (
          <a
            key={i}
            href={t.nilai}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-purple hover:opacity-80 underline underline-offset-2 break-all"
          >
            {t.nilai}
          </a>
        ) : (
          <span key={i}>{t.nilai}</span>
        ),
      )}
      {dipotong && <span className="text-ink-faint">...</span>}
    </span>
  );
}

export default function Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { id } = params;

  const [muat, setMuat] = useState(true);
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [kelas, setKelas] = useState<KelasAdmin | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [tab, setTab] = useState<MukaTab>("questions");
  const [mesej, setMesej] = useState<{ baik: boolean; teks: string } | null>(null);

  // Draf mata: challenge_id -> nilai input (rentetan supaya taipan tak melompat).
  const [drafMata, setDrafMata] = useState<Record<string, string>>({});
  const [alasanMata, setAlasanMata] = useState("");
  const [simpanMata, setSimpanMata] = useState(false);
  const [laporanMata, setLaporanMata] = useState<{ title: string; ok: boolean; teks?: string }[] | null>(null);

  const [zonBahaya, setZonBahaya] = useState(false);
  const [pengesahanHapus, setPengesahanHapus] = useState("");

  // Togol team completions (ciri lama halaman senarai).
  const [completions, setCompletions] = useState<Team[] | null>(null);
  const [senaraiCompletions, setSenaraiCompletions] = useState<string[]>([]);
  const [toggling, setToggling] = useState("");

  const reload = useCallback(async () => {
    try {
      const [semuaHunt, semuaKelas, profs, semuaCh, semuaSub] = await Promise.all([
        adminListAllHunts(),
        adminListAllClasses(),
        adminListProfiles(),
        adminListAllChallenges(),
        adminListAllSubmissions(),
      ]);
      const h = semuaHunt.find((x) => x.id === id) || null;
      setHunt(h);
      setKelas((semuaKelas || []).find((k) => k.id === h?.class_id) || null);
      setProfiles(profs);
      const ch = semuaCh.filter((c) => c.hunt_id === id);
      ch.sort((a, b) => (a.order_idx || 0) - (b.order_idx || 0));
      setChallenges(ch);
      const idCh = new Set(ch.map((c) => c.id));
      setSubs(semuaSub.filter((s) => idCh.has(s.challenge_id)));
      // Draf mata bermula daripada nilai sebenar.
      const draf: Record<string, string> = {};
      for (const c of ch) draf[c.id] = String(Number(c.points) || 0);
      setDrafMata(draf);
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to load this activity.") });
    } finally {
      setMuat(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const namaProfil = (uid: string | null | undefined) => {
    if (!uid) return "Unnamed user";
    const p = profiles.find((u) => u.id === uid);
    return p?.display_name || "Unnamed user";
  };

  // ===== Questions & points =====
  const perubahanMata = useMemo(() => {
    const senarai: { id: string; title: string; sebelum: number; selepas: number }[] = [];
    for (const c of challenges) {
      const draf = drafMata[c.id];
      if (draf === undefined) continue;
      const selepas = Number(draf);
      if (Number.isNaN(selepas)) continue;
      if (selepas !== (Number(c.points) || 0)) {
        senarai.push({ id: c.id, title: c.title, sebelum: Number(c.points) || 0, selepas });
      }
    }
    return senarai;
  }, [challenges, drafMata]);

  const jumlahSebelum = useMemo(
    () => challenges.reduce((n, c) => n + (Number(c.points) || 0), 0),
    [challenges],
  );
  const jumlahSelepas = useMemo(
    () =>
      challenges.reduce((n, c) => {
        const draf = Number(drafMata[c.id]);
        return n + (Number.isNaN(draf) ? Number(c.points) || 0 : draf);
      }, 0),
    [challenges, drafMata],
  );

  // Draf di luar had 0 hingga 100000 atau bukan integer menyekat simpanan;
  // RPC 0047 juga menolak nilai sebegini di pelayan (invalid_points).
  const mataTakSah = useMemo(() => {
    const senarai: string[] = [];
    for (const c of challenges) {
      const draf = drafMata[c.id];
      if (draf === undefined) continue;
      const v = draf.trim() === "" ? NaN : Number(draf);
      if (Number.isNaN(v) || !Number.isInteger(v) || v < 0 || v > MATA_MAX) senarai.push(c.title);
    }
    return senarai;
  }, [challenges, drafMata]);

  const alasanBersih = alasanMata.trim();
  const alasanSah = alasanBersih.length >= 5 && alasanBersih.length <= 500;
  const bolehSimpan = perubahanMata.length > 0 && mataTakSah.length === 0 && alasanSah && !simpanMata;

  /** Simpan setiap perubahan mata secara berjujukan; lapor kejayaan/ralat setiap satu. */
  const simpanMataBtn = async () => {
    if (!bolehSimpan) return;
    setSimpanMata(true);
    setLaporanMata(null);
    const laporan: { title: string; ok: boolean; teks?: string }[] = [];
    for (const p of perubahanMata) {
      try {
        await adminSetChallengePoints(p.id, p.selepas, alasanBersih);
        laporan.push({ title: p.title, ok: true });
      } catch (e) {
        laporan.push({ title: p.title, ok: false, teks: mesejHad(e, "Failed") });
      }
    }
    setLaporanMata(laporan);
    setSimpanMata(false);
    if (laporan.every((l) => l.ok)) {
      setMesej({ baik: true, teks: `Points saved for ${laporan.length} challenge${laporan.length === 1 ? "" : "s"}.` });
      setAlasanMata("");
      reload();
    } else {
      const gagal = laporan.filter((l) => !l.ok).length;
      setMesej({ baik: false, teks: `${gagal} change${gagal === 1 ? "" : "s"} failed. See the list below.` });
      reload();
    }
  };

  // ===== Tindakan status dan buang (fungsi lama halaman senarai) =====
  const tukarStatus = async (status: "draft" | "active" | "archived") => {
    if (!hunt || hunt.status === status) return;
    const ok = await confirm({
      title:
        status === "active"
          ? `Publish "${hunt.title}"?`
          : `Archive "${hunt.title}"?`,
      tone: status === "archived" ? "danger" : "default",
    });
    if (!ok) return;
    try {
      await adminUpdateHunt(id, { status });
      await logAudit("hunt_status", "hunt", id, { status });
      setMesej({ baik: true, teks: status === "active" ? "Activity published." : "Activity archived." });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to update the activity.") });
      reload();
    }
  };

  /** Buang aktiviti: pengesahan menaip tajuk dengan tepat. */
  const hapus = async () => {
    if (!hunt) return;
    try {
      await deleteHunt(id);
      await logAudit("hunt_delete", "hunt", id, { title: hunt.title });
      router.push("/admin/hunts");
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Delete failed.") });
      reload();
    }
  };

  // ===== Team completions (ciri lama) =====
  const bukaCompletions = async () => {
    if (completions !== null) {
      setCompletions(null);
      return;
    }
    try {
      const [teams, done] = await Promise.all([
        adminListAllTeams(),
        listQuestCompletions(id),
      ]);
      setCompletions(teams);
      setSenaraiCompletions(done.map((d) => d.team_id));
    } catch {
      setCompletions([]);
      setSenaraiCompletions([]);
    }
  };

  const togolCompletion = async (teamId: string, sudah: boolean) => {
    setToggling(teamId);
    try {
      if (sudah) await unmarkTeamCompletion(id, teamId);
      else await markTeamCompletion(id, teamId);
      const done = await listQuestCompletions(id);
      setSenaraiCompletions(done.map((d) => d.team_id));
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to update the completion.") });
    } finally {
      setToggling("");
    }
  };

  // ===== Paparan =====

  if (muat) {
    return (
      <AdminShell crumbs={[{ label: "Activities", href: "/admin/hunts" }, { label: "Loading..." }]}>
        <div className="text-sm text-ink-faint py-8">Loading...</div>
      </AdminShell>
    );
  }

  if (!hunt) {
    return (
      <AdminShell
        crumbs={[{ label: "Activities", href: "/admin/hunts" }, { label: "Not found" }]}
        title="Activity not found"
      >
        <Card>
          <EmptyState title="Activity not found." body="It may have been deleted." />
          <div className="px-4 pb-4">
            <Link href="/admin/hunts" className="text-sm font-medium text-brand-purple hover:opacity-80">
              Back to Activities
            </Link>
          </div>
        </Card>
      </AdminShell>
    );
  }

  const namaTajuk = hunt.title;

  return (
    <AdminShell
      crumbs={[{ label: "Activities", href: "/admin/hunts" }, { label: namaTajuk }]}
      actions={
        <>
          {hunt.status !== "active" && (
            <button
              type="button"
              onClick={() => tukarStatus("active")}
              className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
            >
              <Rocket className="w-4 h-4 text-ink-faint" /> Publish
            </button>
          )}
          {hunt.status !== "archived" && (
            <button
              type="button"
              onClick={() => tukarStatus("archived")}
              className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
            >
              <Archive className="w-4 h-4 text-ink-faint" /> Archive
            </button>
          )}
          <button
            type="button"
            onClick={() => setZonBahaya((v) => !v)}
            className="inline-flex items-center gap-1.5 bg-white border border-red-200 rounded-xl px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </>
      }
    >
      {/* Kepala */}
      <div className="mb-6">
        <div className="text-xl font-semibold text-ink truncate">{namaTajuk}</div>
        <div className="text-sm text-ink-faint flex items-center gap-2 flex-wrap mt-1">
          {hunt.class_id && (
            <Link href={`/admin/classes/${hunt.class_id}`} className="text-brand-purple font-medium hover:opacity-80">
              {kelas?.name || "Unnamed class"}
            </Link>
          )}
          <span>by {namaProfil(hunt.owner_id)}</span>
          <Pill tone={hunt.status === "active" ? "green" : hunt.status === "draft" ? "yellow" : "gray"}>
            {hunt.status.charAt(0).toUpperCase() + hunt.status.slice(1)}
          </Pill>
        </div>
        <div className="text-xs text-ink-faint mt-1">
          Start {fmt(hunt.start_at)} · End {fmt(hunt.end_at)}
        </div>
      </div>

      {/* Zon bahaya buang aktiviti */}
      {zonBahaya && (
        <Card className="mb-6 p-4 border-red-200">
          <div className="text-sm font-semibold text-red-600 mb-1">Danger zone</div>
          <p className="text-sm text-ink-muted mb-3">
            Deleting this activity removes its challenges and submissions permanently. Type the activity title exactly to enable the button.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink w-64"
              placeholder={namaTajuk}
              value={pengesahanHapus}
              onChange={(e) => setPengesahanHapus(e.target.value)}
              aria-label="Type the activity title to confirm deletion"
            />
            <button
              type="button"
              disabled={pengesahanHapus !== namaTajuk}
              onClick={hapus}
              className="inline-flex items-center gap-1.5 bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" /> Delete activity
            </button>
            <button
              type="button"
              onClick={() => {
                setZonBahaya(false);
                setPengesahanHapus("");
              }}
              className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      <Tabs
        items={[
          { key: "questions", label: "Questions & points" },
          { key: "submissions", label: "Submissions" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as MukaTab)}
      />

      {mesej && (
        <div
          className={`mt-4 text-sm rounded-lg px-3 py-2 inline-block ${
            mesej.baik
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {mesej.teks}
        </div>
      )}

      {/* ===== Tab Questions & points ===== */}
      {tab === "questions" && (
        <div className="mt-4 grid lg:grid-cols-3 gap-4 items-start">
          {/* Jadual challenge */}
          <Card className="lg:col-span-2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                    <th className="px-4 py-3 font-medium w-10">#</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium w-28">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map((c, i) => {
                    const berubah = perubahanMata.some((p) => p.id === c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-hairline last:border-b-0 ${berubah ? "bg-[#F1EEFC]" : ""}`}
                      >
                        <td className="px-4 py-3 text-ink-faint">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-ink">{c.title}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            max={MATA_MAX}
                            value={drafMata[c.id] ?? String(Number(c.points) || 0)}
                            onChange={(e) => setDrafMata({ ...drafMata, [c.id]: e.target.value })}
                            className="w-24 h-9 rounded-xl bg-white border border-hairline px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
                            aria-label={`Points for ${c.title}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {challenges.length === 0 && <EmptyState title="No questions." />}
          </Card>

          {/* Panel kanan melekat: semak perubahan */}
          <Card className="lg:sticky lg:top-20 p-4">
            <div className="text-sm font-semibold text-ink mb-3">Review changes</div>
            {perubahanMata.length === 0 ? (
              <p className="text-sm text-ink-faint">No changes yet. Edit points in the table to queue a change.</p>
            ) : (
              <div className="space-y-1 mb-3">
                {perubahanMata.map((p) => (
                  <div key={p.id} className="text-sm text-ink">
                    <span className="font-medium truncate">{p.title}:</span>{" "}
                    <span className="text-ink-muted">{p.sebelum} to {p.selepas}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-ink-muted border-t border-hairline pt-3 mb-3">
              <span>Total before: <span className="font-semibold text-ink">{jumlahSebelum}</span></span>
              <span>Total after: <span className="font-semibold text-brand-purple">{jumlahSelepas}</span></span>
            </div>
            {mataTakSah.length > 0 && (
              <p className="text-xs text-red-600 mb-3">
                Points must be whole numbers from 0 to {MATA_MAX}. Check: {mataTakSah.join(", ")}
              </p>
            )}
            <textarea
              rows={4}
              maxLength={500}
              value={alasanMata}
              onChange={(e) => setAlasanMata(e.target.value)}
              placeholder="Explain why these points change"
              className="w-full border border-hairline rounded-xl p-3 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              aria-label="Reason for the points change"
            />
            <div className="flex items-center justify-between mt-1 mb-3">
              <span className="text-xs text-ink-faint">{alasanBersih.length}/500</span>
              <span className="text-xs text-ink-faint">Changes are recorded in Audit.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!bolehSimpan}
                onClick={simpanMataBtn}
                className="flex-1 bg-brand-purple text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                {simpanMata ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                disabled={perubahanMata.length === 0 && alasanMata.length === 0}
                onClick={() => {
                  const draf: Record<string, string> = {};
                  for (const c of challenges) draf[c.id] = String(Number(c.points) || 0);
                  setDrafMata(draf);
                  setAlasanMata("");
                  setLaporanMata(null);
                }}
                className="bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-40"
              >
                Discard
              </button>
            </div>
            {laporanMata && (
              <div className="mt-3 space-y-1 border-t border-hairline pt-3">
                {laporanMata.map((l) => (
                  <div key={l.title} className={`text-xs ${l.ok ? "text-green-700" : "text-red-700"}`}>
                    {l.ok ? "Saved" : "Failed"}: {l.title}
                    {!l.ok && l.teks ? ` (${l.teks})` : ""}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===== Tab Submissions ===== */}
      {tab === "submissions" && (
        <div className="mt-4 space-y-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                    <th className="px-4 py-3 font-medium">Participant</th>
                    <th className="px-4 py-3 font-medium">Challenge</th>
                    <th className="px-4 py-3 font-medium">Answer</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => {
                    const ch = challenges.find((c) => c.id === s.challenge_id);
                    return (
                      <tr key={s.id} className="border-b border-hairline last:border-b-0 hover:bg-[#F7F7F9]">
                        <td className="px-4 py-3 text-ink truncate max-w-[160px]">{namaProfil(s.user_id)}</td>
                        <td className="px-4 py-3 text-ink-muted truncate max-w-[160px]">{ch?.title || "-"}</td>
                        <td className="px-4 py-3 text-ink-muted max-w-[260px]">
                          <JawapanRingkas answer={s.answer} />
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={s.status === "approved" ? "green" : s.status === "rejected" ? "red" : "yellow"}>
                            {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                          </Pill>
                        </td>
                        <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{relTime(s.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/moderation?id=${s.id}`}
                            className="text-sm font-medium text-brand-purple hover:opacity-80"
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {subs.length === 0 && <EmptyState title="No submissions." body="Nobody has answered yet." />}
          </Card>

          {/* Kad togol team completions, dipindahkan daripada halaman lama */}
          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={bukaCompletions}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-ink hover:bg-[#F7F7F9]"
            >
              {completions === null ? (
                <ChevronRight className="w-4 h-4 text-ink-faint" />
              ) : (
                <ChevronDown className="w-4 h-4 text-ink-faint" />
              )}
              Team completions
            </button>
            {completions !== null && (
              <div className="px-4 pb-4 pt-1 space-y-1 border-t border-hairline">
                {completions.length === 0 ? (
                  <p className="text-xs text-ink-faint">No teams yet.</p>
                ) : (
                  completions.map((t) => {
                    const sudah = senaraiCompletions.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => togolCompletion(t.id, sudah)}
                        disabled={toggling === t.id}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition ${
                          sudah ? "bg-green-50" : "bg-[#F7F7F9] hover:bg-[#EFEFF3]"
                        }`}
                      >
                        {toggling === t.id ? (
                          <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-brand-purple animate-spin" />
                        ) : sudah ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Circle className="w-4 h-4 text-ink-faint" />
                        )}
                        <span className={`text-sm truncate ${sudah ? "text-green-700 font-medium" : "text-ink-muted"}`}>
                          {t.name}
                        </span>
                        {sudah && <span className="text-xs text-green-600 ml-auto">Complete</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
