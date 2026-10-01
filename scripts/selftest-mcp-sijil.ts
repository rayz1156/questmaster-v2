/**
 * Ujian sendiri untuk alat MCP sijil reka bentuk penuh (V2-015), tanpa
 * pangkalan data: pembalut dalam certificate-tools.ts dipanggil dengan
 * fetch global digantung supaya URL, badan dan pemetaan hasil boleh
 * disemka dengan tepat.
 *
 * Jalankan: npx tsx scripts/selftest-mcp-sijil.ts
 */
import {
  createCertificateTemplate,
  updateCertificateTemplate,
  createCertificateAssetTicket,
  finalizeCertificateAsset,
  previewCertificate,
  listCertificateTemplates,
  updateCertificateLibraryItem,
} from "../src/lib/mcp/certificate-tools";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log("PASS " + name);
  } else {
    fail++;
    console.log("FAIL " + name + " :: " + JSON.stringify(extra));
  }
}

const TOKEN = "token-palsu";
const realFetch = globalThis.fetch;

type Panggilan = {
  url: string;
  method: string;
  auth: string;
  body: Record<string, unknown> | null;
};

/** Baca medan mode daripada badan JSON yang tidak ditaip. */
const modBadan = (v: unknown): string | undefined => (v as { mode?: string } | null)?.mode;

