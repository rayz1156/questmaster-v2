"use client";

/**
 * My certificates (peserta): senarai sijil sendiri, muat turun, pautan
 * pengesahan awam dan pengesahan nama sijil.
 *
 * Pengesahan nama: jika certificate_name_confirmed_at masih NULL dan peserta
 * ada kelas dengan templat sijil (RPC qm_certificate_classes_needing_name),
 * kad ini meminta nama yang dicetak. Kemas kini dibuat terus ke qm_profiles
 * melalui RLS (polisi self update; penjaga pelan 0027 tidak memin lajur ini).
 * Tiada em dash dalam mana-mana rentetan UI.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import ParticipantShell from "@/components/ParticipantShell";
import { supabase } from "@/lib/supabase";
import { authHeader } from "@/lib/peer-client";
import { statusSijil } from "@/lib/sijil/ui";

type Sijil = {
  id: string;
  code: string;
  name_snapshot: string;
  program_snapshot: string;
  issued_at: string;
  revoked_at: string | null;
};

type KelasNama = { class_id: string; class_name: string };

export default function CertificatesPage() {
  const [loading, setLoading] = useState(true);
  const [sijil, setSijil] = useState<Sijil[]>([]);
  const [perluNama, setPerluNama] = useState<KelasNama[]>([]);
  const [namaPaparan, setNamaPaparan] = useState("");
  const [namaDisahkan, setNamaDisahkan] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const muatSemula = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setLoading(false);
      return;
    }
    const uid = session.user.id;

    // Sijil sendiri melalui RLS (polisi p_cert_owner_read).
    const { data: certs } = await supabase
      .from("qm_certificates")
      .select("id, code, name_snapshot, program_snapshot, issued_at, revoked_at")
      .eq("participant_id", uid)
      .order("issued_at", { ascending: false });
    setSijil((certs as Sijil[]) ?? []);

    // Nama sijil semasa dan kelas yang memerlukan pengesahan nama.
    const { data: profil } = await supabase
      .from("qm_profiles")
      .select("display_name, certificate_name, certificate_name_confirmed_at")
      .eq("id", uid)
      .maybeSingle();
    setNamaPaparan(profil?.certificate_name ?? profil?.display_name ?? "");
    setNamaDisahkan(!!profil?.certificate_name_confirmed_at);

    const { data: perlu } = await supabase.rpc("qm_certificate_classes_needing_name");
    setPerluNama((perlu as KelasNama[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    muatSemula().catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [muatSemula]);

  const sahkanNama = async () => {
    const nama = namaPaparan.trim();
    if (!nama) {
      setMsg("Enter the name to print on your certificates.");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { error } = await supabase
      .from("qm_profiles")
      .update({
        certificate_name: nama,
        certificate_name_confirmed_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg(null);
    await muatSemula();
  };

  const muatTurun = async (s: Sijil) => {
    const res = await fetch(`/api/certificates/${s.id}/download`, { headers: await authHeader() });
    if (!res.ok) {
      setMsg("Download is not ready yet. Please try again later.");
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
      <ParticipantShell>
        <div className="max-w-shell mx-auto px-6 py-10 text-slate-500">Loading...</div>
      </ParticipantShell>
    );
  }

  return (
    <ParticipantShell>
      <div className="max-w-shell mx-auto px-6 py-10">
        <div className="eyebrow mb-1">Certificates</div>
        <h1 className="page-title mb-1">My certificates</h1>
        <p className="page-subtitle mb-8">
          Certificates issued to you by your educators.
        </p>

        {msg && <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm">{msg}</div>}

        {/* Kad pengesahan nama */}
        {!namaDisahkan && perluNama.length > 0 && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-8">
            <h2 className="font-semibold mb-1">Confirm the name to print on your certificates</h2>
            <p className="text-sm text-slate-600 mb-3">
              Your educator will issue certificates for{" "}
              {perluNama.map((k) => k.class_name).join(", ")}. Confirm how your name
              should appear before it is printed.
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                className="input"
                value={namaPaparan}
                onChange={(e) => setNamaPaparan(e.target.value)}
                placeholder="Name on certificate"
              />
              <button className="btn-primary" onClick={sahkanNama}>
                <ShieldCheck className="w-4 h-4" /> Confirm
              </button>
            </div>
          </div>
        )}

        {sijil.length === 0 ? (
          <div className="rounded-xl border border-hairline p-8 text-center text-slate-500">
            No certificates yet. Your educator will issue them when you qualify.
          </div>
        ) : (
          <div className="space-y-3">
            {sijil.map((s) => {
              const st = statusSijil(s.revoked_at);
              return (
                <div key={s.id} className="rounded-xl border border-hairline bg-white p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.program_snapshot}</div>
                    <div className="text-sm text-slate-500">
                      {s.name_snapshot} · {new Date(s.issued_at).toLocaleDateString()} ·{" "}
                      <span className="font-mono">{s.code}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${st.kelas}`}>{st.label}</span>
                    <button className="btn-quiet" onClick={() => muatTurun(s)} disabled={!!s.revoked_at}>
                      <Download className="w-4 h-4" /> Download
                    </button>
                    <Link href={`/sijil/${s.code}`} className="btn-quiet" target="_blank">
                      Verify
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ParticipantShell>
  );
}