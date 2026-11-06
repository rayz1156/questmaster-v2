// KZ-046: menu pendidik hanya mempunyai SATU kategori kuiz. Tab Arena
// dibuang daripada eduTabs dan set Arena lama telah disalin ke bank Kuiz
// oleh migrasi 0076 (qm_arena_sets.live_quiz_id), jadi halaman ini tidak
// lagi mempunyai kandungan: pengunjung dihala ke senarai Kuiz.
//
// redirect() daripada next/navigation hanya boleh dipanggil dalam komponen
// pelayan; halaman ini tidak lagi memerlukan 'use client' mahupun Supabase.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function HalamanArenaLama() {
  redirect("/educator/live");
}