/** Gantung fetch global; rekod setiap panggilan dan balas payload tetap. */
function stubFetch(payload: unknown, status = 200) {
  const panggilan: Panggilan[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    panggilan.push({
      url: String(input),
      method: init?.method ?? "GET",
      auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return panggilan;
}

async function run() {
  /* 1. Cipta templat: badan dan penguraian hasil. */
  let c = stubFetch({ template: { id: "t-1", title: "Sijil Robotik" } }, 201);
  const r1 = await createCertificateTemplate(TOKEN, {
    class_id: "k-1",
    title: "Sijil Robotik",
    criteria: { type: "all_members" },
    layout: { mode: "full_background" },
  });
  check("cipta: templat dipulangkan",
    r1.id === "t-1" && r1.title === "Sijil Robotik", r1);
  check("cipta: URL route templates betul",
    c[0].url.endsWith("/api/classes/k-1/certificates/templates")
      && c[0].method === "POST"
      && c[0].auth === `Bearer ${TOKEN}`,
    c[0]);
  check("cipta: layout dihantar",
    modBadan(c[0].body?.layout) === "full_background" && c[0].body?.title === "Sijil Robotik", c[0]);

  /* 2. Cipta templat: input jahat ditolak sebelum rangkaian. */
  let ditolak = false;
  try { await createCertificateTemplate(TOKEN, { class_id: "k-1", title: "  " }); }
  catch { ditolak = true; }
  check("cipta: tajuk kosong ditolak", ditolak);

  /* 3. Kemas kini templat: hanya medan diberi dihantar. */
  c = stubFetch({ template: { id: "t-1", background_path: null } });
  await updateCertificateTemplate(TOKEN, {
    class_id: "k-1",
    template_id: "t-1",
    layout: { mode: "standard" },
    clear_background: true,
  });
  check("kemas kini: PATCH route templates dengan clear_background",
    c[0].method === "PATCH"
      && c[0].body?.template_id === "t-1"
      && c[0].body?.clear_background === true
      && modBadan(c[0].body?.layout) === "standard"
      && c[0].body?.title === undefined,
    c[0]);

  /* 3b. Kemas kini fields (V2-016b) dan clear_signature. */
  c = stubFetch({ template: { id: "t-1", fields: { course: "Bengkel" } } });
  await updateCertificateTemplate(TOKEN, {
    class_id: "k-1",
    template_id: "t-1",
    fields: { course: "Bengkel Robotik", date_start: "2026-10-01", location: "Dewan A" },
    clear_signature: true,
  });
  check("kemas kini: fields dihantar dan clear_signature",
    c[0].body?.fields !== undefined
      && (c[0].body?.fields as Record<string, unknown>)?.course === "Bengkel Robotik"
      && c[0].body?.clear_signature === true,
    c[0]);

  /* 4. Kemas kini: tiada medan ditolak sebelum rangkaian. */
  ditolak = false;
  try { await updateCertificateTemplate(TOKEN, { class_id: "k-1", template_id: "t-1" }); }
  catch { ditolak = true; }
  check("kemas kini: tiada medan ditolak", ditolak);

  /* 5. Tiket aset: badan, arahan curl dan penguraian. */
  c = stubFetch({
    upload_url: "https://s.example/storage/v1/object/upload/sign/x?token=abc",
    token: "abc",
    path: "k-1/t-1/background-0011.png",
    expires_in: 7200,
    method: "PUT",
    headers: { "Content-Type": "image/png" },
  });
  const r5 = await createCertificateAssetTicket(TOKEN, "k-1", "t-1", "background", "image/png", 2621440);
  check("tiket: badan kind/mimeType/size betul",
    c[0].url.endsWith("/api/classes/k-1/certificates/templates/t-1/asset-ticket")
      && c[0].body?.kind === "background"
      && c[0].body?.mimeType === "image/png"
      && c[0].body?.size === 2621440,
    c[0]);
  check("tiket: arahan curl sedia guna mengandungi upload_url",
    r5.curl === 'curl -X PUT --upload-file <file> -H "Content-Type: image/png" "https://s.example/storage/v1/object/upload/sign/x?token=abc"',
    r5.curl);
  check("tiket: path dan expires_in dipulangkan",
    r5.path === "k-1/t-1/background-0011.png" && r5.expires_in === 7200, r5);

  /* 5b. Tiket aset kind signature (V2-016b): badan kind betul. */
  c = stubFetch({
    upload_url: "https://s.example/storage/v1/object/upload/sign/y?token=xyz",
    token: "xyz",
    path: "k-1/t-1/signature-0011.png",
    expires_in: 7200,
    method: "PUT",
    headers: { "Content-Type": "image/png" },
  });
  await createCertificateAssetTicket(TOKEN, "k-1", "t-1", "signature", "image/png", 524288);
  check("tiket: kind signature diterima",
    c[0].body?.kind === "signature" && c[0].body?.size === 524288,
    c[0]);

  /* 6. Finalize: badan dan penguraian templat. */
  c = stubFetch({ template: { id: "t-1", background_path: "k-1/t-1/background-0011.png" } });
  const r6 = await finalizeCertificateAsset(TOKEN, "k-1", "t-1", "background", "k-1/t-1/background-0011.png");
  check("finalize: badan kind/path betul",
    c[0].url.endsWith("/api/classes/k-1/certificates/templates/t-1/asset-finalize")
      && c[0].body?.kind === "background"
      && c[0].body?.path === "k-1/t-1/background-0011.png",
    c[0]);
  check("finalize: templat terkini dipulangkan",
    r6.background_path === "k-1/t-1/background-0011.png", r6);

  /* 7. Pratonton: format=url dan nama pilihan. */
  c = stubFetch({ url: "https://s.example/sample.pdf?token=z", expires_in: 600 });
  const r7 = await previewCertificate(TOKEN, "k-1", "t-1", "Aisyah Binti Rahman");
  check("pratonton: URL route sample format=url betul",
    c[0].url.endsWith("/api/classes/k-1/certificates/templates/t-1/sample?format=url")
      && c[0].method === "POST",
    c[0]);
  check("pratonton: nama contoh dihantar",
    c[0].body?.name === "Aisyah Binti Rahman", c[0]);
  check("pratonton: hasil { url, expires_in }",
    r7.url === "https://s.example/sample.pdf?token=z" && r7.expires_in === 600, r7);

  /* 8. Pratonton tanpa nama: badan kosong. */
  c = stubFetch({ url: "https://s.example/sample.pdf", expires_in: 600 });
  await previewCertificate(TOKEN, "k-1", "t-1");
  check("pratonton: tanpa nama badan tidak membawa name", c[0].body?.name === undefined, c[0]);

  /* 9. Senarai: boolean ada latar/logo/tandatangan dan medan fields (V2-016b). */
  c = stubFetch({
    templates: [
      { id: "t-1", title: "A", criteria: { type: "all_members" }, layout: { mode: "full_background" }, background_path: "k-1/t-1/b.png", logo_path: null, fields: { course: "Bengkel" }, updated_at: "2026-09-30" },
      { id: "t-2", title: "B", criteria: { type: "min_score" }, layout: {}, background_path: "x", logo_path: "y", has_signature: true, fields: {}, updated_at: null },
    ],
  });
  const r9 = await listCertificateTemplates(TOKEN, "k-1");
  check("senarai: GET route templates",
    c[0].method === "GET" && c[0].url.endsWith("/api/classes/k-1/certificates/templates"), c[0]);
  check("senarai: has_background dan has_logo dipetah",
    r9.templates.length === 2
      && r9.templates[0].has_background === true
      && r9.templates[0].has_logo === false
      && r9.templates[1].has_logo === true,
    r9);
  check("senarai: layout dan updated_at dibawa",
    r9.templates[0].layout?.mode === "full_background"
      && r9.templates[0].updated_at === "2026-09-30"
      && r9.templates[1].updated_at === null,
    r9);
  check("senarai: fields dibawa (V2-016b)",
    (r9.templates[0].fields as Record<string, unknown> | null)?.course === "Bengkel"
      && r9.templates[1].fields !== null,
    r9);
  check("senarai: has_signature daripada has_signature route (V2-016b)",
    r9.templates[0].has_signature === false && r9.templates[1].has_signature === true,
    r9);

  /* 10. Item Templat saya (V2-016b): PATCH tajuk dan/atau layout. */
  c = stubFetch({ item: { id: "lib-1", title: "Sijil Baru" } });
  await updateCertificateLibraryItem(TOKEN, {
    library_id: "lib-1",
    title: "Sijil Baru",
    layout: { mode: "full_background", signer: { x: 0.1, y: 0.9, maxWidth: 0.3, size: 12, color: "#001F4B" } },
  });
  check("pustaka: PATCH route item dengan tajuk dan layout",
    c[0].method === "PATCH"
      && c[0].url.endsWith("/api/certificate-library/lib-1")
      && c[0].body?.title === "Sijil Baru"
      && (c[0].body?.layout as Record<string, unknown> | undefined)?.mode === "full_background",
    c[0]);

  /* 11. Item Templat saya: tanpa medan ditolak sebelum rangkaian. */
  ditolak = false;
  try { await updateCertificateLibraryItem(TOKEN, { library_id: "lib-1" }); }
  catch { ditolak = true; }
  check("pustaka: tiada tajuk dan tiada layout ditolak", ditolak);

  globalThis.fetch = realFetch;
  console.log("");
  console.log(`Jumlah: ${pass} lulus, ${fail} gagal`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
