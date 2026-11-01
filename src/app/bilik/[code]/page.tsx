"use client";
/**
 * /bilik/[code]: Bilik AI yang dikongsi oleh guru dan pelajar (KZ-033).
 *
 * Perlu log masuk (localStorage 'qm-auth', Bearer pada setiap
 * panggilan); tanpa sesi, balik ke /login?next=/bilik/<kod>.
 * Bukan ahli kelas: papar "Anda bukan ahli kelas ini."
 *
 * Kemas kini masa nyata dengan TINJAUAN setiap 2 saat (corak Kuiz
 * Langsung, src/app/live/[code]/page.tsx:222). BUKAN Supabase
 * Realtime dan bukan WebSocket. Tinjauan berhenti bila tab
 * tersembunyi (document.visibilityState). Tatal automatik ke bawah
 * hanya bila pengguna sudah berada di bawah senarai.
 *
 * Teks sentiasa dipapar sebagai teks biasa dengan
 * whitespace-pre-wrap. DILARANG dangerouslySetInnerHTML: teks AI dan
 * teks pelajar adalah kandungan pengguna (XSS).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Bot, Sparkles, Square } from "lucide-react";
import { supabase } from "@/lib/supabase";

const REGEX_KOD = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

interface MesejBilik {
  id: string;
  seq: number;
  authorKind: "human" | "ai" | "system";
  authorId: string | null;
  authorName: string | null;
  askedBy: string | null;
  askedName: string | null;
  replyTo: string | null;
  body: string;
  aiStatus: string | null;
  modelLabel: string | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AhliBilik {
  id: string;
  name: string;
  role: "teacher" | "student";
  muted: boolean;
}

interface BilikUi {
  id: string;
  title: string;
  description: string | null;
  joinCode: string;
  status: string;
  aiEnabled: boolean;
  contextEnabled: boolean;
  contextWindow: number;
  modelId: string | null;
  modelLabel?: string | null;
}

interface BalasanTinjau {
  messages?: MesejBilik[];
  changed?: MesejBilik[];
  serverTime?: string;
  online?: AhliBilik[];
  room?: {
    id?: string;
    title?: string;
    status?: string;
    aiEnabled?: boolean;
    contextEnabled?: boolean;
    contextWindow?: number;
    modelId?: string | null;
  };
}

interface ModelUi {
  id: string;
  label: string;
  is_default: boolean;
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

/** Kad satu mesej. Teks biasa sahaja, tiada HTML. */
function KadMesej({
  m,
  bolehBerhenti,
  onBerhenti,
}: {
  m: MesejBilik;
  bolehBerhenti: boolean;
  onBerhenti: (id: string) => void;
}) {
  if (m.deleted) {
    return (
      <p className="text-[13px] text-ink-faint italic py-1 text-center">Mesej dipadam</p>
    );
  }
  if (m.authorKind === "ai") {
    const berfikir = m.aiStatus === "queued";
    const menaip = m.aiStatus === "streaming";
    const bolehHenti = bolehBerhenti && (berfikir || menaip);
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold text-violet-700 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{m.modelLabel || "AI"}</span>
          </p>
          {bolehHenti ? (
            <button
              type="button"
              onClick={() => onBerhenti(m.id)}
              className="text-[12px] font-medium text-red-600 hover:underline inline-flex items-center gap-1 shrink-0"
            >
              <Square className="w-3 h-3" /> Berhenti
            </button>
          ) : null}
        </div>
        <p className="text-[14px] text-ink mt-2 whitespace-pre-wrap break-words">{m.body}</p>
        {berfikir ? (
          <p className="text-[12px] text-violet-500 mt-1">AI sedang berfikir...</p>
        ) : null}
        {menaip ? (
          <p className="text-[12px] text-violet-500 mt-1">AI sedang menaip...</p>
        ) : null}
      </div>
    );
  }
  if (m.authorKind === "system") {
    return (
      <p className="text-[13px] text-ink-faint text-center py-1 whitespace-pre-wrap">
        {m.body}
      </p>
    );
  }
  return (
    <div className="bg-white border border-[#e5e9f2] rounded-xl p-4">
      <p className="text-[13px] font-bold text-ink">{m.authorName || "Ahli"}</p>
      <p className="text-[14px] text-ink mt-1 whitespace-pre-wrap break-words">{m.body}</p>
    </div>
  );
}

