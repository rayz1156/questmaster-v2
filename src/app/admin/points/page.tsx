// Halaman lama Points (V2-011c) kini berada dalam tab Questions and
// points butiran aktiviti, dengan alasan wajib melalui RPC 0047.
// Komponen pelayan: redirect sahaja, tiada kandungan klien.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/admin/hunts");
}
