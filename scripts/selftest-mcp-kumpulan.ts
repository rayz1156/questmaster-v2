/**
 * Ujian sendiri untuk alat MCP challenge dan kumpulan, tanpa pangkalan data.
 *
 * Jalankan:  npx tsx scripts/selftest-mcp-kumpulan.ts
 *
 * Lima bahagian:
 *   1. argumen import_teams_csv dan laluan dryRun;
 *   2. import_teams_csv melalui fetch tiruan: laluan gembira, 400 dengan
 *      senarai ralat baris, dan 403 route;
 *   3. update_challenge dan delete_challenge dengan klien RLS tiruan:
 *      laluan gembira, gerbang confirm, tiada medan, dan penolakan RLS;
 *   4. set_team_leader dengan klien RLS tiruan: laluan gembira, ahli bukan
 *      ahli, sasaran sudah ketua, dan baris sifar bila RLS menolak;
 *   5. groupTeamsWithMembers dan formatRowErrors (fungsi tulen).
 *
 * Semua fungsi yang diuji datang daripada src/lib/mcp/challenge-tools.ts dan
 * src/lib/mcp/team-tools.ts, yang tidak mengimport session.ts/db.ts.
 */
import {
  buildChallengePatch,
  updateChallenge,
  deleteChallenge,
} from "../src/lib/mcp/challenge-tools";
import {
  parseImportTeamsArgs,
  teamsImportPath,
  formatRowErrors,
  groupTeamsWithMembers,
  setTeamLeader,
  importTeamsCsv,
} from "../src/lib/mcp/team-tools";

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

const CSV_OK = "nama_kumpulan,nama_ahli,emel,ketua\r\nOrion,Ali,ali@x.edu,ya\r\n";

/* ===== Bahagian 1: argumen import kumpulan ===== */

function ujianImportArgs() {
  const prev = parseImportTeamsArgs({ content: CSV_OK });
  check("import kumpulan: mode lalai ialah preview", prev.ok && prev.mode === "preview", prev);
  const commit = parseImportTeamsArgs({ content: CSV_OK, mode: "commit" });
  check("import kumpulan: mode commit diterima", commit.ok && commit.mode === "commit");
  check("import kumpulan: replace lalai false", prev.ok && prev.replace === false);
  const rep = parseImportTeamsArgs({ content: CSV_OK, replace: true });
  check("import kumpulan: replace true diterima", rep.ok && rep.replace === true);

  check("import kumpulan: kandungan kosong ditolak", !parseImportTeamsArgs({ content: "  " }).ok);
  check("import kumpulan: kandungan tiada ditolak", !parseImportTeamsArgs({}).ok);
  check("import kumpulan: kandungan besar ditolak",
    !parseImportTeamsArgs({ content: "x".repeat(500_001) }).ok);
  check("import kumpulan: mode asing ditolak", !parseImportTeamsArgs({ content: "x", mode: "semua" }).ok);
  check("import kumpulan: replace bukan boolean ditolak", !parseImportTeamsArgs({ content: "x", replace: "ya" }).ok);

  check("laluan preview guna dryRun=1", teamsImportPath("c1", "preview").endsWith("/api/classes/c1/teams/import-csv?dryRun=1"), teamsImportPath("c1", "preview"));
  check("laluan commit tanpa dryRun", teamsImportPath("c1", "commit").endsWith("/api/classes/c1/teams/import-csv"), teamsImportPath("c1", "commit"));
}

/* ===== Bahagian 2: importTeamsCsv melalui fetch tiruan ===== */

const TOKEN = "token-palsu";
const realFetch = globalThis.fetch;
let lastCall: { url: string; body: any; auth: string } | null = null;

