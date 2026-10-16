"use client";

/**
 * My certificates (peserta): senarai sijil sendiri, rupa v3 KZ-023.
 *
 * Kad sijil dalam grid guna Card kit dengan butang muat turun dan
 * pautan pengesahan awam yang sama seperti sebelum ini.
 *
 * Pengesahan nama: jika certificate_name_confirmed_at masih NULL dan
 * peserta ada kelas dengan templat sijil (RPC
 * qm_certificate_classes_needing_name), kad ini meminta nama yang
 * dicetak. Kemas kini dibuat terus ke qm_profiles melalui RLS (polisi
 * self update; penjaga pelan 0027 tidak memin lajur ini).
 * Tiada em dash dalam mana-mana rentetan UI.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Award, Download, ShieldCheck } from "lucide-react";
import ParticipantShell from "@/components/ParticipantShell";
import { supabase } from "@/lib/supabase";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  CardSection,
  EmptyState,
  Field,
  Input,
  PageHead,
} from "@/components/ui";
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
        <p className="text-[14px] text-ink-faint">Loading...</p>
      </ParticipantShell>
    );
  }

  return (
    <ParticipantShell>
      <PageHead
        title="My certificates"
        description="Certificates issued to you by your educators."
      />

      {msg && <Alert tone="info" className="mb-4">{msg}</Alert>}

      {/* Kad pengesahan nama */}
      {!namaDisahkan && perluNama.length > 0 && (
        <Card className="mb-7">
          <CardHead
            title="Confirm the name to print on your certificates"
            subtitle={
              <>
                Your educator will issue certificates for{" "}
                {perluNama.map((k) => k.class_name).join(", ")}. Confirm how your name
                should appear before it is printed.
              </>
            }
          />
          <div className="mt-4 flex gap-2 flex-wrap">
            <div className="min-w-[220px] flex-1 max-w-sm">
              <Field label="Name on certificate" htmlFor="nama-sijil">
                <Input
                  id="nama-sijil"
                  value={namaPaparan}
                  onChange={(e) => setNamaPaparan(e.target.value)}
                  placeholder="Name on certificate"
                />
              </Field>
            </div>
            <Button onClick={sahkanNama} className="mt-[30px]">
              <ShieldCheck className="w-4 h-4" /> Confirm
            </Button>
          </div>
        </Card>
      )}

      {sijil.length === 0 ? (
        <div className="bg-white rounded-[4px] shadow-card">
          <EmptyState
            icon={<Award className="w-6 h-6" />}
            title="No certificates yet."
            text="Your educator will issue them when you qualify."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7">
          {sijil.map((s) => {
            const st = statusSijil(s.revoked_at);
            return (
              <Card key={s.id} padat className="flex flex-col">
                <div className="p-6">
                  <CardHead
                    title={s.program_snapshot}
                    subtitle={
                      <>
                        {s.name_snapshot} · {new Date(s.issued_at).toLocaleDateString()} ·{" "}
                        <span className="font-mono">{s.code}</span>
                      </>
                    }
                    right={
                      s.revoked_at ? (
                        <Badge variant="dim" warna="red">{st.label}</Badge>
                      ) : (
                        <Badge variant="dot" warna="green">{st.label}</Badge>
                      )
                    }
                  />
                </div>
                <CardSection baris className="mt-auto">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => muatTurun(s)}
                      disabled={!!s.revoked_at}
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                    <Link
                      href={`/sijil/${s.code}`}
                      target="_blank"
                      className="inline-flex items-center justify-center gap-2 rounded-[4px] border border-hairline bg-white h-8 px-3 text-[12px] font-bold tracking-[0.26px] text-ink-muted hover:bg-canvas transition"
                    >
                      Verify
                    </Link>
                  </div>
                </CardSection>
              </Card>
            );
          })}
        </div>
      )}
    </ParticipantShell>
  );
}
