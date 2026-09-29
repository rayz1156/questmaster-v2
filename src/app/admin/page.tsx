import { redirect } from "next/navigation";

// /admin tidak mempunyai skrin sendiri: pengguna terus ke Overview
// (V2-011b). redirect() pada komponen pelayan, tiada klien diperlukan.
export default function AdminIndexPage() {
  redirect("/admin/overview");
}
