/** KZ-E: halaman awam pautan nama tidak diindeks enjin carian. */
export const metadata = {
  title: 'Sahkan Nama Penuh | Kuizen',
  robots: { index: false, follow: false },
};

export default function LayoutNama({ children }: { children: React.ReactNode }) {
  return children;
}
