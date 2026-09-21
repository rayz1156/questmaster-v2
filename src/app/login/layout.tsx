import type { Metadata } from "next";

/**
 * Halaman ini komponen klien, jadi ia tidak boleh mengeksport metadata
 * sendiri. Layout pelayan nipis ini membawanya, tanpa menyentuh logik
 * halaman itu.
 */
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Kuizen to run your class quizzes, activities and leaderboards.",
  alternates: { canonical: "https://kuizen.fun/login" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
