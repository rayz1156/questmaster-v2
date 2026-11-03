"use client";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from '@/lib/eduTabs';
import { useEffect, useMemo, useState } from "react";
import {Plus, Trash2, GraduationCap, Copy, User as UserIcon, Mail, Check, CopyPlus, Pin, PinOff} from "lucide-react";
import { listMyEducatorClasses, createClass, deleteClass, listMyClassEducatorInvites, acceptClassEducatorInviteByCode, duplicateClass, leaveClassAsEducator, listMyClassActivity, pinClass, unpinClass, type MyClassActivityRow } from "@/lib/data";
import type { EducatorClassRow, MyClassEducatorInvite } from "@/lib/types";
import { statusKelas, susunKelas, tapisKelas } from "@/lib/kelasStatus";
import { useConfirm } from '@/components/ui/ConfirmProvider';
import RowMenu from "@/components/ui/RowMenu";
import { pelanSaya, mesejHad, tanpaHad, HAD_PELAN, type RingkasanPelan } from "@/lib/pelan";
import HadPelanNotis from "@/components/HadPelanNotis";
import { HardDrive } from "lucide-react";
import { inisial, warnaIndeks } from "@/lib/papanPemukaPeserta";
import { useBahasa, type FungsiT } from "@/lib/i18n/BahasaProvider";
import { LOKAL } from "@/lib/i18n";

// Label peranan pendidik ikut bahasa skrin; nilai teknikal role tidak diubah.
function roleLabel(role: string, t: FungsiT): string {
  if (role === "owner") return t("educator.classes.roleOwner");
  if (role === "co-creator" || role === "co_creator") return t("educator.classes.roleCocreator");
  if (role === "co-educator" || role === "co_educator") return t("educator.classes.roleCoeducator");
  return role;
}

