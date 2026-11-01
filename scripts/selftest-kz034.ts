/**
 * Ujian sendiri KZ-034: penyedia qwen (Alibaba Model Studio) dan
 * perlindungan medan standard daripada badanTambahan.
 *
 * Jalankan:  npx tsx scripts/selftest-kz034.ts
 *
 * fetch dipalsukan sepenuhnya: tiada rangkaian, tiada kunci sebenar.
 * Kunci ujian ialah rentetan 'kunci-ujian', bukan nilai env sebenar.
 */
import {
  dapatkanPenyedia,
  buatPenyediaOpenAiSerasi,
  penyediaSedia,
  type PenyediaAi,
} from '../src/lib/ai/penyedia';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('PASS ' + name);
  } else {
    fail++;
    console.log('FAIL ' + name + ' :: ' + JSON.stringify(extra));
  }
}

const SSE_BALASAN = [
  'data: {"choices":[{"delta":{"content":"Hai"}}]}\n\n',
  'data: {"usage":{"prompt_tokens":10,"completion_tokens":5},"choices":[{"delta":{}}]}\n\n',
  'data: [DONE]\n\n',
].join('');

/** Singgah satu strim penyedia dengan fetch palsu yang sudah terpasang. */
async function lariStrim(
  penyedia: PenyediaAi,
  model: string,
  maxTokens: number,
): Promise<void> {
  for await (const p of penyedia.streamChat({
    model,
    messages: [{ role: 'user', content: 'x' }],
    maxTokens,
    signal: new AbortController().signal,
  })) {
    void p;
  }
}

async function main(): Promise<void> {
  const fetchAsal = globalThis.fetch;
  const dashAsal = process.env.DASHSCOPE_API_KEY;
  const openrouterAsal = process.env.OPENROUTER_API_KEY;
  let badanHantar = '';
  let pengepalaHantar: Record<string, string> = {};
  let urlHantar = '';
  let hitungan = 0;

  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    hitungan += 1;
    urlHantar = String(url);
    badanHantar = String(init?.body ?? '');
    pengepalaHantar = (init?.headers ?? {}) as Record<string, string>;
    return new Response(SSE_BALASAN, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof fetch;

  try {
    /* ===== Bahagian 1: penyedia qwen dengan kunci ===== */

    process.env.DASHSCOPE_API_KEY = 'kunci-ujian';
    const penyedia = dapatkanPenyedia('qwen');
    check('dapatkanPenyedia qwen dengan kunci: wujud',
      !!penyedia && typeof penyedia.streamChat === 'function');

    if (penyedia) {
      await lariStrim(penyedia, 'qwen3.7-flash', 10);
    }

    check('URL dashscope-intl compatible-mode chat/completions',
      urlHantar === 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      urlHantar);
    check('pengepala authorization Bearer kunci ujian',
      pengepalaHantar.authorization === 'Bearer kunci-ujian', pengepalaHantar.authorization);
    check('tiada HTTP-Referer atau X-Title untuk qwen',
      pengepalaHantar['HTTP-Referer'] === undefined && pengepalaHantar['X-Title'] === undefined,
      pengepalaHantar);
    check('badan mengandungi enable_thinking false',
      badanHantar.includes('"enable_thinking":false'), badanHantar);
    check('badan mengandungi stream true', badanHantar.includes('"stream":true'), badanHantar);
    check('kunci tidak pernah dalam badan', !badanHantar.includes('kunci-ujian'), badanHantar);
    check('badan memakai model yang diberi',
      JSON.parse(badanHantar).model === 'qwen3.7-flash', badanHantar);

    /* ===== Bahagian 2: badanTambahan tidak menimpa medan standard ===== */

    const p2 = buatPenyediaOpenAiSerasi({
      baseUrl: 'https://ujian.invalid/v1',
      apiKey: 'kunci-ujian',
      badanTambahan: {
        model: 'HACK',
        messages: 'HACK',
        stream: false,
        max_tokens: 999,
        stream_options: 'HACK',
        enable_thinking: true,
      },
    });
    await lariStrim(p2, 'qwen3.7-flash', 10);
    const badan2 = JSON.parse(badanHantar) as Record<string, unknown>;
    check('badanTambahan tidak menimpa model',
      badan2.model === 'qwen3.7-flash', badan2.model);
    check('badanTambahan tidak menimpa messages',
      Array.isArray(badan2.messages), badan2.messages);
    check('badanTambahan tidak menimpa max_tokens',
      badan2.max_tokens === 10, badan2.max_tokens);
    check('badanTambahan tidak menimpa stream',
      badan2.stream === true, badan2.stream);
    check('badanTambahan tidak menimpa stream_options',
      typeof badan2.stream_options === 'object' && badan2.stream_options !== null
        && (badan2.stream_options as Record<string, unknown>).include_usage === true,
      badan2.stream_options);
    check('badanTambahan medan bukan standard diterima',
      badan2.enable_thinking === true, badan2.enable_thinking);

    /* ===== Bahagian 3: kunci env ===== */

    delete process.env.DASHSCOPE_API_KEY;
    check('dapatkanPenyedia qwen tanpa kunci: null', dapatkanPenyedia('qwen') === null);
    check('penyediaSedia qwen tanpa kunci: palsu', penyediaSedia('qwen') === false);
    process.env.DASHSCOPE_API_KEY = 'kunci-ujian';
    check('penyediaSedia qwen dengan kunci: benar', penyediaSedia('qwen') === true);

    delete process.env.OPENROUTER_API_KEY;
    check('penyediaSedia openrouter tanpa kunci: palsu', penyediaSedia('openrouter') === false);
    process.env.OPENROUTER_API_KEY = 'kunci-ujian';
    check('penyediaSedia openrouter dengan kunci: benar', penyediaSedia('openrouter') === true);

    /* ===== Bahagian 4: penyedia tidak dikenali ===== */

    check('dapatkanPenyedia penyedia tidak dikenali: null',
      dapatkanPenyedia('bard') === null);
    check('penyediaSedia penyedia tidak dikenali: palsu', penyediaSedia('bard') === false);
    check('dua panggilan strim berlaku (sanity)', hitungan === 2, hitungan);
  } finally {
    globalThis.fetch = fetchAsal;
    if (dashAsal === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = dashAsal;
    }
    if (openrouterAsal === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = openrouterAsal;
    }
  }

  console.log('\n' + pass + ' lulus, ' + fail + ' gagal');
  if (fail > 0) process.exit(1);
}

void main().catch((e: unknown) => {
  console.error('SELFTEST GAGAL DENGAN RALAT:', e);
  process.exit(1);
});
