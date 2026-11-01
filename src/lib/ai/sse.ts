/**
 * Penghurai SSE (Server-Sent Events) untuk strim chat completions
 * penyedia OpenAI-serasi (OpenRouter), KZ-033.
 *
 * Fail ini TULEN: tidak import apa-apa, supaya boleh diuji oleh
 * scripts/selftest-kz033.ts tanpa Next.js atau klien Supabase.
 *
 * Tiga perkara yang perlu ditangani:
 *  - cebisan boleh terpotong di tengah baris (TCP tidak berjanji
 *    sempadan); baris belum lengkap mesti kekal dalam penimbas;
 *  - `data: [DONE]` ialah penanda tamat strim OpenAI-serasi, bukan JSON;
 *  - baris bermula dengan `:` ialah komen (OpenRouter menghantar ping).
 */

export interface PeristiwaSse {
  /** Data peristiwa (satu atau lebih baris `data:` digabung). */
  data: string;
}

export class PenghuraiSse {
  /** Baris yang belum lengkap dari cebisan terakhir. */
  private penimbas = '';
  /** Baris `data:` peristiwa yang sedang dikumpul. */
  private barisData: string[] = [];

  /**
   * Suap satu cebisan teks; pulangkan peristiwa yang lengkap di dalamnya.
   * Sisa yang belum lengkap kekal untuk cebisan seterusnya.
   */
  suap(cebisan: string): PeristiwaSse[] {
    this.penimbas += cebisan;
    const peristiwa: PeristiwaSse[] = [];
    const barisan = this.penimbas.split('\n');
    // Baris terakhir dalam tatasusunan belum tentu lengkap; simpan semula.
    this.penimbas = barisan.pop() ?? '';
    for (const baris of barisan) {
      // Sokong CRLF tanpa merosakkan LF sahaja.
      const bersih = baris.endsWith('\r') ? baris.slice(0, -1) : baris;
      if (bersih === '') {
        // Baris kosong menutup satu peristiwa.
        if (this.barisData.length > 0) {
          peristiwa.push({ data: this.barisData.join('\n') });
          this.barisData = [];
        }
        continue;
      }
      // Komen SSE (cth ping OpenRouter): diabaikan.
      if (bersih.startsWith(':')) continue;
      // Spesifikasi SSE: satu ruang pilihan selepas titik dua dibuang.
      if (bersih.startsWith('data:')) {
        const isi = bersih.slice(5);
        this.barisData.push(isi.startsWith(' ') ? isi.slice(1) : isi);
      }
      // Baris lain (event:, id:, retry:) tidak dipakai oleh chat completions.
    }
    return peristiwa;
  }

  /**
   * Strim tamat: peristiwa terakhir yang tidak ditutup baris kosong
   * (penyedia kadang berakhir tanpa baris kosong terakhir).
   */
  tamat(): PeristiwaSse[] {
    const peristiwa: PeristiwaSse[] = [];
    if (this.barisData.length > 0) {
      peristiwa.push({ data: this.barisData.join('\n') });
      this.barisData = [];
    }
    this.penimbas = '';
    return peristiwa;
  }
}