export default function EduClasses() {
  const [classes, setClasses] = useState<EducatorClassRow[]>([]);
  const confirm = useConfirm();
  const { t, bahasa } = useBahasa();
  const [invites, setInvites] = useState<MyClassEducatorInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pelan, setPelan] = useState<RingkasanPelan | null>(null);
  // V2-005: pin, tab Aktif/Tamat dan carian
  const [aktiviti, setAktiviti] = useState<MyClassActivityRow[]>([]);
  const [tab, setTab] = useState<"aktif" | "tamat">("aktif");
  const [cari, setCari] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [cls, inv, pl, ak] = await Promise.all([
        listMyEducatorClasses(),
        listMyClassEducatorInvites(),
        pelanSaya(),
        listMyClassActivity().catch(() => [] as MyClassActivityRow[]),
      ]);
      setClasses(cls);
      setInvites(inv);
      setPelan(pl);
      setAktiviti(ak);
    } catch (e: any) {
      setErr(e.message || t("papanKelas.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const onCreate = async () => {
    setErr(null);
    if (!name.trim()) { setErr(t("educator.classes.nameRequired")); return; }
    setBusy(true);
    try {
      await createClass(name.trim(), desc.trim() || undefined, color);
      setName(""); setDesc(""); setShowNew(false);
      await reload();
    } catch (e: any) {
      setErr(mesejHad(e, t("educator.classes.createFailed")));
    } finally { setBusy(false); }
  };


  // --- Duplicate class state ---
  const [dupTarget, setDupTarget] = useState<EducatorClassRow | null>(null);
  const [dupTitle, setDupTitle] = useState('');
  const [dupLB, setDupLB] = useState(true);
  const [dupAct, setDupAct] = useState(true);
  const [dupMem, setDupMem] = useState(false);
  const [dupEdu, setDupEdu] = useState(true);
  const [dupTpl, setDupTpl] = useState(false);
  const [dupDraft, setDupDraft] = useState(true);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupErr, setDupErr] = useState<string | null>(null);
  const openDuplicate = (k: EducatorClassRow) => {
    setDupTarget(k);
    setDupTitle(t("educator.classes.dupCopyOf", { nama: k.name }));
    setDupLB(true); setDupAct(true); setDupMem(false); setDupEdu(true);
    setDupTpl(false); setDupDraft(true);
    setDupErr(null);
  };
  const onDuplicate = async () => {
    if (!dupTarget) return;
    setDupErr(null); setDupBusy(true);
    try {
      const res = await duplicateClass(dupTarget.id, {
        newTitle: dupTitle.trim() || undefined,
        copyLearningBoard: dupLB,
        copyActivities: dupAct,
        copyMembers: dupMem,
        copyEducators: dupEdu,
        asTemplate: dupTpl,
        asDraft: dupDraft,
      });
      setDupTarget(null);
      await reload();
      alert(t("educator.classes.dupCreated", {
        nama: res.name,
        lajur: res.copied.columns,
        kad: res.copied.cards,
        aktiviti: res.copied.hunts,
        ahli: res.copied.members,
        pendidik: res.copied.educators,
      }));
    } catch (e: any) {
      setDupErr(e?.message || t("educator.classes.dupFailed"));
    } finally { setDupBusy(false); }
  };

  const onLeave = async (k: EducatorClassRow) => {
    if (k.role === "owner") return;
    if (!(await confirm({ title: t("educator.classes.leaveTitle", { nama: k.name }), description: t("educator.classes.leaveDesc"), tone: "danger", confirmLabel: t("educator.classes.leaveLabel") }))) return;
    try {
      await leaveClassAsEducator(k.id);
      await reload();
    } catch (e: any) {
      alert(e?.message || t("educator.classes.leaveFailed"));
    }
  };

  const onDelete = async (k: EducatorClassRow) => {
    if (k.role !== "owner") return;
    if (!(await confirm({ title: t("educator.classes.deleteTitle", { nama: k.name }), tone: 'danger' }))) return;
    try {
      await deleteClass(k.id);
      await reload();
    } catch (e: any) {
      alert(e.message || t("educator.classes.deleteFailed"));
    }
  };

  // V2-005: semat atau tanggalkan sematan kelas. Had 3 pin dikira daripada
// baris aktiviti; pada had, item Pin masih dipaparkan tetapi mesej jelas
// ditunjukkan. Ralat pangkalan data (contoh perlumbaan pada had) dipaparkan
// juga kerana pencetus mungkin menolak walaupun kiraan klien belum sampai 3.
const onPinToggle = async (k: EducatorClassRow) => {
    const sudahPin = aktiviti.some(a => a.class_id === k.id && a.pinned);
    if (!sudahPin && aktiviti.filter(a => a.pinned).length >= 3) {
      setPinMsg(t("educator.classes.pinLimit"));
      return;
    }
    try {
      if (sudahPin) { await unpinClass(k.id); } else { await pinClass(k.id); }
      setPinMsg(null);
      setAktiviti(await listMyClassActivity());
    } catch (e: any) {
      setPinMsg(/Pin limit reached/i.test(e?.message || "")
        ? t("educator.classes.pinLimit")
        : e?.message || t("educator.classes.pinFailed"));
    }
  };

  const onAcceptInvite = async (code: string) => {
    setInviteBusy(code);
    setInviteMsg(null);
    try {
      await acceptClassEducatorInviteByCode(code);
      setInviteMsg({ type: "ok", text: t("educator.classes.inviteAccepted") });
      await reload();
    } catch (e: any) {
      setInviteMsg({ type: "err", text: e?.message || t("educator.classes.inviteAcceptFailed") });
    } finally {
      setInviteBusy(null);
    }
  };

  // Terbitan V2-005: pin, kelas mengikut status, tapisan carian.
  const pinnedIds = useMemo(() => new Set(aktiviti.filter(a => a.pinned).map(a => a.class_id)), [aktiviti]);
  const kelasAktif = useMemo(() => susunKelas(classes.filter(k => statusKelas(k) === "aktif"), aktiviti), [classes, aktiviti]);
  const kelasTamat = useMemo(() => susunKelas(classes.filter(k => statusKelas(k) === "tamat"), aktiviti), [classes, aktiviti]);
  // Medan carian hanya muncul apabila jumlah semua kelas melebihi 8.
  const carianAktif = classes.length > 8;
  const senaraiTab = tab === "aktif" ? kelasAktif : kelasTamat;
  const senaraiPapar = carianAktif ? tapisKelas(senaraiTab, cari) : senaraiTab;

  // Menu "..." setiap baris kelas (KZ-020): tindakan sedia ada daripada
  // kad V2-005, ditambah "Copy class code" yang dahulunya butang Copy.
  const menuTindakan = (k: EducatorClassRow, dipin: boolean) => [
    ...(dipin
      ? [{ label: t("educator.classes.menuUnpin"), icon: <PinOff className="w-4 h-4"/>, onSelect: () => onPinToggle(k) }]
      : [{ label: t("educator.classes.menuPin"), icon: <Pin className="w-4 h-4"/>, onSelect: () => onPinToggle(k) }]),
    { label: t("educator.classes.menuCopyCode"), icon: <Copy className="w-4 h-4"/>, onSelect: () => navigator.clipboard.writeText(k.join_code) },
    ...(k.role === "owner" ? [
      { label: t("educator.classes.menuDuplicate"), icon: <CopyPlus className="w-4 h-4"/>, onSelect: () => openDuplicate(k) },
      { label: t("educator.classes.menuDelete"), icon: <Trash2 className="w-4 h-4"/>, danger: true, onSelect: () => onDelete(k) },
    ] : [
      { label: t("educator.classes.menuLeave"), icon: <UserIcon className="w-4 h-4"/>, danger: true, onSelect: () => onLeave(k) },
    ]),
  ];

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="page-title">{t("educator.classes.title")}</h1>
          <p className="page-subtitle">{t("educator.classes.subtitle")}</p>
        </div>
        <button onClick={() => setShowNew(s => !s)} className="btn-primary"><Plus className="w-4 h-4"/> {t("educator.classes.newClass")}</button>
      </div>

      {invites.length > 0 && (
        <div className="surface p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-brand-purple"/>
            <div className="font-semibold text-ink">{t("educator.classes.invitedCoteach")}</div>
          </div>
          <p className="text-sm text-ink-muted mb-4">{t("educator.classes.invitedDesc")}</p>
          {inviteMsg && (
            <div className={`text-sm mb-3 ${inviteMsg.type === "ok" ? "text-[#2E7D4F]" : "text-red-600"}`}>{inviteMsg.text}</div>
          )}
          <div className="space-y-1">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-2.5 border-t border-hairline first:border-0">
                <span className="w-8 h-8 rounded-lg shrink-0" style={{ background: i.class_color || "#7057D9" }}/>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink truncate">{i.class_name}</div>
                  <div className="text-xs text-ink-faint truncate">{t("educator.classes.invitedBy", {
                    nama: i.inviter_name || t("educator.classes.anotherEducator"),
                    tarikh: new Date(i.expires_at).toLocaleDateString(LOKAL[bahasa]),
                  })}</div>
                </div>
                <code className="code-chip text-xs hidden sm:block">{i.code}</code>
                <button disabled={inviteBusy === i.code} onClick={() => onAcceptInvite(i.code)} className="btn-secondary py-1.5 px-3 text-sm"><Check className="w-4 h-4"/> {t("educator.classes.accept")}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pelan && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${pelan.pelan === "free" ? "bg-[#F3F2F7] text-ink-muted border border-hairline" : "bg-violet-50 text-brand-purple border border-violet-200"}`}>
            {pelan.pelan === "pro" ? t("educator.classes.planPro") : pelan.pelan === "institution" ? t("educator.classes.planInstitution") : pelan.pelan === "unlimited" ? t("educator.classes.planUnlimited") : t("educator.classes.planFree")}
          </span>
          <span className="text-ink-muted">
            {tanpaHad(pelan.hadKelas)
              ? t("educator.classes.classesUsed", { guna: pelan.kelasDigunakan })
              : t("educator.classes.classesOfUsed", { guna: pelan.kelasDigunakan, had: pelan.hadKelas ?? 0 })}
          </span>
          {!tanpaHad(pelan.hadKelas) && pelan.kelasDigunakan >= (pelan.hadKelas ?? 0) && (
            <HadPelanNotis pesan={t("educator.classes.planNotice")} />
          )}
        </div>
      )}

      {/* Kad Storage (tiket V2-002b): bar kemajuan kuota, amaran jingga pada
          80%, dan senarai had kelas, aktiviti dan papan pelan semasa. */}
      {pelan && <KadStoran pelan={pelan} />}

      {showNew && (
        <div className="surface p-5 mb-6">
          <div className="font-semibold text-ink mb-4">{t("educator.classes.createTitle")}</div>
          <label className="block text-sm font-medium text-ink mb-1.5">{t("educator.classes.nameLabel")}</label>
          <input className="input mb-4" placeholder={t("educator.classes.namePlaceholder")} value={name} onChange={e => setName(e.target.value)}/>
          <label className="block text-sm font-medium text-ink mb-1.5">{t("educator.classes.descriptionLabel")} <span className="text-ink-faint font-normal">{t("educator.classes.optional")}</span></label>
          <input className="input mb-4" placeholder={t("educator.classes.descPlaceholder")} value={desc} onChange={e => setDesc(e.target.value)}/>
          <div className="flex items-center gap-3">
            <label className="text-sm text-ink-muted">{t("educator.classes.colourLabel")}</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-9 h-9 rounded-lg border border-hairline bg-white p-0.5"/>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">{t("common.cancel")}</button>
              <button type="button" disabled={busy} onClick={onCreate} className="btn-primary">{busy ? t("educator.classes.creating") : t("educator.classes.createButton")}</button>
            </div>
          </div>
          {err && <div className="text-sm text-red-600 mt-3">{err}</div>}
        </div>
      )}

      {!showNew && err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      {loading ? (
        <p className="text-sm text-ink-muted">{t("common.loading")}</p>
      ) : classes.length === 0 ? (
        <div className="surface py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-6 h-6 text-brand-purple"/>
          </div>
          <div className="section-title mb-1">{t("educator.classes.startTitle")}</div>
          <p className="text-sm text-ink-muted mb-5">{t("educator.classes.startText")}</p>
          <button onClick={() => setShowNew(true)} className="btn-primary">{t("educator.classes.createFirst")}</button>
        </div>
      ) : (
        <>
          {/* Tab Active/Ended dan mesej pin (V2-005) */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setTab("aktif")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                tab === "aktif"
                  ? "bg-violet-50 border border-violet-200 text-brand-purple"
                  : "bg-white border-hairline text-ink-muted hover:text-ink"
              }`}
            >
              {t("educator.classes.tabActive")} ({kelasAktif.length})
            </button>
            <button
              onClick={() => setTab("tamat")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                tab === "tamat"
                  ? "bg-violet-50 border border-violet-200 text-brand-purple"
                  : "bg-white border-hairline text-ink-muted hover:text-ink"
              }`}
            >
              {t("educator.classes.tabEnded")} ({kelasTamat.length})
            </button>
            {pinMsg && <span className="text-sm text-ink-muted">{pinMsg}</span>}
          </div>

          {carianAktif && (
            <input
              className="input mb-4"
              placeholder={t("educator.classes.searchPlaceholder")}
              value={cari}
              onChange={e => setCari(e.target.value)}
            />
          )}

          {senaraiPapar.length === 0 ? (
            <div className="surface py-12 text-center text-sm text-ink-muted">
              {t("educator.classes.noMatch", { cari })}
            </div>
          ) : (
            <>
              {/* Jadual gaya Students (desktop >= 768px). Logik tindakan
                  kekal sama; hanya rupa yang ditukar. */}
              <div className="surface hidden md:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="t-head">
                      <th className="px-6 py-4 font-normal">{t("educator.classes.colClass")}</th>
                      <th className="px-6 py-4 font-normal">{t("educator.classes.colStatus")}</th>
                      <th className="px-6 py-4 font-normal">{t("educator.classes.colCreated")}</th>
                      <th className="w-14" aria-label={t("educator.classes.colActions")} />
                    </tr>
                  </thead>
                  <tbody>
                    {senaraiPapar.map((k, i) => {
                      const tamat = statusKelas(k) === "tamat";
                      const dipin = pinnedIds.has(k.id);
                      const warna = warnaIndeks(i);
                      return (
                        <tr key={k.id} className="t-row">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] text-[14px] font-bold"
                                style={{
                                  backgroundColor: k.color || warna.latar,
                                  color: k.color ? "#fff" : warna.teks,
                                }}
                                aria-hidden="true"
                              >
                                {inisial(k.name)}
                              </span>
                              <div className="min-w-0">
                                <Link
                                  href={`/educator/classes/${k.id}`}
                                  className="flex items-center gap-1.5 text-[14px] font-medium text-ink hover:text-brand-purple transition"
                                >
                                  <span className="truncate">{k.name}</span>
                                  {dipin && <Pin className="w-3.5 h-3.5 fill-current text-brand-purple shrink-0" aria-label={t("educator.classes.pinned")}/>}
                                </Link>
                                <div className="text-xs text-ink-faint truncate">
                                  {t("educator.classes.codeRole", { kod: k.join_code, peranan: roleLabel(k.role, t) })}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${tamat ? "bg-kz-down" : "bg-kz-up"}`}
                                aria-hidden="true"
                              />
                              {tamat ? t("educator.classes.statusEnded") : t("educator.classes.statusActive")}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-[13px] text-ink-muted">
                            {new Date(k.created_at).toLocaleDateString(LOKAL[bahasa])}
                          </td>
                          <td className="px-6 py-4 text-right align-middle">
                            <RowMenu items={menuTindakan(k, dipin)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Bar bawah jadual: kiraan dan penombolan berkotak.
                    Semua kelas muat satu halaman (tiada API penombolan),
                    jadi Prev/Next dilumpuhkan jujur. */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-kz-line px-6 py-3">
                  <span className="text-[13px] text-ink-faint">
                    {t("educator.classes.showing", { papar: senaraiPapar.length, jumlah: senaraiPapar.length })}
                  </span>
                  <div className="flex items-center gap-1" aria-label={t("educator.classes.pagination")}>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-hairline text-[13px] text-ink-faint opacity-50">‹</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] bg-brand-purple text-[13px] font-bold text-white">1</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-hairline text-[13px] text-ink-faint opacity-50">›</span>
                  </div>
                </div>
              </div>

              {/* Telefon: senarai kad, bukan jadual. */}
              <div className="flex flex-col gap-3 md:hidden">
                {senaraiPapar.map((k, i) => {
                  const tamat = statusKelas(k) === "tamat";
                  const dipin = pinnedIds.has(k.id);
                  const warna = warnaIndeks(i);
                  return (
                    <div key={k.id} className="card p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] text-[14px] font-bold"
                          style={{
                            backgroundColor: k.color || warna.latar,
                            color: k.color ? "#fff" : warna.teks,
                          }}
                          aria-hidden="true"
                        >
                          {inisial(k.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                          href={`/educator/classes/${k.id}`}
                          className="flex items-center gap-1.5 text-[14px] font-medium text-ink hover:text-brand-purple transition"
                          >
                          <span className="truncate">{k.name}</span>
                          {dipin && <Pin className="w-3.5 h-3.5 fill-current text-brand-purple shrink-0" aria-label={t("educator.classes.pinned")}/>}
                          </Link>
                          <div className="text-xs text-ink-faint truncate">
                          {t("educator.classes.codeRole", { kod: k.join_code, peranan: roleLabel(k.role, t) })}
                          </div>
                          </div>
                          <RowMenu items={menuTindakan(k, dipin)} />
                          </div>
                          <div className="mt-3 flex items-center justify-between text-[13px] text-ink-muted">
                          <span className="inline-flex items-center gap-1.5">
                          <span
                          className={`h-1.5 w-1.5 rounded-full ${tamat ? "bg-kz-down" : "bg-kz-up"}`}
                          aria-hidden="true"
                          />
                          {tamat ? t("educator.classes.statusEnded") : t("educator.classes.statusActive")}
                          </span>
                          <span>{new Date(k.created_at).toLocaleDateString(LOKAL[bahasa])}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      {dupTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !dupBusy && setDupTarget(null)}>
          <div onClick={(e)=>e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">{t("educator.classes.dupTitle")}</h3>
              <button onClick={()=>setDupTarget(null)} disabled={dupBusy} className="text-gray-500 hover:text-gray-900">✕</button>
            </div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t("educator.classes.dupNewTitle")}</label>
            <input value={dupTitle} onChange={(e)=>setDupTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={t("educator.classes.dupCopyOf", { nama: dupTarget.name })} />
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupLB} onChange={(e)=>setDupLB(e.target.checked)} className="rounded"/> {t("educator.classes.dupCopyLearningBoard")}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupAct} onChange={(e)=>setDupAct(e.target.checked)} className="rounded"/> {t("educator.classes.dupCopyActivities")}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupMem} onChange={(e)=>setDupMem(e.target.checked)} className="rounded"/> {t("educator.classes.dupCopyMembers")}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupEdu} onChange={(e)=>setDupEdu(e.target.checked)} className="rounded"/> {t("educator.classes.dupCopyEducators")}</label>
            </div>
            <details className="mb-4">
              <summary className="text-xs font-medium text-gray-700 cursor-pointer select-none">{t("educator.classes.dupAdvanced")}</summary>
              <div className="mt-2 space-y-2 pl-1">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupTpl} onChange={(e)=>setDupTpl(e.target.checked)} className="rounded"/> {t("educator.classes.dupTemplate")} <span className="text-xs text-gray-500">{t("educator.classes.dupTemplateNote")}</span></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dupDraft} onChange={(e)=>setDupDraft(e.target.checked)} className="rounded"/> {t("educator.classes.dupDraft")} <span className="text-xs text-gray-500">{t("educator.classes.dupDraftNote")}</span></label>
              </div>
            </details>
            {dupErr && <div className="text-xs text-red-600 mb-2">{dupErr}</div>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={()=>setDupTarget(null)} disabled={dupBusy} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm">{t("common.cancel")}</button>
              <button onClick={onDuplicate} disabled={dupBusy} className="btn-primary py-1.5 px-3 text-sm">{dupBusy ? t("educator.classes.duplicating") : t("educator.classes.duplicate")}</button>
            </div>
          </div>
        </div>
      )}

    </Shell>
  );
}

