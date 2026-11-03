"use client";
/**
 * /educator/classes/[id]/ai-rooms: senarai dan cipta AI Chatroom untuk satu
 * kelas (KZ-033 fasa 1).
 *
 * Guru (pemilik kelas atau ko-pendidik diterima) boleh mencipta,
 * menutup dan memadam bilik. Peserta kelas boleh melihat senarai
 * tetapi API menolak ciptaan mereka (laluan POST menyemak peranan di
 * pelayan). Setiap kad membawa kod masuk 6 aksara, pautan salin
 * (https://kuizen.fun/chatroom/<KOD>) dan QR yang dijana di pelayar
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
import { useBahasa } from "@/lib/i18n/BahasaProvider";

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
  const { t } = useBahasa();

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
        setErr(String(j?.error ?? t("aiRooms.classPage.loadFailed")));
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
      setErr(t("aiRooms.classPage.loadFailed"));
    } finally {
      setSedia(true);
    }
    // modelId sengaja tidak dalam kebergantungan: hanya isi sekali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const cipta = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (tajuk.trim().length < 1) {
      setErr(t("aiRooms.classPage.titleMin"));
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
        setErr(String(j?.error ?? t("aiRooms.classPage.createFailed")));
        return;
      }
      setTajuk("");
      setPenerangan("");
      const kod = String((j?.room as BilikUi | undefined)?.join_code ?? "");
      setMsg(t("aiRooms.classPage.created", { kod }));
      await muat();
    } finally {
      setBusy(false);
    }
  };

  const paparQr = async (room: BilikUi) => {
    try {
      const dataUrl = await QRCode.toDataURL(`https://kuizen.fun/chatroom/${room.join_code}`, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 260,
        color: { dark: "#111827", light: "#ffffff" },
      });
      setQr({ bilik: room, dataUrl });
    } catch {
      setErr(t("aiRooms.classPage.qrFailed"));
    }
  };

  const salin = async (room: BilikUi) => {
    try {
      await navigator.clipboard.writeText(`https://kuizen.fun/chatroom/${room.join_code}`);
      setMsg(t("aiRooms.classPage.linkCopied"));
      setErr("");
    } catch {
      setErr(t("aiRooms.classPage.clipboardFailed"));
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
      setErr(String(j?.error ?? t("aiRooms.classPage.updateFailed")));
      return;
    }
    setErr("");
    await muat();
  };

  const padam = async (room: BilikUi) => {
    if (
      !(await confirm({
        title: t("aiRooms.classPage.deleteDesc", { tajuk: room.title }),
        tone: "danger",
      }))
    ) {
      return;
    }
    const r = await baca(`/api/ai-rooms/${room.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}) as Record<string, unknown>);
    if (!r.ok) {
      setErr(String(j?.error ?? t("aiRooms.classPage.deleteFailed")));
      return;
    }
    setMsg(t("aiRooms.classPage.deleted"));
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
              title={t("aiRooms.classPage.createTitle")}
              subtitle={t("aiRooms.classPage.createSubtitle")}
            />
            <form onSubmit={cipta} className="mt-4 grid gap-4">
              <Field label={t("aiRooms.classPage.titleLabel")} htmlFor="ai-room-title">
                <Input
                  id="ai-room-title"
                  value={tajuk}
                  maxLength={80}
                  onChange={(e) => setTajuk(e.target.value)}
                  placeholder={t("aiRooms.classPage.titlePlaceholder")}
                />
              </Field>
              <Field label={t("aiRooms.classPage.descLabel")} htmlFor="ai-room-desc">
                <Textarea
                  id="ai-room-desc"
                  value={penerangan}
                  maxLength={300}
                  rows={2}
                  onChange={(e) => setPenerangan(e.target.value)}
                  placeholder={t("aiRooms.classPage.descPlaceholder")}
                />
              </Field>
              <Field
                label={t("aiRooms.classPage.modelLabel")}
                htmlFor="ai-room-model"
                note={
                  models.length === 0
                    ? t("aiRooms.classPage.noModels")
                    : t("aiRooms.classPage.defaultModelNote")
                }
              >
                <Select
                  id="ai-room-model"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                >
                  {models.length === 0 ? <option value="">{t("aiRooms.classPage.adminDefaultModel")}</option> : null}
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.is_default ? t("aiRooms.classPage.defaultSuffix") : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <Button type="submit" disabled={busy}>
                  {t("aiRooms.classPage.createRoom")}
                </Button>
              </div>
            </form>
          </Card>

          {sedia && rooms.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bot className="w-6 h-6" />}
                title={t("aiRooms.classPage.emptyTitle")}
                text={t("aiRooms.classPage.emptyText")}
              />
            </Card>
          ) : null}

          {rooms.map((room) => (
            <Card key={room.id} className="mb-4">
              <CardHead
                title={room.title}
                subtitle={
                  t("aiRooms.classPage.modelLine", { model: room.qm_ai_models?.label ?? t("aiRooms.classPage.adminDefaultModel") })
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
                    {room.status === "open" ? t("aiRooms.classPage.statusOpen") : t("aiRooms.classPage.statusClosed")}
                  </span>
                }
              />
              {room.description ? (
                <p className="text-[14px] text-ink-muted mt-2">{room.description}</p>
              ) : null}
              <p className="text-[13px] text-ink-faint mt-3">
                {t("aiRooms.classPage.joinCodeLabel")}
                <span className="font-bold tracking-[0.2em] text-ink">{room.join_code}</span>
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button href={`/chatroom/${room.join_code}`}>{t("aiRooms.classPage.openRoom")}</Button>
                <Button variant="outline" onClick={() => void salin(room)}>
                  <Copy className="w-4 h-4" /> {t("aiRooms.classPage.copyLink")}
                </Button>
                <Button variant="outline" onClick={() => void paparQr(room)}>
                  <QrCode className="w-4 h-4" /> QR
                </Button>
                <Button variant="outline" onClick={() => void tutupBuka(room)}>
                  {room.status === "open" ? t("aiRooms.classPage.closeRoom") : t("aiRooms.classPage.reopenRoom")}
                </Button>
                <Button variant="ghost" warna="red" onClick={() => void padam(room)}>
                  <Trash2 className="w-4 h-4" /> {t("aiRooms.classPage.deleteBtn")}
                </Button>
              </div>
            </Card>
          ))}

          <Modal open={!!qr} onClose={() => setQr(null)} title={t("aiRooms.classPage.qrTitle")}>
            {qr ? (
              <div className="text-center">
                <p className="text-[14px] text-ink-muted mb-3">
                  {t("aiRooms.classPage.scanToJoin", { tajuk: qr.bilik.title, kod: qr.bilik.join_code })}
                </p>
                {/* QR data URL tidak boleh dioptimumkan next/image;
                    img biasa, corak QR sedia ada dalam repo. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr.dataUrl}
                  alt={t("aiRooms.classPage.qrAlt", { kod: qr.bilik.join_code })}
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