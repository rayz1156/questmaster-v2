"use client";

// Moderation ruang kerja admin (V2-011c). Dua panel: senarai kiri item
// submission mengikut tab Pending/Reviewed/All (jawapan benih SEED::
// dikecualikan oleh tapisModerasi), panel kanan butiran item terpilih
// termasuk kad Admin override beralasan melalui RPC qm_admin_override_submission.
// Pemilihan awal boleh datang daripada ?id= (pautan Review dari butiran
// aktiviti). Audit ditulis oleh RPC di pelayan, bukan oleh klien.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, Tabs, EmptyState, relTime } from "@/components/admin/ui";
import { mesejHad } from "@/lib/pelan";
import {
  adminListAllSubmissions,
  adminListAllChallenges,
  adminListAllHunts,
  adminListProfiles,
  adminOverrideSubmission,
  type Profile,
  type Hunt,
  type Challenge,
  type Submission,
} from "@/lib/data";
import { TAB_MODERASI, tapisModerasi, kiraTabModerasi, type TabModerasi } from "@/lib/adminModeration";
import { tokenJawapan } from "@/lib/adminRanking";

const SEBARIS = 50;

/** Pil status submission mengikut warna piawai admin. */
function pilStatus(status: Submission["status"]) {
  if (status === "approved") return <Pill tone="green">Approved</Pill>;
  if (status === "rejected") return <Pill tone="red">Rejected</Pill>;
  return <Pill tone="yellow">Pending</Pill>;
}

