/**
 * Ujian sendiri untuk fungsi tulen kelasStatus (V2-005).
 *
 * Jalankan:  npx tsx scripts/selftest-kelas-status.ts
 *
 * Tiada pangkalan data dan tiada jaringan: semuanya memanggil fungsi
 * tulen dengan data bercampur (tarikh NULL, pin, diarkib tetapi tidak
 * tamat, carian kod huruf kecil).
 */

import { statusKelas, susunKelas, tapisKelas, type KelasUntukStatus } from "../src/lib/kelasStatus";

let gagal = 0;
let bilangan = 0;

function semak(nama: string, syarat: boolean, butiran?: string) {
  bilangan++;
  if (syarat) {
    console.log(`LULUS: ${nama}`);
  } else {
    gagal++;
    console.error(`GAGAL: ${nama}${butiran ? ` (${butiran})` : ""}`);
  }
}

function kelas(lebih: Partial<KelasUntukStatus> & { id: string; name: string }): KelasUntukStatus {
  return {
    description: null,
    join_code: "ABCD1234",
    ended_at: null,
    is_archived: false,
    ...lebih,
  };
}

// ============================================================
// statusKelas
// ============================================================
semak("statusKelas: kelas biasa aktif",
  statusKelas(kelas({ id: "1", name: "A" })) === "aktif");
semak("statusKelas: ended_at bukan null jadi tamat",
  statusKelas(kelas({ id: "2", name: "B", ended_at: "2026-01-01T00:00:00Z" })) === "tamat");
semak("statusKelas: ended_at null string jadi aktif",
  statusKelas(kelas({ id: "3", name: "C", ended_at: null })) === "aktif");
semak("statusKelas: is_archived benar jadi tamat walaupun ended_at null",
  statusKelas(kelas({ id: "4", name: "D", is_archived: true })) === "tamat");
semak("statusKelas: ended_at dan is_archived null/false jadi aktif",
  statusKelas(kelas({ id: "5", name: "E", ended_at: null, is_archived: false })) === "aktif");

// ============================================================
// susunKelas
// ============================================================
const aktiviti = [
  { class_id: "k1", last_activity_at: "2026-09-01T10:00:00Z", pinned: false },
  { class_id: "k2", last_activity_at: "2026-09-10T10:00:00Z", pinned: true },
  { class_id: "k3", last_activity_at: null, pinned: false },
  { class_id: "k4", last_activity_at: "2026-08-01T10:00:00Z", pinned: false },
];

const senarai: KelasUntukStatus[] = [
  kelas({ id: "k1", name: "Sains", created_at: "2026-01-01T00:00:00Z" }),
  kelas({ id: "k2", name: "Matematik", created_at: "2026-01-02T00:00:00Z" }),
  kelas({ id: "k3", name: "Sejarah", created_at: "2026-01-03T00:00:00Z" }),
  kelas({ id: "k4", name: "Geografi", created_at: "2026-01-04T00:00:00Z" }),
];

const susun1 = susunKelas(senarai, aktiviti);
semak("susunKelas: kelas dipin di kedudukan pertama",
  susun1[0]?.id === "k2", JSON.stringify(susun1.map(k => k.id)));
semak("susunKelas: selepas pin, aktiviti menurun (k1 lebih baharu daripada k4)",
  susun1.slice(1, 3).map(k => k.id).join(",") === "k1,k4",
  JSON.stringify(susun1.map(k => k.id)));
semak("susunKelas: kelas tanpa tarikh aktiviti di hujung",
  susun1[3]?.id === "k3", JSON.stringify(susun1.map(k => k.id)));
semak("susunKelas: senarai asal tidak diubah",
  senarai.map(k => k.id).join(",") === "k1,k2,k3,k4");

// Tanpa aktiviti langsung: sandaran created_at menurun.
const susun2 = susunKelas(senarai, []);
semak("susunKelas: tanpa aktiviti, created_at menurun",
  susun2.map(k => k.id).join(",") === "k4,k3,k2,k1",
  JSON.stringify(susun2.map(k => k.id)));

// Tarikh NULL dalam data aktiviti tidak melempar ralat.
const aktivitiNull = [
  { class_id: "k1", last_activity_at: null, pinned: true },
  { class_id: "k2", last_activity_at: "2026-09-10T10:00:00Z", pinned: false },
];
const susun3 = susunKelas(senarai, aktivitiNull);
semak("susunKelas: pin dengan tarikh NULL masih di atas",
  susun3[0]?.id === "k1", JSON.stringify(susun3.map(k => k.id)));

// ============================================================
// tapisKelas
// ============================================================
const senaraiCari: KelasUntukStatus[] = [
  kelas({ id: "c1", name: "Fizik Lanjutan", description: "Mekanik dan haba", join_code: "AAAA1111" }),
  kelas({ id: "c2", name: "Kimia", description: "Tindak balas asid", join_code: "BBBB2222" }),
  kelas({ id: "c3", name: "Biologi", description: null, join_code: "cccc3333" }),
];

semak("tapisKelas: pertanyaan kosong memulangkan semua",
  tapisKelas(senaraiCari, "").length === 3 &&
  tapisKelas(senaraiCari, "   ").length === 3);
semak("tapisKelas: padan nama tidak peka huruf",
  tapisKelas(senaraiCari, "FIZIK").length === 1 &&
  tapisKelas(senaraiCari, "FIZIK")[0]?.id === "c1");
semak("tapisKelas: padan deskripsi",
  tapisKelas(senaraiCari, "asid").length === 1 &&
  tapisKelas(senaraiCari, "asid")[0]?.id === "c2");
semak("tapisKelas: padan join_code huruf kecil",
  tapisKelas(senaraiCari, "cccc3333").length === 1 &&
  tapisKelas(senaraiCari, "cccc3333")[0]?.id === "c3");
semak("tapisKelas: padan join_code dengan huruf besar walaupun kod huruf kecil",
  tapisKelas(senaraiCari, "CCCC").length === 1 &&
  tapisKelas(senaraiCari, "CCCC")[0]?.id === "c3");
semak("tapisKelas: jarak di hujung diabaikan",
  tapisKelas(senaraiCari, "  Kimia  ").length === 1);
semak("tapisKelas: tiada padan memulangkan senarai kosong",
  tapisKelas(senaraiCari, "zuhur").length === 0);
semak("tapisKelas: senarai asal tidak diubah",
  senaraiCari.length === 3);

// ============================================================
// Keputusan
// ============================================================
console.log("");
if (gagal > 0) {
  console.error(`SESUATU GAGAL: ${gagal} daripada ${bilangan} semakan.`);
  process.exit(1);
}
console.log(`SEMUA LULUS: ${bilangan} semakan.`);