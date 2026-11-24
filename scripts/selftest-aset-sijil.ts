// KZ-B: ujian aset sijil tanpa shell. Jalankan: npx tsx scripts/selftest-aset-sijil.ts
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { buangLatarPutih, imejDariBase64, pautanMuatTurun, bacaImejPermintaan, RalatAset } from "../src/lib/sijil/asetMasuk";
import { normaliseTemplatEmel } from "../src/lib/sijil/tetapanLalai";

let lulus = 0;
let gagal = 0;
function semak(nama: string, ok: boolean, info = "") {
  if (ok) lulus += 1; else gagal += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${nama}${info ? " :: " + info : ""}`);
}

// Tandatangan JPEG 40x20: latar putih, garis dakwat biru gelap di tengah.
const w = 40, h = 20;
const rgba = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  const dakwat = y >= 8 && y <= 11;
  rgba[i] = dakwat ? 20 : 255; rgba[i + 1] = dakwat ? 30 : 255; rgba[i + 2] = dakwat ? 90 : 255; rgba[i + 3] = 255;
}
const jpg = jpeg.encode({ data: rgba, width: w, height: h }, 95).data;
const b64 = Buffer.from(jpg).toString("base64");

const imej = imejDariBase64("data:image/jpeg;base64," + b64);
semak("base64 JPEG diterima", imej.mime === "image/jpeg");

const hasil = buangLatarPutih(imej);
semak("hasil PNG", hasil.mime === "image/png" && hasil.bytes[0] === 0x89);
const png = PNG.sync.read(Buffer.from(hasil.bytes));
const alfa = (x: number, y: number) => png.data[(y * w + x) * 4 + 3];
semak("sudut putih lutsinar", alfa(0, 0) === 0 && alfa(39, 19) === 0, `alfa=${alfa(0, 0)},${alfa(39, 19)}`);
semak("dakwat kekal legap", alfa(20, 9) > 200, `alfa=${alfa(20, 9)}`);

try { imejDariBase64(Buffer.from("bukan imej sama sekali").toString("base64")); semak("bukan imej ditolak", false); }
catch (e) { semak("bukan imej ditolak", e instanceof RalatAset && e.status === 415); }

try { imejDariBase64(Buffer.alloc(1_200_000, 1).toString("base64")); semak("base64 > 1 MB ditolak", false); }
catch (e) { semak("base64 > 1 MB ditolak", e instanceof RalatAset && e.status === 413); }

semak("pautan Drive ditukar",
  pautanMuatTurun("https://drive.google.com/file/d/AbC_12-x/view?usp=sharing") === "https://drive.google.com/uc?export=download&id=AbC_12-x");
semak("pautan lain kekal", pautanMuatTurun("https://export.canva.com/x.png") === "https://export.canva.com/x.png");

(async () => {
  try { await bacaImejPermintaan({ source_url: "https://a/b.png", content_base64: b64 }, "logo"); semak("dua sumber ditolak", false); }
  catch (e) { semak("dua sumber ditolak", e instanceof RalatAset); }
  try { await bacaImejPermintaan({ source_url: "http://169.254.169.254/latest" }, "logo"); semak("http ditolak", false); }
  catch (e) { semak("http ditolak", e instanceof RalatAset); }

  const t1 = normaliseTemplatEmel({ subject: " Sijil {kursus} ", reply_to: "a@b.com", asing: 1 });
  semak("templat e-mel dinormalkan", t1.nilai?.subject === "Sijil {kursus}" && !("asing" in (t1.nilai ?? {})));
  semak("reply_to tidak sah ditolak", !!normaliseTemplatEmel({ reply_to: "bukan emel" }).ralat);
  semak("subjek baris baharu dipadatkan", normaliseTemplatEmel({ subject: "a\r\nBcc: x@y.com" }).nilai?.subject === "a Bcc: x@y.com");

  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  if (gagal > 0) process.exit(1);
})();
