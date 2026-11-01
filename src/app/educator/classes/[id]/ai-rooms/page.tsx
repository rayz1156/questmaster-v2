"use client";
/**
 * /educator/classes/[id]/ai-rooms: senarai dan cipta Bilik AI untuk satu
 * kelas (KZ-033 fasa 1).
 *
 * Guru (pemilik kelas atau ko-pendidik diterima) boleh mencipta,
 * menutup dan memadam bilik. Peserta kelas boleh melihat senarai
 * tetapi API menolak ciptaan mereka (laluan POST menyemak peranan di
 * pelayan). Setiap kad membawa kod masuk 6 aksara, pautan salin
 * (https://kuizen.fun/bilik/<KOD>) dan QR yang dijana di pelayar
 * dengan pakej qrcode (laluan QR kuiz langsung hanya melukis URL
 * /live/<code>, jadi ia tidak boleh diguna semula untuk /bilik).
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Bot, Copy, QrCode, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  Alert,
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

interface ModelUi {
  id: string;
  label: string;
  is_default: boolean;
  model_id: string;
  sort_order: number;
}

interface BilikUi {
  id: string;
  title: string;
  description: string | null;
  join_code: string;
  status: string;
  ai_enabled: boolean;
  context_enabled: boolean;
  context_window: number;
  model_id: string | null;
  created_at: string;
  updated_at: string;
  qm_ai_models?: { label: string } | null;
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

export default function HalamanBilikAiKelas() {
  const params = useParams<{ id: string }>();
  const id = String(params.id || "");
  const confirm = useConfirm();

  const [rooms, setRooms] = useState<BilikUi[]>([]);
  const [models, setModels] = useState<ModelUi[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [sedia, setSedia] = useState(false);

  const [tajuk, setTajuk] = useState("");
  const [penerangan, setPenerangan] = useState("");
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);

  const [qr, setQr] = useState<{ bilik: BilikUi; dataUrl: string } | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await baca(`/api/classes/${id}/ai-rooms`);
      const j = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) {
        setErr(String(j?.error ?? "Senarai bilik tidak dapat dibaca."));
        setSedia(true);
        return;
      }
      setRooms((j?.rooms ?? []) as BilikUi[]);
      setErr("");
      // Model untuk pemilih bilik baharu.
      const rm = await baca("/api/ai-models");
      const jm = await rm.json().catch(() => ({}) as Record<string, unknown>);
      if (rm.ok) {
        const senarai = (jm?.models ?? []) as ModelUi[];
        setModels(senarai);
        if (!modelId) {
          const lalai = senarai.find((m) => m.is_default);
          setModelId(lalai ? lalai.id : "");
        }
      }
    } catch {
      setErr("Senarai bilik tidak dapat dibaca.");
    } finally {
      setSedia(true);
    }
    // modelId sengaja tidak dalam kebergantungan: hanya isi sekali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const cipta = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (tajuk.trim().length < 1) {
      setErr("Tajuk bilik mesti sekurang-kurangnya 1 aksara.");
      return;
    }
    setBusy(true);
    try {
      const r = await baca(`/api/classes/${id}/ai-rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: tajuk.trim(),
          description: penerangan.trim() || undefined,
          modelId: modelId || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) {
        setErr(String(j?.error ?? "Bilik tidak dapat dicipta."));
        return;
      }
      setTajuk("");
      setPenerangan("");
      const kod = String((j?.room as BilikUi | undefined)?.join_code ?? "");
      setMsg("Bilik dicipta. Kod masuk: " + kod);
      await muat();
    } finally {
      setBusy(false);
    }
  };

  const paparQr = async (room: BilikUi) => {
    try {
      const dataUrl = await QRCode.toDataURL(`https://kuizen.fun/bilik/${room.join_code}`, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 260,
        color: { dark: "#111827", light: "#ffffff" },
      });
      setQr({ bilik: room, dataUrl });
    } catch {
      setErr("QR tidak dapat dilukis.");
    }
  };

  const salin = async (room: BilikUi) => {
    try {
      await navigator.clipboard.writeText(`https://kuizen.fun/bilik/${room.join_code}`);
      setMsg("Pautan bilik disalin ke papan keratan.");
      setErr("");
    } catch {
      setErr("Papan keratan tidak dapat digunakan oleh pelayar ini.");
    }
  };

  const tutupBuka = async (room: BilikUi) => {
    const tutup = room.status === "open";
    const r = await baca(`/api/ai-rooms/${room.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: tutup ? "closed" : "open" }),
    });
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? "Bilik tidak dapat diubah."));
      return;
    }
    setErr("");
    await muat();
  };

  const padam = async (room: BilikUi) => {
    if (
      !(await confirm({
        title: `Padam bilik "${room.title}"? Semua mesej dalam bilik ini akan hilang.`,
        tone: "danger",
      }))
    ) {
      return;
    }
    const r = await baca(`/api/ai-rooms/${room.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? "Bilik tidak dapat dipadam."));
      return;
    }
    setMsg("Bilik dipadam.");
    setErr("");
    await muat();
  };

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={id} current="ai-rooms">
        <div className="max-w-4xl mx-auto pb-10">
          {err ? (
            <Alert tone="danger" className="mb-4">
              {err}
            </Alert>
          ) : null}
          {msg ? (
            <Alert tone="success" className="mb-4">
              {msg}
            </Alert>
          ) : null}

          <Card className="mb-6">
            <CardHead
              title="Cipta bilik baharu"
              subtitle="Setiap bilik ada kod masuk 6 aksara dan menjawab dengan satu model AI."
            />
            <form onSubmit={cipta} className="mt-4 grid gap-4">
              <Field label="Tajuk bilik" htmlFor="ai-room-title">
                <Input
                  id="ai-room-title"
                  value={tajuk}
                  maxLength={80}
                  onChange={(e) => setTajuk(e.target.value)}
                  placeholder="cth. Bilik Soal Sains"
                />
              </Field>
              <Field label="Penerangan (pilihan)" htmlFor="ai-room-desc">
                <Textarea
                  id="ai-room-desc"
                  value={penerangan}
                  maxLength={300}
                  rows={2}
                  onChange={(e) => setPenerangan(e.target.value)}
                  placeholder="Untuk apa bilik ini"
                />
              </Field>
              <Field
                label="Model AI"
                htmlFor="ai-room-model"
                note={
                  models.length === 0
                    ? "Tiada model didayakan buat masa ini."
                    : "Model lalai ditanda oleh pentadbir."
                }
              >
                <Select
                  id="ai-room-model"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                >
                  {models.length === 0 ? <option value="">Model lalai pentadbir</option> : null}
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.is_default ? " (lalai)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <Button type="submit" disabled={busy}>
                  Cipta bilik
                </Button>
              </div>
            </form>
          </Card>

          {sedia && rooms.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bot className="w-6 h-6" />}
                title="Belum ada bilik"
                text="Cipta bilik pertama untuk kelas ini; ahli kelas akan masuk melalui kod 6 aksara."
              />
            </Card>
          ) : null}

          {rooms.map((room) => (
            <Card key={room.id} className="mb-4">
              <CardHead
                title={room.title}
                subtitle={
                  "Model: " + (room.qm_ai_models?.label ?? "lalai pentadbir")
                }
                right={
                  <span
                    className={
                      "text-[12px] font-bold px-2 py-1 rounded-[4px] " +
                      (room.status === "open"
                        ? "bg-[#e6fcf6] text-[#0e9f6e]"
                        : "bg-[#eff1f5] text-ink-faint")
                    }
                  >
                    {room.status === "open" ? "Buka" : "Ditutup"}
                  </span>
                }
              />
              {room.description ? (
                <p className="text-[14px] text-ink-muted mt-2">{room.description}</p>
              ) : null}
              <p className="text-[13px] text-ink-faint mt-3">
                Kod masuk:{" "}
                <span className="font-bold tracking-[0.2em] text-ink">{room.join_code}</span>
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button href={`/bilik/${room.join_code}`}>Buka bilik</Button>
                <Button variant="outline" onClick={() => void salin(room)}>
                  <Copy className="w-4 h-4" /> Salin pautan
                </Button>
                <Button variant="outline" onClick={() => void paparQr(room)}>
                  <QrCode className="w-4 h-4" /> QR
                </Button>
                <Button variant="outline" onClick={() => void tutupBuka(room)}>
                  {room.status === "open" ? "Tutup bilik" : "Buka semula"}
                </Button>
                <Button variant="ghost" warna="red" onClick={() => void padam(room)}>
                  <Trash2 className="w-4 h-4" /> Padam
                </Button>
              </div>
            </Card>
          ))}

          <Modal open={!!qr} onClose={() => setQr(null)} title="QR bilik">
            {qr ? (
              <div className="text-center">
                <p className="text-[14px] text-ink-muted mb-3">
                  Imbas untuk masuk {qr.bilik.title} ({qr.bilik.join_code}).
                </p>
                <img
                  src={qr.dataUrl}
                  alt={"QR bilik " + qr.bilik.join_code}
                  className="mx-auto rounded-[4px]"
                  width={260}
                  height={260}
                />
              </div>
            ) : null}
          </Modal>
        </div>
      </ClassShell>
    </Shell>
  );
}