function PanelModerasi({
  subs,
  challenges,
  hunts,
  profiles,
  onReload,
}: {
  subs: Submission[];
  challenges: Challenge[];
  hunts: Hunt[];
  profiles: Profile[];
  onReload: () => void;
}) {
  const sp = useSearchParams();

  const [tab, setTab] = useState<TabModerasi>("pending");
  const [muka, setMuka] = useState(1);
  // Pemilihan awal daripada ?id=; null bila tiada atau tidak sah.
  const [dipilih, setDipilih] = useState<string | null>(sp.get("id"));
  const [pilihanStatus, setPilihanStatus] = useState<"approved" | "rejected" | "pending" | null>(null);
  const [alasan, setAlasan] = useState("");
  const [menghantar, setMenghantar] = useState(false);
  const [mesej, setMesej] = useState<{ baik: boolean; teks: string } | null>(null);

  const chById = useMemo(() => new Map(challenges.map((c) => [c.id, c])), [challenges]);
  const huntById = useMemo(() => new Map(hunts.map((h) => [h.id, h])), [hunts]);
  const profById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const namaProfil = (uid: string | null | undefined) => {
    if (!uid) return "Unnamed user";
    return profById.get(uid)?.display_name || "Unnamed user";
  };

  const ditapis = useMemo(() => tapisModerasi(subs, tab), [subs, tab]);
  const kiraan = useMemo(() => kiraTabModerasi(subs), [subs]);

  const jumlah = ditapis.length;
  const mula = jumlah === 0 ? 0 : (muka - 1) * SEBARIS + 1;
  const akhir = Math.min(muka * SEBARIS, jumlah);
  const barisMuka = ditapis.slice((muka - 1) * SEBARIS, muka * SEBARIS);

  // Item terpilih dicari dalam senarai penuh, bukan hanya muka semasa,
  // supaya butiran kekal selepas bertukar tab atau selepas override.
  const item = subs.find((s) => s.id === dipilih) || null;
  const itemCh = item ? chById.get(item.challenge_id) || null : null;
  const itemHunt = itemCh ? huntById.get(itemCh.hunt_id) || null : null;

  const alasanBersih = alasan.trim();
  const alasanSah = alasanBersih.length >= 5 && alasanBersih.length <= 500;
  const bolehHantar =
    item !== null && pilihanStatus !== null && pilihanStatus !== item.status && alasanSah && !menghantar;

  /** Hantar pintasan melalui RPC; audit ditulis oleh pelayan. */
  const hantar = async () => {
    if (!item || !pilihanStatus || !bolehHantar) return;
    setMenghantar(true);
    setMesej(null);
    try {
      await adminOverrideSubmission(item.id, pilihanStatus, alasanBersih);
      setMesej({ baik: true, teks: "Override applied." });
      setAlasan("");
      setPilihanStatus(null);
      onReload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Override failed.") });
    } finally {
      setMenghantar(false);
    }
  };

  const pilih = (id: string) => {
    setDipilih(id);
    setPilihanStatus(null);
    setAlasan("");
    setMesej(null);
  };

  return (
    <div>
      <Tabs
        items={TAB_MODERASI.map((t) => ({ ...t, count: kiraan[t.key] }))}
        value={tab}
        onChange={(k) => {
          setTab(k as TabModerasi);
          setMuka(1);
        }}
      />

      <div className="mt-4 grid lg:grid-cols-5 gap-4 items-start">
        {/* ===== Senarai kiri ===== */}
        <Card className="lg:col-span-2 overflow-hidden">
          {barisMuka.map((s) => {
            const ch = chById.get(s.challenge_id);
            const hu = ch ? huntById.get(ch.hunt_id) : null;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pilih(s.id)}
                className={`w-full text-left px-4 py-3 border-t border-hairline first:border-t-0 transition ${
                  dipilih === s.id ? "bg-[#F1EEFC]" : "hover:bg-[#F7F7F9]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink truncate">{namaProfil(s.user_id)}</span>
                  {pilStatus(s.status)}
                </div>
                <div className="text-xs text-ink-muted truncate mt-0.5">{ch?.title || "Challenge"}</div>
                <div className="text-xs text-ink-faint truncate">{hu?.title || "Activity"}</div>
                <div className="text-xs text-ink-faint mt-0.5">{relTime(s.created_at)}</div>
              </button>
            );
          })}

          {jumlah === 0 && tab === "pending" && (
            <EmptyState title="No answers waiting for review." />
          )}
          {jumlah === 0 && tab !== "pending" && <EmptyState title="Nothing here yet." />}

          {jumlah > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-hairline">
              <span className="text-xs text-ink-faint">
                Showing {mula}-{akhir} of {jumlah}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={muka <= 1}
                  onClick={() => setMuka((v) => Math.max(1, v - 1))}
                  className="p-2 rounded-xl border border-hairline text-ink-muted hover:text-ink disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={muka * SEBARIS >= jumlah}
                  onClick={() => setMuka((v) => v + 1)}
                  className="p-2 rounded-xl border border-hairline text-ink-muted hover:text-ink disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* ===== Panel kanan butiran ===== */}
        <div className="lg:col-span-3 space-y-4">
          {!item ? (
            <Card>
              <EmptyState title="Select an answer." body="Pick an item on the left to see its details." />
            </Card>
          ) : (
            <>
              {/* Kepala item */}
              <Card className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      href={`/admin/users/${item.user_id}`}
                      className="text-sm font-semibold text-ink hover:text-brand-purple truncate"
                    >
                      {namaProfil(item.user_id)}
                    </Link>
                    {pilStatus(item.status)}
                  </div>
                  <span className="text-xs text-ink-faint">{relTime(item.created_at)}</span>
                </div>
                <div className="text-xs text-ink-faint mt-1">
                  {itemHunt ? (
                    <Link href={`/admin/hunts/${itemCh?.hunt_id}`} className="text-brand-purple hover:opacity-80">
                      {itemHunt.title}
                    </Link>
                  ) : (
                    "Activity"
                  )}
                </div>
              </Card>

              {/* Soalan dan jawapan */}
              <Card className="p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Challenge</div>
                <div className="text-sm font-semibold text-ink mt-1">{itemCh?.title || "Challenge"}</div>
                {itemCh?.prompt && (
                  <p className="text-sm text-ink-muted whitespace-pre-wrap mt-2">{itemCh.prompt}</p>
                )}
                <div className="text-xs text-ink-muted mt-3">
                  Worth <span className="font-semibold text-ink">{Number(itemCh?.points) || 0}</span> points
                </div>

                <div className="border-t border-hairline mt-4 pt-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Answer</div>
                  {tokenJawapan(item.answer).length === 0 ? (
                    <p className="text-sm text-ink-faint mt-2">No answer text.</p>
                  ) : (
                    <p className="text-sm text-ink whitespace-pre-wrap break-words mt-2">
                      {tokenJawapan(item.answer).map((t, i) =>
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
                    </p>
                  )}
                  <div className="text-xs text-ink-faint mt-3">Submitted {relTime(item.created_at)}</div>
                </div>
              </Card>

              {/* Keputusan pendidik semasa */}
              <Card className="p-4">
                <div className="text-sm font-semibold text-ink mb-2">Educator decision</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {pilStatus(item.status)}
                  <span className="text-sm text-ink-muted">
                    {item.status === "pending"
                      ? "Waiting for the educator to review this answer."
                      : item.reviewed_by
                        ? `Reviewed by ${namaProfil(item.reviewed_by)}.`
                        : "No reviewer recorded."}
                  </span>
                </div>
                <div className="text-xs text-ink-faint mt-1">This is the current decision.</div>
              </Card>

              {/* Kad Admin override */}
              <Card className="p-4">
                <div className="text-sm font-semibold text-ink mb-3">Admin override</div>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <button
                    type="button"
                    disabled={item.status === "approved"}
                    onClick={() => setPilihanStatus("approved")}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-40 ${
                      pilihanStatus === "approved"
                        ? "bg-green-600 text-white ring-2 ring-green-600 ring-offset-2"
                        : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                    }`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={item.status === "rejected"}
                    onClick={() => setPilihanStatus("rejected")}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-40 ${
                      pilihanStatus === "rejected"
                        ? "bg-red-600 text-white ring-2 ring-red-600 ring-offset-2"
                        : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                    }`}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={item.status === "pending"}
                    onClick={() => setPilihanStatus("pending")}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-40 ${
                      pilihanStatus === "pending"
                        ? "bg-brand-purple text-white ring-2 ring-brand-purple ring-offset-2"
                        : "bg-white border border-hairline text-ink hover:bg-[#F7F7F9]"
                    }`}
                  >
                    Reset to pending
                  </button>
                </div>
                <textarea
                  rows={4}
                  maxLength={500}
                  value={alasan}
                  onChange={(e) => setAlasan(e.target.value)}
                  placeholder="Explain why this decision is being overridden"
                  className="w-full border border-hairline rounded-xl p-3 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
                  aria-label="Reason for the override"
                />
                <div className="flex items-center justify-between mt-1 mb-3">
                  <span className="text-xs text-ink-faint">{alasanBersih.length}/500</span>
                  <span className="text-xs text-ink-faint">Overrides are recorded in Audit.</span>
                </div>
                <button
                  type="button"
                  disabled={!bolehHantar}
                  onClick={hantar}
                  className="bg-brand-purple text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
                >
                  {menghantar ? "Applying..." : "Apply override"}
                </button>
                {mesej && (
                  <div
                    className={`mt-3 text-sm rounded-lg px-3 py-2 inline-block ${
                      mesej.baik
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {mesej.teks}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [muat, setMuat] = useState(true);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const reload = useCallback(async () => {
    try {
      const [s, ch, hu, p] = await Promise.all([
        adminListAllSubmissions(),
        adminListAllChallenges(),
        adminListAllHunts(),
        adminListProfiles(),
      ]);
      setSubs(s);
      setChallenges(ch);
      setHunts(hu);
      setProfiles(p);
    } catch {
      // RLS menolak pembacaan bukan admin; halaman kekal kosong.
    } finally {
      setMuat(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <AdminShell title="Moderation">
      <p className="text-ink-muted text-sm mb-6">Review answers and override educator decisions when needed.</p>
      {muat ? (
        <div className="text-sm text-ink-faint py-8">Loading...</div>
      ) : (
        <Suspense fallback={<div className="text-sm text-ink-faint py-8">Loading...</div>}>
          <PanelModerasi
            subs={subs}
            challenges={challenges}
            hunts={hunts}
            profiles={profiles}
            onReload={reload}
          />
        </Suspense>
      )}
    </AdminShell>
  );
}
