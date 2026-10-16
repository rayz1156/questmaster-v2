// Selftest KZ-022c: pemilihan kelas untuk Intro Board dan Learning Board di menu sisi pelajar.
import { kelasDariLaluan, pilihKelasNav, pautanPapanKelas, KUNCI_KELAS_AKTIF, KUNCI_KELAS_PENDIDIK, kelasDariLaluanPendidik, pautanPapanKelasPendidik } from "../src/lib/kelasNav";

let jumlah = 0;
let gagal = 0;
function semak(nama: string, ok: boolean) {
  jumlah++;
  if (!ok) gagal++;
  console.log(`${ok ? "LULUS" : "GAGAL"}: ${nama}`);
}

const ids = ["a1", "b2", "c3"];

semak("kunci storan tetap", KUNCI_KELAS_AKTIF === "kz-kelas-aktif");
semak("laluan board", kelasDariLaluan("/participant/classes/b2/board") === "b2");
semak("laluan learning-board", kelasDariLaluan("/participant/classes/c3/learning-board") === "c3");
semak("laluan home = null", kelasDariLaluan("/participant/home") === null);
semak("laluan null = null", kelasDariLaluan(null) === null);
semak("laluan pendidik = null", kelasDariLaluan("/educator/classes/a1/board") === null);
semak("laluan menang atas simpanan", pilihKelasNav("/participant/classes/c3/board", "b2", ids, "a1") === "c3");
semak("simpanan menang atas lalai", pilihKelasNav("/participant/home", "b2", ids, "a1") === "b2");
semak("lalai bila tiada simpanan", pilihKelasNav("/participant/home", null, ids, "a1") === "a1");
semak("simpanan bukan kelas sendiri diabaikan", pilihKelasNav("/participant/home", "zz", ids, "a1") === "a1");
semak("laluan bukan kelas sendiri diabaikan", pilihKelasNav("/participant/classes/zz/board", null, ids, "b2") === "b2");
semak("tiada kelas = null", pilihKelasNav("/participant/home", "b2", [], null) === null);
const p = pautanPapanKelas("a1");
semak("pautan intro", p.intro === "/participant/classes/a1/board");
semak("pautan learning", p.learning === "/participant/classes/a1/learning-board");
semak("pautan dikodkan", pautanPapanKelas("a b").intro === "/participant/classes/a%20b/board");

// Pendidik (KZ-022d)
semak("kunci pendidik tetap", KUNCI_KELAS_PENDIDIK === "kz-kelas-aktif-pendidik");
semak("laluan pendidik board", kelasDariLaluanPendidik("/educator/classes/b2/board") === "b2");
semak("laluan pendidik overview", kelasDariLaluanPendidik("/educator/classes/b2") === "b2");
semak("senarai kelas pendidik = null", kelasDariLaluanPendidik("/educator/classes") === null);
semak("laluan pelajar bukan pendidik", kelasDariLaluanPendidik("/participant/classes/b2/board") === null);
semak("pilih ikut laluan pendidik", pilihKelasNav("/educator/classes/c3/people", "b2", ids, "a1", kelasDariLaluanPendidik) === "c3");
semak("pendidik: simpanan bila di luar kelas", pilihKelasNav("/educator/activities", "b2", ids, "a1", kelasDariLaluanPendidik) === "b2");
semak("pendidik: laluan pelajar tidak dikira", pilihKelasNav("/participant/classes/c3/board", null, ids, "a1", kelasDariLaluanPendidik) === "a1");
const q = pautanPapanKelasPendidik("a1");
semak("pautan pendidik intro", q.intro === "/educator/classes/a1/board");
semak("pautan pendidik learning", q.learning === "/educator/classes/a1/learning-board");

console.log(`\nJumlah: ${jumlah}, gagal: ${gagal}`);
if (gagal > 0) process.exit(1);
