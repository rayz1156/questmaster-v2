// KZ-046: editor set Arena diganti oleh editor Kuiz tunggal
// (/educator/live/[quizId]). Set lama telah disalin ke bank Kuiz oleh
// migrasi 0076 (qm_arena_sets.live_quiz_id), jadi pautan lama hanya
// menghala semula ke senarai Kuiz; soalan diedit di dalam kuiz itu.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function EditorSetArenaLama() {
  redirect("/educator/live");
}