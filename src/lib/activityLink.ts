/** Destinasi apabila pelajar klik nama aktiviti: pautan penghantaran jika ada, jika tiada papan penghantaran. */
export function lamanHantarAktiviti(h: { id: string; submission_link?: string | null }): string {
  const u = (h.submission_link ?? "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  return `/participant/activities/${encodeURIComponent(h.id)}/submissions`;
}

/** Atribut untuk membuka pautan luar dalam tab baharu. */
export function atributLuar(href: string): { target?: string; rel?: string } {
  return /^https?:\/\//i.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
