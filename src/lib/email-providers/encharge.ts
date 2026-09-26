/**
 * Penyesuai Encharge.
 *
 * Kontrak API (ikut spesifikasi KZ-005, bukan tekaan):
 *  - Asas tetap: https://api.encharge.io/v1 (SSRF: URL tidak pernah daripada input)
 *  - Pengepala: X-Encharge-Token: <kunci>, Content-Type: application/json
 *  - validateKey: GET /accounts/info. 200 sah; 401/403 tidak sah; lain ralat penyedia.
 *  - upsertContacts: POST /people, satu kenalan setiap permintaan,
 *    badan { email, firstName, lastName, tags } dengan tags dipisah koma.
 *    Keserentakan 4. Pada 429/5xx cuba semula maksimum 3 kali
 *    (tangguh 1s, 2s, 4s). Tamat masa 10s setiap permintaan.
 *
 * Kunci tidak pernah dilog, di-throw atau dimasukkan dalam mesej ralat.
 */
import type { EmailProvider, EmailProviderContact } from "./index";

const ENCHARGE_API = "https://api.encharge.io/v1";
const TAMAT_MASA_MS = 10_000;
const KESESERENTAKAN = 4;
/** Tangguh cuba semula: 1s, 2s, 4s. */
const TANGGUH_MS = [1_000, 2_000, 4_000];
const MAX_CUBA_SEMULA = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headers(kunci: string): Record<string, string> {
  return { "X-Encharge-Token": kunci, "Content-Type": "application/json" };
}

/** Satu permintaan HTTP dengan tamat masa 10 saat (AbortController setiap percubaan). */
async function requestSekali(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const pemasa = setTimeout(() => ac.abort(), TAMAT_MASA_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(pemasa);
  }
}

/**
 * Laksanakan permintaan dengan cuba semula pada 429/5xx dan ralat rangkaian.
 * Pulang null jika semua percubaan habis atau ralat rangkaian berterusan.
 */
async function denganCubaSemula(fabricate: () => Promise<Response>): Promise<Response | null> {
  // Percubaan asal (cuba === 0) ditambah maksimum 3 cubaan semula.
  for (let cuba = 0; cuba <= MAX_CUBA_SEMULA; cuba++) {
    let res: Response;
    try {
      res = await fabricate();
    } catch {
      // Tamat masa / rangkaian bawah: layak seperti 5xx.
      if (cuba === MAX_CUBA_SEMULA) return null;
      await sleep(TANGGUH_MS[cuba]);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && cuba < MAX_CUBA_SEMULA) {
      await sleep(TANGGUH_MS[cuba]);
      continue;
    }
    return res;
  }
  return null;
}

function badanKenalan(c: EmailProviderContact): string {
  return JSON.stringify({
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    tags: (c.tags || []).join(","),
  });
}

export const encharge: EmailProvider = {
  id: "encharge",
  label: "Encharge",
  validateKey: async (kunci) => {
    try {
      const res = await requestSekali(`${ENCHARGE_API}/accounts/info`, {
        method: "GET",
        headers: headers(kunci),
      });
      return { ok: res.status === 200, status: res.status };
    } catch {
      // Tamat masa atau rangkaian bawah: status 0 supaya pemanggil
      // memperlakukan ini sebagai ralat penyedia, bukan kunci tidak sah.
      return { ok: false, status: 0 };
    }
  },
  upsertContacts: async (kunci, contacts) => {
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Bahagi kepada kumpulan 4 untuk keserentakan.
    for (let mula = 0; mula < contacts.length; mula += KESESERENTAKAN) {
      const kumpulan = contacts.slice(mula, mula + KESESERENTAKAN);
      await Promise.all(
        kumpulan.map(async (c, i) => {
          // Indeks merentas keseluruhan senarai; e-mel tidak diletakkan dalam ralat.
          const idx = mula + i;
          const res = await denganCubaSemula(() =>
            requestSekali(`${ENCHARGE_API}/people`, {
              method: "POST",
              headers: headers(kunci),
              body: badanKenalan(c),
            }),
          );
          if (res && res.ok) {
            sent++;
          } else {
            failed++;
            if (res) {
              errors.push(`Contact ${idx + 1}: Encharge returned HTTP ${res.status}`);
            } else {
              errors.push(`Contact ${idx + 1}: Encharge unreachable after retries`);
            }
          }
        }),
      );
    }
    return { sent, failed, errors };
  },
};
