"use client";

/**
 * Sijil (pendidik): templat, pratonton PDF, pengeluaran dan emel pukal.
 *
 * Bahagian:
 *   - Senarai templat dan borang cipta/sunting (tajuk, kriteria, latar/logo).
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
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, Eye, Mail, Plus, RefreshCw } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell, { type ClassTabKey } from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { getClass, type Klass } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { authHeader } from "@/lib/peer-client";
import { pelanSaya } from "@/lib/pelan";
import { useConfirm } from "@/components/ui/ConfirmProvider";

type Templat = {
  id: string;
  title: string;
  background_path: string | null;
  logo_path: string | null;
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

const MAX_ASET = 2 * 1024 * 1024;

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
        .select("id, title, background_path, logo_path, criteria")
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
        const [k, pl] = await Promise.all([getClass(classId), pelanSaya()]);
        if (!alive) return;
        setKlass(k as Klass);
        setPlan(pl?.pelan ?? "free");
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
      setMsg("Image must be 2 MB or smaller.");
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
    const ids = layak
      .filter((r) => tick[r.participant_id] && r.eligible && !r.already_issued)
      .map((r) => r.participant_id);
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

  const templatDipilih = templat.find((t) => t.id === pilihTemplat) ?? null;
  const bilanganTick = layak.filter((r) => tick[r.participant_id] && r.eligible && !r.already_issued).length;

  return (
    <Shell tabs={EDU_TABS}>
            <ClassShell classId={classId} current={"certificates" as ClassTabKey} klass={klass}>
        {msg && <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm">{msg}</div>}

        {/* Templat */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Certificate templates</h2>
          <button
            className="btn-primary"
            onClick={() => {
              setSunting(null);
              setTajuk("");
              setJenis("all_members");
              setBorangTerbuka(true);
            }}
          >
            <Plus className="w-4 h-4" /> New template
          </button>
        </div>

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
              <div key={t.id} className="rounded-xl border border-hairline bg-white p-4 flex items-start justify-between gap-4 flex-wrap">
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
                </div>
              </div>
            ))}
          </div>
        )}

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