/** Bar kemajuan kuota storan + senarai had pelan (tiket V2-002b). */
function KadStoran({ pelan }: { pelan: RingkasanPelan }) {
  const { t } = useBahasa();
  const had = HAD_PELAN[pelan.pelan];
  const usedMb = (pelan.storageDigunakanBytes ?? 0) / (1024 * 1024);
  // Pelan unlimited (storageMb null): tiada kuota, tiada bar amaran.
  const tanpaHadStoran = had.storageMb === null;
  const pct = tanpaHadStoran
    ? 0
    : Math.min(100, had.storageMb! > 0 ? (usedMb / had.storageMb!) * 100 : 0);
  const hampirPenuh = !tanpaHadStoran && pct >= 80;
  const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <HardDrive className="w-4 h-4 text-brand-purple" />
        <div className="font-semibold text-ink text-sm">{t("educator.classes.storageTitle")}</div>
        <span className="ml-auto text-xs text-ink-muted">
          {had.storageMb === null
            ? t("educator.classes.storageUnlimited", { guna: fmt(usedMb) })
            : t("educator.classes.storageOf", { guna: fmt(usedMb), had: had.storageMb })}
        </span>
      </div>
      {had.storageMb !== null && (
        <div className="w-full h-2 rounded-full bg-white border border-violet-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${hampirPenuh ? "bg-amber-500" : "bg-gradient-to-r from-violet-600 to-indigo-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {hampirPenuh && (
        <div className="text-xs text-amber-600 mt-2">
          {t("educator.classes.storageWarning", { peratus: Math.round(pct) })}
        </div>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-ink-muted">
        <span>{t("educator.classes.storageClasses", { guna: pelan.kelasDigunakan, had: tanpaHad(pelan.hadKelas) ? t("educator.classes.unlimited") : pelan.hadKelas ?? 0 })}</span>
        <span>{t("educator.classes.storageActivities", { guna: pelan.aktivitiDigunakan ?? 0, had: had.aktiviti === null ? t("educator.classes.unlimited") : had.aktiviti })}</span>
        <span>{t("educator.classes.storageBoards", { guna: pelan.papanDigunakan ?? 0, had: had.papan === null ? t("educator.classes.unlimited") : had.papan })}</span>
      </div>
    </div>
  );
}
