import type { Metadata } from "next";

/**
 * Halaman ini komponen klien, jadi ia tidak boleh mengeksport metadata
 * sendiri. Layout pelayan nipis ini membawanya, tanpa menyentuh logik
 * halaman itu.
 */
export const metadata: Metadata = {
  title: "Create an educator account",
  description: "Create a Kuizen educator account to build interactive class quizzes, run live sessions and track progress.",
  alternates: { canonical: "https://kuizen.fun/register" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
