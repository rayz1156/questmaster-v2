import type { Metadata } from "next";

/**
 * Halaman ini komponen klien, jadi ia tidak boleh mengeksport metadata
 * sendiri. Layout pelayan nipis ini membawanya, tanpa menyentuh logik
 * halaman itu.
 */
export const metadata: Metadata = {
  title: "Help centre",
  description: "Guides and answers for running classes, quizzes and activities on Kuizen.",
  alternates: { canonical: "https://kuizen.fun/help" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
