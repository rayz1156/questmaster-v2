"use client";

// Moderation ruang kerja admin, rupa v3 (KZ-024). Dua panel: senarai kiri item
// submission mengikut tab Pending/Reviewed/All (jawapan benih SEED::
// dikecualikan oleh tapisModerasi), panel kanan butiran item terpilih
// termasuk kad Admin override beralasan melalui RPC qm_admin_override_submission.
// Pemilihan awal boleh datang daripada ?id= (pautan Review dari butiran
// aktiviti). Audit ditulis oleh RPC di pelayan, bukan oleh klien.
// Komponen kit: Card, CardHead, Badge, Button, Textarea, Alert, Pagination;
// data, panggilan RPC dan pengendali tidak berubah.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Inbox } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Tabs, relTime } from "@/components/admin/ui";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  PageHead,
  Pagination,
  Textarea,
} from "@/components/ui";
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
import { useBahasa } from "@/lib/i18n/BahasaProvider";

const SEBARIS = 50;

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
  const { t, bahasa } = useBahasa();

  // Lencana status submission mengikut warna piawai admin (kit Badge),
  // label melalui kamus; nilai status DB kekal.
  const pilStatus = (status: Submission["status"]) => {
    if (status === "approved")
      return (
        <Badge variant="dim" warna="green">
          {t("admin.moderation.statusApproved")}
        </Badge>
      );
    if (status === "rejected")
      return (
        <Badge variant="dim" warna="red">
          {t("admin.moderation.statusRejected")}
        </Badge>
      );
    return (
      <Badge variant="dim" warna="yellow">
        {t("admin.moderation.statusPending")}
      </Badge>
    );
  };

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
    if (!uid) return t("admin.unnamedUser");
    return profById.get(uid)?.display_name || t("admin.unnamedUser");
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
      setMesej({ baik: true, teks: t("admin.moderation.appliedMsg") });
      setAlasan("");
      setPilihanStatus(null);
      onReload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.moderation.failedMsg")) });
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
        items={TAB_MODERASI.map((tabM) => ({
          key: tabM.key,
          label:
            tabM.key === "pending"
              ? t("admin.moderation.tabPending")
              : tabM.key === "reviewed"
                ? t("admin.moderation.tabReviewed")
                : t("admin.moderation.tabAll"),
          count: kiraan[tabM.key],
        }))}
        value={tab}
        onChange={(k) => {
          setTab(k as TabModerasi);
          setMuka(1);
        }}
      />

      <div className="mt-4 grid lg:grid-cols-5 gap-5 items-start">
        {/* ===== Senarai kiri ===== */}
        <Card padat className="lg:col-span-2">
          {/* Baris senarai membawa border-t sendiri; kepala tidak perlu
              border-b supaya garis tidak berganda. */}
          <div className="px-6 py-4">
            <CardHead title={t("admin.moderation.answers")} subtitle={t("admin.showingOf", { mula, akhir, jumlah })} />
          </div>
          {barisMuka.map((s) => {
            const ch = chById.get(s.challenge_id);
            const hu = ch ? huntById.get(ch.hunt_id) : null;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pilih(s.id)}
                className={`w-full text-left px-6 py-4 border-t border-kz-line transition ${
                  dipilih === s.id ? "bg-kz-accent-soft" : "hover:bg-[#f8f9fc]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-ink truncate">{namaProfil(s.user_id)}</span>
                  {pilStatus(s.status)}
                </div>
                <div className="text-[12px] text-ink-muted truncate mt-0.5">{ch?.title || t("admin.moderation.challenge")}</div>
                <div className="text-[12px] text-ink-faint truncate">{hu?.title || t("admin.moderation.activity")}</div>
                <div className="text-[12px] text-ink-faint mt-0.5">{relTime(s.created_at, undefined, bahasa)}</div>
              </button>
            );
          })}

          {jumlah === 0 && tab === "pending" && (
            <EmptyState
              icon={<ClipboardList className="w-6 h-6" />}
              title={t("admin.moderation.noPendingTitle")}
              text={t("admin.moderation.noPendingText")}
            />
          )}
          {jumlah === 0 && tab !== "pending" && (
            <EmptyState icon={<Inbox className="w-6 h-6" />} title={t("admin.moderation.emptyTitle")} />
          )}

          {jumlah > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap px-6 py-4 border-t border-kz-line">
              <span className="text-[12px] text-ink-faint whitespace-nowrap">
                {t("admin.showingOf", { mula, akhir, jumlah })}
              </span>
              <Pagination halaman={muka} jumlah={Math.ceil(jumlah / SEBARIS)} onHalaman={setMuka} />
            </div>
          )}
        </Card>

        {/* ===== Panel kanan butiran ===== */}
        <div className="lg:col-span-3 space-y-5">
          {!item ? (
            <Card>
              <EmptyState
                icon={<Inbox className="w-6 h-6" />}
                title={t("admin.moderation.selectTitle")}
                text={t("admin.moderation.selectText")}
              />
            </Card>
          ) : (
            <>
              {/* Kepala item */}
              <Card>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      href={`/admin/users/${item.user_id}`}
                      className="text-[14px] font-bold text-ink hover:text-brand-purple truncate"
                    >
                      {namaProfil(item.user_id)}
                    </Link>
                    {pilStatus(item.status)}
                  </div>
                  <span className="text-[12px] text-ink-faint">{relTime(item.created_at, undefined, bahasa)}</span>
                </div>
                <div className="text-[12px] text-ink-faint mt-1">
                  {itemHunt ? (
                    <Link href={`/admin/hunts/${itemCh?.hunt_id}`} className="text-brand-purple hover:underline">
                      {itemHunt.title}
                    </Link>
                  ) : (
                    t("admin.moderation.activity")
                  )}
                </div>
              </Card>

              {/* Soalan dan jawapan */}
              <Card>
                <CardHead title={t("admin.moderation.challenge")} />
                <div className="text-[14px] font-bold text-ink mt-3">{itemCh?.title || t("admin.moderation.challenge")}</div>
                {itemCh?.prompt && (
                  <p className="text-[14px] text-ink-muted whitespace-pre-wrap mt-2">{itemCh.prompt}</p>
                )}
                <div className="text-[12px] text-ink-muted mt-3">
                  {t("admin.moderation.worth")} <span className="font-bold text-ink">{Number(itemCh?.points) || 0}</span> {t("admin.moderation.pointsWord")}
                </div>

                <div className="border-t border-kz-line mt-4 pt-4">
                  <CardHead title={t("admin.huntDetail.colAnswer")} />
                  {tokenJawapan(item.answer).length === 0 ? (
                    <p className="text-[14px] text-ink-faint mt-2">{t("admin.moderation.noAnswerText")}</p>
                  ) : (
                    <p className="text-[14px] text-ink whitespace-pre-wrap break-words mt-2">
                      {tokenJawapan(item.answer).map((tok, i) =>
                        tok.jenis === "url" ? (
                          <a
                            key={i}
                            href={tok.nilai}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-purple hover:underline underline underline-offset-2 break-all"
                          >
                            {tok.nilai}
                          </a>
                        ) : (
                          <span key={i}>{tok.nilai}</span>
                        ),
                      )}
                    </p>
                  )}
                  <div className="text-[12px] text-ink-faint mt-3">{t("admin.moderation.submitted")} {relTime(item.created_at, undefined, bahasa)}</div>
                </div>
              </Card>

              {/* Keputusan pendidik semasa */}
              <Card>
                <CardHead title={t("admin.moderation.educatorDecision")} />
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {pilStatus(item.status)}
                  <span className="text-[14px] text-ink-muted">
                    {item.status === "pending"
                      ? t("admin.moderation.waitingReview")
                      : item.reviewed_by
                        ? t("admin.moderation.reviewedBy", { nama: namaProfil(item.reviewed_by) })
                        : t("admin.moderation.noReviewer")}
                  </span>
                </div>
                <div className="text-[12px] text-ink-faint mt-1">{t("admin.moderation.currentDecision")}</div>
              </Card>

              {/* Kad Admin override */}
              <Card>
                <CardHead title={t("admin.moderation.adminOverride")} />
                <div className="flex items-center gap-2 flex-wrap mt-4 mb-4">
                  <Button
                    disabled={item.status === "approved"}
                    onClick={() => setPilihanStatus("approved")}
                    variant={pilihanStatus === "approved" ? "primary" : "dim"}
                    warna="green"
                    className={pilihanStatus === "approved" ? "ring-2 ring-kz-up ring-offset-2" : ""}
                  >
                    {t("admin.moderation.approve")}
                  </Button>
                  <Button
                    disabled={item.status === "rejected"}
                    onClick={() => setPilihanStatus("rejected")}
                    variant={pilihanStatus === "rejected" ? "primary" : "dim"}
                    warna="red"
                    className={pilihanStatus === "rejected" ? "ring-2 ring-kz-down ring-offset-2" : ""}
                  >
                    {t("admin.moderation.reject")}
                  </Button>
                  <Button
                    disabled={item.status === "pending"}
                    onClick={() => setPilihanStatus("pending")}
                    variant={pilihanStatus === "pending" ? "primary" : "outline"}
                    className={pilihanStatus === "pending" ? "ring-2 ring-brand-purple ring-offset-2" : ""}
                  >
                    {t("admin.moderation.resetPending")}
                  </Button>
                </div>
                <Textarea
                  rows={4}
                  maxLength={500}
                  value={alasan}
                  onChange={(e) => setAlasan(e.target.value)}
                  placeholder={t("admin.moderation.reasonPlaceholder")}
                  aria-label={t("admin.moderation.reasonAria")}
                  className="resize-none"
                />
                <div className="flex items-center justify-between mt-1.5 mb-4">
                  <span className="text-[12px] text-ink-faint">{alasanBersih.length}/500</span>
                  <span className="text-[12px] text-ink-faint">{t("admin.moderation.auditNote")}</span>
                </div>
                <Button disabled={!bolehHantar} onClick={hantar}>
                  {menghantar ? t("admin.moderation.applying") : t("admin.moderation.applyOverride")}
                </Button>
                {mesej && (
                  <Alert tone={mesej.baik ? "success" : "danger"} className="mt-4">
                    {mesej.teks}
                  </Alert>
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
  const { t } = useBahasa();
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
    <AdminShell>
      <PageHead
        title={t("admin.moderation.title")}
        description={t("admin.moderation.description")}
      />
      {muat ? (
        <div className="text-sm text-ink-faint py-8">{t("common.loadingDots")}</div>
      ) : (
        <Suspense fallback={<div className="text-sm text-ink-faint py-8">{t("common.loadingDots")}</div>}>
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
