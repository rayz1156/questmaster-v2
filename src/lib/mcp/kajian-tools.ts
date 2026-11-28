// lib/mcp/kajian-tools.ts
//
// KZ-UTT Fasa 4: tool MCP untuk pelan pengukuran T1, T2, T3, status susulan
// dan eksport data kajian. Semuanya memanggil route aplikasi sedia ada
// (/api/live/quizzes/[quizId]/research dan /research/export), jadi semakan
// kebenaran (requireQuizHost) dan logik tetingkap tidak disalin di sini.

import type { Role } from "./session";
import type { ToolDef } from "./tools";
import { callApi, callApiText } from "./api";
import { wajib } from "./tambahan-tools";

const STAFF: Role[] = ["admin", "educator"];

/** Had saiz CSV yang dipulangkan terus kepada model (aksara). */
export const HAD_CSV_MCP = 200_000;

export const TOOLS_KAJIAN: ToolDef[] = [
  {
    name: "get_measurement_plan",
    title: "Pelan pengukuran T1, T2, T3",
    description:
      "Pelan pengukuran kajian bagi satu Live Quiz mod ujian (Cabaran Solo): masa mula Modul 1, masa tamat kursus, " +
      "suis e-mel susulan, tetingkap T2 dan nilai standard (T2 14 hari; T3 hari 80 hingga 110). Untuk status " +
      "setiap peserta guna get_followup_status.",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { quiz_id: { type: "string" } }, required: ["quiz_id"] },
    handler: async (args, s) => {
      const r = await callApi<Record<string, unknown>>(s.accessToken, `/api/live/quizzes/${wajib(args, "quiz_id")}/research`);
      return { plan: r.plan, standard: r.standard, class_linked: r.classLinked, t2_window: r.t2Window };
    },
  },
  {
    name: "set_measurement_plan",
    title: "Tetapkan pelan pengukuran",
    description:
      "Simpan pelan pengukuran bagi Live Quiz mod ujian yang dikongsi dengan kelas. Tarikh dalam ISO 8601. " +
      "emails_enabled lalai true (e-mel T2 dan T3 automatik kepada ahli kelas yang belum menolak atau berhenti " +
      "langganan). consent_text pilihan: kosong bermakna semua peserta dianggap bersetuju. day_length_sec hanya " +
      "untuk ujian (lalai 86400). Nilai hari T2 dan T3 ialah standard dan tidak boleh diubah.",
    roles: STAFF,
    write: true,
    inputSchema: {
      type: "object",
      properties: {
        quiz_id: { type: "string" },
        module1_start_at: { type: "string", description: "ISO 8601, atau kosong" },
        course_end_at: { type: "string", description: "ISO 8601, masa modul terakhir tamat" },
        emails_enabled: { type: "boolean", description: "Lalai true" },
        consent_text: { type: "string", description: "Pilihan, 20 hingga 5000 aksara" },
        day_length_sec: { type: "number", description: "60 hingga 86400, lalai 86400" },
      },
      required: ["quiz_id"],
    },
    handler: async (args, s) => {
      const quizId = wajib(args, "quiz_id");
      // Gabung dengan pelan sedia ada supaya medan yang tidak diberi kekal.
      const sedia = await callApi<{ plan: Record<string, unknown> | null }>(s.accessToken, `/api/live/quizzes/${quizId}/research`);
      const lama = sedia.plan ?? {};
      const pilih = (k: string) => (args?.[k] !== undefined ? args[k] : lama[k] ?? null);
      return callApi(s.accessToken, `/api/live/quizzes/${quizId}/research`, {
        method: "PUT",
        body: {
          module1_start_at: pilih("module1_start_at"),
          course_end_at: pilih("course_end_at"),
          emails_enabled: args?.emails_enabled !== undefined ? args.emails_enabled : lama.emails_enabled ?? true,
          consent_text: pilih("consent_text"),
          day_length_sec: pilih("day_length_sec") ?? 86400,
        },
      });
    },
  },
  {
    name: "get_followup_status",
    title: "Status susulan peserta",
    description:
      "Status kajian setiap ahli kelas bagi Live Quiz mod ujian: persetujuan (lalai setuju), tarik diri, berhenti " +
      "langganan, masa tamat T1, T2, T3, tetingkap T3 dan log e-mel susulan (dihantar, menunggu, dibatalkan dengan sebab).",
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { quiz_id: { type: "string" } }, required: ["quiz_id"] },
    handler: async (args, s) => {
      const r = await callApi<{ participants: unknown[] }>(s.accessToken, `/api/live/quizzes/${wajib(args, "quiz_id")}/research`);
      return { participants: r.participants };
    },
  },
  {
    name: "export_measurement_data",
    title: "Eksport data kajian T1, T2, T3",
    description:
      "CSV format panjang untuk analisis: satu baris bagi setiap soalan pengetahuan dan setiap item tinjauan bagi " +
      "setiap larian ujian. Tanpa nama (kod peserta hash). Lajur correct dan answered, bukan markah. Peserta yang " +
      `menolak atau tarik diri dikecualikan. Dipotong pada ${HAD_CSV_MCP} aksara; muat turun penuh dari panel pendidik.`,
    roles: STAFF,
    write: false,
    inputSchema: { type: "object", properties: { quiz_id: { type: "string" } }, required: ["quiz_id"] },
    handler: async (args, s) => {
      const r = await callApiText(s.accessToken, `/api/live/quizzes/${wajib(args, "quiz_id")}/research/export`);
      const teks = r.text.replace(/^﻿/, "");
      const baris = teks.split(/\r\n/).filter(Boolean).length - 1;
      return {
        filename: r.filename,
        rows: Math.max(0, baris),
        truncated: teks.length > HAD_CSV_MCP,
        csv: teks.slice(0, HAD_CSV_MCP),
      };
    },
  },
];
