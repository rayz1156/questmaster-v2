import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Library ialah destinasi aras atas, tetapi kandungannya sudah wujud dalam
 * dua halaman: activities dan quizzes. Laluan ini membawa pengguna ke tab
 * pertama, dan kawalan bersegmen dalam halaman itu membawa ke tab kedua.
 * Tiada halaman pendua dibina.
 */
export default function LibraryPage() {
  redirect("/educator/activities");
}
