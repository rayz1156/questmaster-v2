// Halaman lama Leaderboard (V2-011c) kini berada dalam tab Ranking
// butiran kelas (togol Teams / Individuals dan eksport CSV). Komponen
// pelayan: redirect sahaja, tiada kandungan klien.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/admin/classes");
}
