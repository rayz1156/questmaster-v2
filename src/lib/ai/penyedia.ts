/**
 * Lapisan penyedia AI untuk Bilik AI (KZ-033, fasa 1).
 *
 * Satu antara muka `PenyediaAi` sahaja; fasa ini hanya membawa adapter
 * OpenAI-serasi yang dipakai oleh OpenRouter. Antara muka direka supaya
 * penyedia lain (OpenAI, Groq, Gemini, dsb) boleh ditambah kemudian
 * tanpa menukar pemanggil: lihat blueprint bahagian 3.
 *
 * KESELAMATAN:
 *  - kunci API hanya hidup dalam process.env pelayan dan tidak pernah
 *    dilog, dipulangkan dalam respons, atau dimasukkan dalam mesej ralat;
 *  - ralat HTTP penyedia dilog dengan kod status dan 300 aksara pertama
 *    badan sahaja;
 *  - semua panggilan AI berlaku di pelayan, tidak pernah dari pelayar.
 */
import { PenghuraiSse } from './sse';

export interface MesejPenyedia {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PeristiwaStrim {
  /** Teks tambahan daripada model. */
  delta?: string;
  /** Token dilaporkan penyedia (stream_options include_usage). */
  usage?: { prompt: number; completion: number };
}

export interface PenyediaAi {
  streamChat(o: {
    model: string;
    messages: MesejPenyedia[];
    maxTokens: number;
    signal: AbortSignal;
  }): AsyncGenerator<PeristiwaStrim>;
}

/** Tukar nombor penyedia kepada integer tidak negatif. */
function nombor(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Bentuk peristiwa strim daripada satu peristiwa data SSE chat
 * completions. `data: [DONE]` dan JSON rosak diabaikan secara senyap.
 */
function *peristiwaChat(data: string): Generator<PeristiwaStrim> {
  const bersih = data.trim();
  if (!bersih || bersih === '[DONE]') return;
  let j: unknown;
  try {
    j = JSON.parse(bersih);
  } catch {
    return;
  }
  if (!j || typeof j !== 'object') return;
  const obj = j as {
    choices?: { delta?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const delta = obj.choices?.[0]?.delta?.content;
  if (typeof delta === 'string' && delta.length > 0) {
    yield { delta };
  }
  const u = obj.usage;
  if (u && typeof u === 'object') {
    yield {
      usage: { prompt: nombor(u.prompt_tokens), completion: nombor(u.completion_tokens) },
    };
  }
}

/**
 * Adapter OpenAI-serasi: POST {baseUrl}/chat/completions dengan
 * stream: true dan stream_options include_usage supaya jumlah token
 * dilaporkan pada peristiwa terakhir.
 *
 * `badanTambahan` (KZ-034) digabungkan ke badan JSON SEBELUM medan
 * standard, jadi medan standard sentiasa menang: badanTambahan tidak
 * boleh menimpa model, messages, max_tokens, stream atau stream_options
 * (kriteria penerimaan 6 tiket KZ-034).
 */
export function buatPenyediaOpenAiSerasi(konfig: {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  /** Medan tambahan penyedia, cth { enable_thinking: false } untuk Qwen. */
  badanTambahan?: Record<string, unknown>;
}): PenyediaAi {
  return {
    async *streamChat(o) {
      const url = konfig.baseUrl.replace(/\/+$/, '') + '/chat/completions';
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          signal: o.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${konfig.apiKey}`,
            ...(konfig.headers ?? {}),
          },
          body: JSON.stringify({
            // badanTambahan dahulu: medan standard di bawah sentiasa
            // menimpanya, jadi medan keselamatan tidak boleh diubah.
            ...(konfig.badanTambahan ?? {}),
            model: o.model,
            messages: o.messages,
            max_tokens: o.maxTokens,
            stream: true,
            stream_options: { include_usage: true },
          }),
        });
      } catch {
        throw new Error('Sambungan kepada penyedia AI gagal.');
      }
      if (!res.ok) {
        // Kunci tidak pernah dilog: hanya kod status dan 300 aksara
        // pertama badan ralat penyedia.
        let potong = '';
        try {
          potong = (await res.text()).slice(0, 300);
        } catch {
          potong = '';
        }
        console.error(`[bilik-ai] penyedia balas ${res.status}: ${potong}`);
        throw new Error(`Penyedia AI menolak permintaan (status ${res.status}).`);
      }
      if (!res.body) throw new Error('Penyedia AI tidak menghantar strim.');

      const penyemak = new PenghuraiSse();
      const penyahsulit = new TextDecoder();
      const pembaca = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await pembaca.read();
          if (done) break;
          const cebisan = penyahsulit.decode(value, { stream: true });
          for (const p of penyemak.suap(cebisan)) {
            yield* peristiwaChat(p.data);
          }
        }
        for (const p of penyemak.tamat()) {
          yield* peristiwaChat(p.data);
        }
      } finally {
        try {
          await pembaca.cancel();
        } catch {
          // Strim sudah tertutup; abaikan.
        }
      }
    },
  };
}

/**
 * Adakah kunci env penyedia itu wujud di pelayan (KZ-034). Kunci itu
 * sendiri tidak pernah dilog atau dipulangkan. Digunakan oleh laluan
 * by-code untuk `aiConfigured` mengikut penyedia model bilik.
 */
export function penyediaSedia(provider: string): boolean {
  if (provider === 'qwen') return !!process.env.DASHSCOPE_API_KEY;
  if (provider === 'openrouter') return !!process.env.OPENROUTER_API_KEY;
  return false;
}

/**
 * Dapatkan penyedia mengikut nama. 'qwen' (KZ-034): Alibaba Model
 * Studio antarabangsa (Singapura), titik akhir OpenAI-serasi, kunci
 * DASHSCOPE_API_KEY. `enable_thinking: false` dimatikan mod berfikir
 * supaya token berfikir tidak dicaj dan tidak menghabiskan max_tokens
 * (sama seperti Bicarra, llm_catalog.py:122). Tiada kunci: pulangkan
 * null (laluan ask membalas 503 AI_NOT_CONFIGURED).
 * 'openrouter' kekal seperti sedia ada (dimatikan pada peringkat data,
 * migrasi 0069, tetapi kodnya dikekalkan). Penyedia lain memulangkan
 * null juga.
 */
export function dapatkanPenyedia(provider: string): PenyediaAi | null {
  if (provider === 'qwen') {
    const kunci = process.env.DASHSCOPE_API_KEY;
    if (!kunci) return null;
    return buatPenyediaOpenAiSerasi({
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      apiKey: kunci,
      badanTambahan: { enable_thinking: false },
    });
  }
  if (provider === 'openrouter') {
    const kunci = process.env.OPENROUTER_API_KEY;
    if (!kunci) return null;
    return buatPenyediaOpenAiSerasi({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: kunci,
      headers: {
        'HTTP-Referer': 'https://kuizen.fun',
        'X-Title': 'Kuizen',
      },
    });
  }
  return null;
}