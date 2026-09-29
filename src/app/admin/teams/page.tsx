// Halaman lama Teams (V2-011c) kini berada dalam tab Teams butiran
// kelas, termasuk tukar nama dan buang pasukan. Komponen pelayan:
// redirect sahaja, tiada kandungan klien.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/admin/classes");
}