function stubFetch(status: number, payload: unknown) {
  globalThis.fetch = (async (input: any, init?: any) => {
    lastCall = {
      url: String(input),
      body: init?.body ? JSON.parse(init.body) : null,
      auth: init?.headers?.Authorization ?? "",
    };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function ujianImportFetch() {
  // 2a. Laluan gembira preview.
  stubFetch(200, { ok: true, dry_run: true, teams_created: 1, teams: [], emails: [], warnings: [] });
  const r2a: any = await importTeamsCsv(TOKEN, "kelas-1", { content: CSV_OK });
  check("import: preview menghantar dryRun=1 dengan Bearer",
    !!lastCall?.url.includes("?dryRun=1") && lastCall?.auth === `Bearer ${TOKEN}` && r2a.mode === "preview",
    { last: lastCall, r: r2a });
  check("import: badan mengandungi content dan replace=false",
    lastCall?.body.content === CSV_OK && lastCall?.body.replace === false, lastCall?.body);

  // 2b. Commit.
  stubFetch(200, { ok: true, dry_run: false, teams_created: 1, joined_now: 1, pending: 0, teams: [], emails: [], warnings: [] });
  const r2b: any = await importTeamsCsv(TOKEN, "kelas-1", { content: CSV_OK, mode: "commit", replace: true });
  check("import: commit tanpa dryRun dan replace=true",
    !lastCall?.url.includes("dryRun") && lastCall?.body.replace === true && r2b.mode === "commit",
    { url: lastCall?.url, body: lastCall?.body });

  // 2c. Route 400 dengan senarai ralat baris: butiran naik dalam mesej.
  stubFetch(400, {
    ok: false,
    error: "Nothing was imported. Fix the rows below and upload again.",
    errors: [{ row: 3, message: "the team name is empty." }],
  });
  let ok2c = false;
  try {
    await importTeamsCsv(TOKEN, "kelas-1", { content: "rosak", mode: "commit" });
  } catch (e: any) {
    ok2c = /baris 3/.test(e.message) && /team name/.test(e.message);
  }
  check("import: ralat baris dari route naik dengan nombor baris", ok2c);

  // 2d. Route 403 (bukan pendidik kelas): mesej route dikekalkan.
  stubFetch(403, { error: "Only an educator of this class can import teams." });
  let ok2d = false;
  try {
    await importTeamsCsv(TOKEN, "kelas-1", { content: CSV_OK, mode: "commit" });
  } catch (e: any) {
    ok2d = /educator of this class/.test(e.message);
  }
  check("import: 403 route menolak dengan mesej kebenaran", ok2d);

  // 2e. Argumen rosak dihalang SEBELUM rangkaian.
  globalThis.fetch = (async () => {
    throw new Error("rangkaian tidak patut disentuh");
  }) as typeof fetch;
  let ok2e = false;
  try {
    await importTeamsCsv(TOKEN, "kelas-1", { content: "   " });
  } catch {
    ok2e = true;
  }
  check("import: kandungan kosong ditolak tanpa menyentuh rangkaian", ok2e);
}

/* ===== Bahagian 3: challenge dengan klien RLS tiruan ===== */

/**
 * Klien tiruan yang meniru rantaian PostgREST yang dipakai oleh challenge
 * tools: from().select().eq().maybeSingle() dan from().update().eq().select().
 */
function buatKlienChallenge(opts: {
  wujud?: boolean;
  rlsTolakUpdate?: boolean;
}) {
  const calls: Array<{ op: string; table: string; payload?: any }> = [];
  const row = { id: "ch-1", hunt_id: "h-1", title: "Lama" };
  return {
    calls,
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                maybeSingle() {
                  calls.push({ op: "get", table });
                  return Promise.resolve({
                    data: opts.wujud === false ? null : { ...row },
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(payload: any) {
          return {
            eq(_col: string, _val: string) {
              return {
                select(_cols2: string) {
                  calls.push({ op: "update", table, payload });
                  return Promise.resolve({
                    data: opts.rlsTolakUpdate ? [] : [{ ...row, ...payload }],
                    error: null,
                  });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(_col: string, _val: string) {
              calls.push({ op: "delete", table });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

async function ujianChallenge() {
  // 3a. Patch: hanya medan yang diberi.
  const p1 = buildChallengePatch({ title: "  Baru  ", points: 25 });
  check("challenge: patch tajuk dipotong ruang dan mata dikekalkan",
    p1.ok && p1.value.title === "Baru" && p1.value.points === 25, p1);

  const p2 = buildChallengePatch({ title: "   " });
  check("challenge: tajuk kosong ditolak", !p2.ok);

  const p3 = buildChallengePatch({ points: -1 });
  check("challenge: mata negatif ditolak", !p3.ok);

  const p4 = buildChallengePatch({ order_idx: 1.5 });
  check("challenge: order_idx bukan integer ditolak", !p4.ok);

  const p5 = buildChallengePatch({ points: 10.9 });
  check("challenge: mata perpuluhan ditolak", !p5.ok, p5);

  const p6 = buildChallengePatch({});
  check("challenge: tiada medan ditolak", !p6.ok && /Tiada medan/.test(p6.error));

  const p7 = buildChallengePatch({ answer: "Kuala Lumpur" });
  check("challenge: answer boleh dikemas kini", p7.ok && p7.value.answer === "Kuala Lumpur");

  // 3b. Kemas kini melalui klien RLS.
  const k1 = buatKlienChallenge({});
  const r3b = await updateChallenge(k1 as any, { challenge_id: "ch-1", title: "Baru" });
  check("challenge: kemas kini menghantar patch ke qm_challenges dan pulangkan baris",
    r3b.title === "Baru" && k1.calls[1].op === "update" && k1.calls[1].table === "qm_challenges",
    [r3b, k1.calls]);

  // 3c. Tiada medan: dihalang sebelum pertanyaan pertama.
  const k3 = buatKlienChallenge({});
  let ok3c = false;
  try {
    await updateChallenge(k3 as any, { challenge_id: "ch-1" });
  } catch (e: any) {
    ok3c = /Tiada medan/.test(e.message) && k3.calls.length === 0;
  }
  check("challenge: patch kosong ditolak tanpa pertanyaan", ok3c);

  // 3d. Baris tidak kelihatan (bukan pemilik): ralat jelas.
  const k4 = buatKlienChallenge({ wujud: false });
  let ok3d = false;
  try {
    await updateChallenge(k4 as any, { challenge_id: "ch-1", title: "Baru" });
  } catch (e: any) {
    ok3d = /tiada akses/.test(e.message);
  }
  check("challenge: baris tidak kelihatan memberi ralat akses", ok3d);

  // 3e. RLS menolak kemas kini (sifar baris): ralat jelas, bukan kejayaan senyap.
  const k5 = buatKlienChallenge({ rlsTolakUpdate: true });
  let ok3e = false;
  try {
    await updateChallenge(k5 as any, { challenge_id: "ch-1", title: "Baru" });
  } catch (e: any) {
    ok3e = /tidak berlaku/.test(e.message);
  }
  check("challenge: RLS yang menolak dikesan daripada sifar baris", ok3e);

  // 3f. Padam: gerbang confirm.
  const k6 = buatKlienChallenge({});
  let ok3f = false;
  try {
    await deleteChallenge(k6 as any, "ch-1", undefined);
  } catch (e: any) {
    ok3f = /confirm/.test(e.message) && k6.calls.length === 0;
  }
  check("challenge: padam tanpa confirm dihalang sebelum pertanyaan", ok3f);

  const k7 = buatKlienChallenge({});
  const r3f = await deleteChallenge(k7 as any, "ch-1", true);
  check("challenge: padam dengan confirm memanggil delete",
    r3f.deleted === true && k7.calls[1].op === "delete", [r3f, k7.calls]);
}

/* ===== Bahagian 4: setTeamLeader dengan klien RLS tiruan ===== */

type MemberRow = { team_id: string; user_id: string; role: string };

/**
 * Klien tiruan yang menyimpan qm_team_members dalam tatasusunan dan
 * meniru RLS melalui penapis boleh laras. Kalau bolehTulis false, kemas
 * kini tidak melangkau mana-mana baris (seperti RLS sebenar).
 */
function buatKlienKumpulan(opts: {
  members?: MemberRow[];
  bolehTulis?: boolean;
  teamWujud?: boolean;
}) {
  const members = (opts.members ?? []).map((m) => ({ ...m }));
  const bolehTulis = opts.bolehTulis !== false;
  const teamWujud = opts.teamWujud !== false;
  return {
    members,
    from(table: string) {
      if (table === "qm_teams") {
        return {
          select(_cols: string) {
            return {
              eq(_c: string, _v: string) {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: teamWujud ? { id: "t-1", class_id: "c-1", hunt_id: null } : null,
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      // qm_team_members
      const state = { eqTeam: "", eqUser: "", eqRole: "", neqUser: "" };
      const api = {
        select(_cols: string) {
          return {
            eq(_c: string, v: string) {
              state.eqTeam = v;
              return {
                eq(_c2: string, v2: string) {
                  state.eqUser = v2;
                  return {
                    maybeSingle() {
                      const found = members.find(
                        (m) => m.team_id === state.eqTeam && m.user_id === state.eqUser
                      );
                      return Promise.resolve({ data: found ? { ...found } : null, error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update(payload: any) {
          return {
            eq(_c: string, v: string) {
              state.eqTeam = v;
              return {
                // Rantaian kedua: .eq("role","leader") atau .eq("user_id",userId)
                eq(_c2: string, v2: string) {
                  // Kesan penapis kedua daripada NAMA lajur, bukan susunan.
                  if (_c2 === "role") state.eqRole = v2;
                  if (_c2 === "user_id") state.eqUser = v2;
                  return {
                    // .eq("role","leader").neq("user_id", userId) tanpa select
                    neq(_c3: string, v3: string) {
                      state.neqUser = v3;
                      // Laksanakan penurunan ke atas salinan tiruan.
                      for (const m of members) {
                        if (
                          m.team_id === state.eqTeam &&
                          m.role === state.eqRole &&
                          m.user_id !== state.neqUser &&
                          bolehTulis
                        ) {
                          m.role = payload.role;
                        }
                      }
                      return Promise.resolve({ data: null, error: null });
                    },
                    // .eq("user_id", userId).select("user_id")
                    select(_cols: string) {
                      if (bolehTulis) {
                        for (const m of members) {
                          if (m.team_id === state.eqTeam && m.user_id === state.eqUser) {
                            m.role = payload.role;
                          }
                        }
                      }
                      return Promise.resolve({
                        data: bolehTulis
                          ? members
                              .filter((m) => m.team_id === state.eqTeam && m.user_id === state.eqUser)
                              .map((m) => ({ ...m, role: payload.role }))
                          : [],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
      return api;
    },
  };
}

async function ujianSetLeader() {
  const ahli = [
    { team_id: "t-1", user_id: "u-lama", role: "leader" },
    { team_id: "t-1", user_id: "u-baru", role: "member" },
    { team_id: "t-1", user_id: "u-ketiga", role: "member" },
  ];

  // 4a. Laluan gembira: ketua lama diturunkan, baru dinaikkan.
  const k1 = buatKlienKumpulan({ members: ahli });
  const r4a = await setTeamLeader(k1 as any, "t-1", "u-baru");
  check("ketua: sasaran menjadi ketua",
    r4a.leader_user_id === "u-baru" && r4a.demoted === true, r4a);
  check("ketua: hanya satu ketua selepas pertukaran",
    k1.members.filter((m) => m.role === "leader").length === 1, k1.members);
  check("ketua: ketua lama kini ahli biasa",
    k1.members.find((m) => m.user_id === "u-lama")?.role === "member", k1.members);

  // 4b. Sasaran bukan ahli: ditolak tanpa menulis apa-apa.
  const k2 = buatKlienKumpulan({ members: ahli });
  let ok4b = false;
  try {
    await setTeamLeader(k2 as any, "t-1", "u-tetamu");
  } catch (e: any) {
    ok4b = /bukan ahli/.test(e.message);
  }
  check("ketua: bukan ahli ditolak dengan jelas", ok4b);
  check("ketua: penolakan bukan ahli tidak mengubah baris",
    k2.members.find((m) => m.user_id === "u-lama")?.role === "leader", k2.members);

  // 4c. Sasaran sudah ketua: tiada perubahan diperlukan.
  const k3 = buatKlienKumpulan({ members: ahli });
  const r4c = await setTeamLeader(k3 as any, "t-1", "u-lama");
  check("ketua: sasaran sudah ketua kekal tanpa perubahan",
    r4c.demoted === false && k3.members.filter((m) => m.role === "leader").length === 1, [r4c, k3.members]);

  // 4d. RLS menolak kemas kini: ralat, bukan kejayaan senyap.
  const k4 = buatKlienKumpulan({ members: ahli, bolehTulis: false });
  let ok4d = false;
  try {
    await setTeamLeader(k4 as any, "t-1", "u-baru");
  } catch (e: any) {
    ok4d = /tidak berlaku/.test(e.message);
  }
  check("ketua: RLS yang menolak dikesan daripada sifar baris", ok4d);

  // 4e. Kumpulan tidak kelihatan: ralat akses.
  const k5 = buatKlienKumpulan({ teamWujud: false });
  let ok4e = false;
  try {
    await setTeamLeader(k5 as any, "t-tiada", "u-baru");
  } catch (e: any) {
    ok4e = /tiada akses/.test(e.message);
  }
  check("ketua: kumpulan tidak kelihatan memberi ralat akses", ok4e);
}

/* ===== Bahagian 5: fungsi tulen ===== */

function ujianTulen() {
  const teams = [{ id: "t-1" }, { id: "t-2" }];
  const members = [
    { team_id: "t-1", user_id: "a", role: "leader" },
    { team_id: "t-1", user_id: "b", role: "member" },
    { team_id: "t-2", user_id: "c", role: "member" },
    { team_id: "t-tiada", user_id: "d", role: "member" },
  ];
  const g = groupTeamsWithMembers(teams, members as any);
  check("kumpul: ahli disusun mengikut kumpulan",
    g["t-1"].members.length === 2 && g["t-2"].members.length === 1, g);
  check("kumpul: ketua dikenal pasti daripada role leader",
    g["t-1"].leader_user_id === "a" && g["t-2"].leader_user_id === null, g);
  check("kumpul: ahli kumpulan lama dilangkau", g["t-tiada"] === undefined, g);

  check("ralat baris: kosong memulangkan null", formatRowErrors([]) === null);
  const msg = formatRowErrors([{ row: 2, message: "email is empty." }, { row: 5, message: "dua ketua." }]);
  check("ralat baris: nombor baris dimasukkan", !!msg?.includes("baris 2") && !!msg?.includes("baris 5"), msg);
  const banyak = formatRowErrors(
    Array.from({ length: 25 }, (_, i) => ({ row: i + 2, message: `ralat ${i}` }))
  );
  check("ralat baris: lebih 20 diringkaskan", banyak?.includes("ralat lain") === true, banyak);
}

async function run() {
  ujianImportArgs();
  await ujianImportFetch();
  await ujianChallenge();
  await ujianSetLeader();
  ujianTulen();
  console.log("");
  console.log(`Jumlah: ${pass} lulus, ${fail} gagal`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