export default function HalamanBilik() {
  const params = useParams<{ code: string }>();
  const kod = String(params.code || "").trim().toUpperCase();
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [bilik, setBilik] = useState<BilikUi | null>(null);
  const [role, setRole] = useState<"teacher" | "student" | null>(null);
  const [mutedSaya, setMutedSaya] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [ralatBlok, setRalatBlok] = useState("");
  const [mesej, setMesej] = useState<MesejBilik[]>([]);
  const [online, setOnline] = useState<AhliBilik[]>([]);
  const [models, setModels] = useState<ModelUi[]>([]);
  const [teks, setTeks] = useState("");
  const [busyHantar, setBusyHantar] = useState(false);
  const [notis, setNotis] = useState("");

  const userIdRef = useRef("");
  const bilikIdRef = useRef("");
  const afterRef = useRef(0);
  const sinceRef = useRef("");
  const kotakRef = useRef<HTMLDivElement | null>(null);
  const diBawahRef = useRef(true);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Log masuk diperlukan; tanpa sesi pergi ke /login dengan pautan kembali.
  useEffect(() => {
    let hidup = true;
    const semak = async () => {
      try {
        const ses = await supabase.auth.getSession();
        if (!hidup) return;
        if (!ses.data.session) {
          router.replace(`/login?next=${encodeURIComponent(`/bilik/${kod}`)}`);
          return;
        }
        setUserId(ses.data.session.user.id);
      } catch {
        if (hidup) setRalatBlok("Sesi tidak dapat dibaca. Sila log masuk semula.");
      }
    };
    void semak();
    return () => {
      hidup = false;
    };
  }, [kod, router]);

  // Buka bilik dengan kod (semakan akses dilakukan oleh API).
  useEffect(() => {
    if (!userId || bilikIdRef.current) return;
    if (!REGEX_KOD.test(kod)) {
      setRalatBlok("Kod bilik tidak sah.");
      return;
    }
    let hidup = true;
    const buka = async () => {
      try {
        const r = await fetch(`/api/ai-rooms/by-code/${kod}`, {
          headers: await pengepalaBearer(),
        });
        const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        if (!hidup) return;
        if (!r.ok || !j) {
          const kodRalat = String(j?.code ?? "");
          if (r.status === 404) setRalatBlok("Kod bilik tidak ditemui.");
          else if (kodRalat === "NOT_CLASS_MEMBER") setRalatBlok("Anda bukan ahli kelas ini.");
          else setRalatBlok(String(j?.error ?? "Bilik tidak dapat dibuka."));
          return;
        }
        const room = j.room as BilikUi | undefined;
        if (!room) {
          setRalatBlok("Bilik tidak dapat dibuka.");
          return;
        }
        setBilik(room);
        bilikIdRef.current = room.id;
        setRole(j.role === "teacher" ? "teacher" : "student");
        setMutedSaya(!!j.muted);
        setAiConfigured(!!j.aiConfigured);
        if (j.role === "teacher") {
          // Senarai model untuk pemilih panel guru.
          const rm = await fetch("/api/ai-models", { headers: await pengepalaBearer() });
          const jm = (await rm.json().catch(() => null)) as Record<string, unknown> | null;
          if (rm.ok && jm) setModels((jm.models ?? []) as ModelUi[]);
        }
      } catch {
        if (hidup) setRalatBlok("Bilik tidak dapat dibuka.");
      }
    };
    void buka();
    return () => {
      hidup = false;
    };
  }, [userId, kod]);

  // Satu giliran tinjauan. `awal` benar bermaksud muat penuh.
  const tinjau = useCallback(async (awal: boolean) => {
    const bilikId = bilikIdRef.current;
    if (!bilikId) return;
    // Tab tersembunyi: berhenti meninjau sampai ia kelihatan semula.
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const after = awal ? 0 : afterRef.current;
    const since = awal ? "" : sinceRef.current;
    try {
      const url =
        `/api/ai-rooms/${bilikId}/messages?after=${after}` +
        (since ? `&since=${encodeURIComponent(since)}` : "");
      const r = await fetch(url, { headers: await pengepalaBearer() });
      const j = (await r.json().catch(() => null)) as BalasanTinjau | null;
      if (!r.ok || !j) return;
      // Ingat kedudukan tatal sebelum senarai bertukar.
      const el = kotakRef.current;
      diBawahRef.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setMesej((sedia) => {
        const peta = new Map<string, MesejBilik>();
        for (const m of sedia) peta.set(m.id, m);
        for (const m of j.changed ?? []) peta.set(m.id, m);
        let tertinggi = afterRef.current;
        for (const m of j.messages ?? []) {
          peta.set(m.id, m);
          if (m.seq > tertinggi) tertinggi = m.seq;
        }
        afterRef.current = tertinggi;
        const keluar: MesejBilik[] = [];
        peta.forEach((m) => keluar.push(m));
        keluar.sort((a, b) => a.seq - b.seq);
        return keluar;
      });
      if (j.serverTime) sinceRef.current = j.serverTime;
      if (j.online) {
        setOnline(j.online);
        const saya = j.online.find((o) => o.id === userIdRef.current);
        if (saya) setMutedSaya(saya.muted);
      }
      if (j.room) {
        setBilik((b) => {
          if (!b) return b;
          const r = j.room!;
          return {
            ...b,
            title: typeof r.title === "string" ? r.title : b.title,
            status: typeof r.status === "string" ? r.status : b.status,
            aiEnabled: typeof r.aiEnabled === "boolean" ? r.aiEnabled : b.aiEnabled,
            contextEnabled:
              typeof r.contextEnabled === "boolean" ? r.contextEnabled : b.contextEnabled,
            contextWindow: typeof r.contextWindow === "number" ? r.contextWindow : b.contextWindow,
            modelId: r.modelId !== undefined ? r.modelId : b.modelId,
          };
        });
      }
    } catch {
      // cuba lagi pada kitaran seterusnya
    }
  }, []);

  // Tinjauan 2 saat, corak Kuiz Langsung.
  useEffect(() => {
    if (!userId || !bilik) return;
    void tinjau(true);
    const t = setInterval(() => {
      void tinjau(false);
    }, 2000);
    return () => {
      clearInterval(t);
    };
    // bilik?.id, bukan bilik: kemas kini keadaan bilik daripada tinjauan
    // tidak boleh melancarkan semula pemuatan awal dan menetapkan semula
    // pemasa; hanya bilik lain yang memulakan kitaran baharu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, bilik?.id, tinjau]);

  // Tatal ke bawah hanya jika pengguna sudah di bawah.
  useEffect(() => {
    const el = kotakRef.current;
    if (el && diBawahRef.current) el.scrollTop = el.scrollHeight;
  }, [mesej]);

  const hantar = async () => {
    const isi = teks.trim();
    if (!isi || !bilik) return;
    setNotis("");
    setBusyHantar(true);
    try {
      const r = await baca(`/api/ai-rooms/${bilik.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: isi }),
      });
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok) {
        setNotis(String(j?.error ?? "Mesej tidak dapat dihantar."));
        return;
      }
      const m = j?.message as MesejBilik | undefined;
      if (m) {
        setMesej((sedia) => {
          if (sedia.some((x) => x.id === m.id)) return sedia;
          if (m.seq > afterRef.current) afterRef.current = m.seq;
          return [...sedia, m];
        });
      }
      setTeks("");
    } catch {
      setNotis("Mesej tidak dapat dihantar.");
    } finally {
      setBusyHantar(false);
    }
  };

  const tanya = async () => {
    const isi = teks.trim();
    if (!isi || !bilik) return;
    setNotis("");
    try {
      // Respons ask datang selepas strim selesai; paparan bergantung
      // pada tinjauan, bukan pada respons ini.
      const r = await baca(`/api/ai-rooms/${bilik.id}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: isi }),
      });
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok) {
        setNotis(String(j?.error ?? "Soalan tidak dapat dihantar."));
        return;
      }
      setTeks("");
    } catch {
      setNotis("Soalan tidak dapat dihantar.");
    }
  };

  const berhenti = async (msgId: string) => {
    if (!bilik) return;
    try {
      await baca(`/api/ai-rooms/${bilik.id}/messages/${msgId}/stop`, { method: "POST" });
    } catch {
      // tinjauan seterusnya menunjukkan keadaan sebenar
    }
  };

  const bisu = async (ahli: AhliBilik) => {
    if (!bilik) return;
    try {
      const r = await baca(`/api/ai-rooms/${bilik.id}/members/${ahli.id}/mute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ muted: !ahli.muted }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        setNotis(String(j?.error ?? "Bisu ahli tidak berjaya."));
        return;
      }
      setOnline((sedia) =>
        sedia.map((a) => (a.id === ahli.id ? { ...a, muted: !a.muted } : a)),
      );
    } catch {
      setNotis("Bisu ahli tidak berjaya.");
    }
  };

  const kemasBilik = async (set: Record<string, unknown>) => {
    if (!bilik) return;
    try {
      const r = await baca(`/api/ai-rooms/${bilik.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(set),
      });
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok) {
        setNotis(String(j?.error ?? "Bilik tidak dapat diubah."));
        return;
      }
      const room = j?.room as Record<string, unknown> | undefined;
      if (room) {
        setBilik((b) => {
          if (!b) return b;
          return {
            ...b,
            title: typeof room.title === "string" ? room.title : b.title,
            status: typeof room.status === "string" ? room.status : b.status,
            aiEnabled:
              typeof room.ai_enabled === "boolean" ? room.ai_enabled : b.aiEnabled,
            contextEnabled:
              typeof room.context_enabled === "boolean" ? room.context_enabled : b.contextEnabled,
            contextWindow:
              typeof room.context_window === "number" ? room.context_window : b.contextWindow,
            modelId:
              room.model_id !== undefined ? (room.model_id as string | null) : b.modelId,
          };
        });
      }
    } catch {
      setNotis("Bilik tidak dapat diubah.");
    }
  };

  /* ===== Papar ralat blok ===== */
  if (ralatBlok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f6fa]">
        <div className="w-full max-w-sm bg-violet-50 border border-violet-200 rounded-xl p-6 text-center">
          <Bot className="w-8 h-8 mx-auto text-violet-500" />
          <p className="text-[16px] font-bold text-ink mt-3">{ralatBlok}</p>
          <p className="text-[13px] text-ink-faint mt-1">Kod bilik: {kod}</p>
          <a
            href="/bilik"
            className="inline-block mt-4 text-[13px] font-medium text-violet-600 hover:underline"
          >
            Cuba kod lain
          </a>
        </div>
      </div>
    );
  }

  /* ===== Papar pemuatan ===== */
  if (!bilik) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f6fa]">
        <p className="text-[14px] text-ink-faint">Membuka bilik...</p>
      </div>
    );
  }

  const sebabAi = !aiConfigured
    ? "AI belum disediakan oleh pentadbir."
    : !bilik.aiEnabled
      ? "AI dimatikan dalam bilik ini."
      : bilik.status !== "open"
        ? "Bilik ditutup."
        : "";
  const aiBoleh = !sebabAi;

  return (
    <div className="min-h-screen bg-[#f5f6fa] p-4 md:p-6">
      <div className="max-w-5xl mx-auto grid md:grid-cols-[1fr_280px] gap-4 items-start">
        {/* ===== Kolum sembang ===== */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex flex-col h-[calc(100vh-3rem)]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h1 className="text-[16px] font-bold text-ink flex items-center gap-2 truncate">
                <Bot className="w-4 h-4 text-violet-600 shrink-0" />
                <span className="truncate">{bilik.title}</span>
              </h1>
              <p className="text-[12px] text-ink-faint">
                Kod {bilik.joinCode} · {online.length} dalam talian
              </p>
            </div>
            {bilik.status !== "open" ? (
              <span className="text-[12px] font-bold text-amber-600 shrink-0">
                Bilik ditutup
              </span>
            ) : null}
          </div>

          <div ref={kotakRef} className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
            {mesej.length === 0 ? (
              <p className="text-[13px] text-ink-faint text-center py-8">
                Belum ada mesej. Mulakan perbualan, atau tekan Tanya AI.
              </p>
            ) : null}
            {mesej.map((m) => (
              <KadMesej
                key={m.id}
                m={m}
                bolehBerhenti={role === "teacher" || (!!userId && m.askedBy === userId)}
                onBerhenti={(id) => void berhenti(id)}
              />
            ))}
          </div>

          {notis ? <p className="text-[13px] text-red-600 mt-2">{notis}</p> : null}

          <div className="mt-3">
            {mutedSaya ? (
              <p className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                Anda dibisukan oleh guru. Anda tidak boleh menulis dalam bilik ini.
              </p>
            ) : bilik.status !== "open" ? (
              <p className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                Bilik ditutup oleh guru. Anda masih boleh membaca mesej.
              </p>
            ) : (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void hantar();
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    value={teks}
                    onChange={(e) => setTeks(e.target.value)}
                    maxLength={2000}
                    placeholder="Tulis mesej di sini"
                    aria-label="Mesej"
                    className="flex-1 min-w-[12rem] h-11 rounded-xl border border-violet-200 bg-white px-4 text-[14px] outline-none focus:border-violet-500"
                  />
                  <button
                    type="submit"
                    disabled={busyHantar || teks.trim().length === 0}
                    className="px-4 h-11 rounded-xl text-white text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Hantar
                  </button>
                  <button
                    type="button"
                    onClick={() => void tanya()}
                    disabled={!aiBoleh || teks.trim().length === 0}
                    title={sebabAi || undefined}
                    className="px-4 h-11 rounded-xl text-white text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" /> Tanya AI
                  </button>
                </form>
                {sebabAi ? (
                  <p className="text-[12px] text-ink-faint mt-2">{sebabAi}</p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* ===== Panel guru ===== */}
        {role === "teacher" ? (
          <div className="bg-white border border-[#e5e9f2] rounded-xl p-4 flex flex-col gap-4 w-full md:sticky md:top-6">
            <div>
              <p className="text-[13px] font-bold text-ink mb-2">
                Ahli dalam talian ({online.length})
              </p>
              {online.length === 0 ? (
                <p className="text-[13px] text-ink-faint">Tiada ahli lain buat masa ini.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {online.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="text-[13px] text-ink truncate">
                        {a.name}
                        {a.id === userId ? " (anda)" : ""}
                        {a.role === "teacher" ? " · guru" : ""}
                        {a.muted ? " · dibisukan" : ""}
                      </span>
                      {a.role !== "teacher" ? (
                        <button
                          type="button"
                          onClick={() => void bisu(a)}
                          className={
                            "text-[12px] font-medium hover:underline shrink-0 " +
                            (a.muted ? "text-red-600" : "text-ink-faint")
                          }
                        >
                          {a.muted ? "Nyahbisu" : "Bisu"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-hairline pt-4">
              <p className="text-[13px] font-bold text-ink mb-2">Tetapan bilik</p>
              <label className="flex items-center justify-between gap-2 text-[13px] text-ink-muted mb-2">
                <span>Dayakan Tanya AI</span>
                <input
                  type="checkbox"
                  checked={bilik.aiEnabled}
                  onChange={() => void kemasBilik({ aiEnabled: !bilik.aiEnabled })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[13px] text-ink-muted mb-2">
                <span>Kongsi sejarah bilik dengan AI</span>
                <input
                  type="checkbox"
                  checked={bilik.contextEnabled}
                  onChange={() => void kemasBilik({ contextEnabled: !bilik.contextEnabled })}
                />
              </label>
              <label className="block text-[13px] text-ink-muted mb-1" htmlFor="bilik-model">
                Model AI
              </label>
              <select
                id="bilik-model"
                value={bilik.modelId ?? ""}
                onChange={(e) => void kemasBilik({ modelId: e.target.value || null })}
                className="w-full h-9 rounded-[4px] border border-hairline bg-white px-3 text-[13px] mb-3"
              >
                <option value="">Model lalai pentadbir</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  void kemasBilik({ status: bilik.status === "open" ? "closed" : "open" })
                }
                className="w-full py-2 rounded-xl text-[13px] font-medium border border-violet-200 text-violet-700 hover:bg-violet-100"
              >
                {bilik.status === "open" ? "Tutup bilik" : "Buka semula bilik"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}