"use client";

/**
 * Shell aplikasi, rupa Oktober 2026 (KZ-020).
 *
 * Susun atur bar sisi + kepala di atas kandungan: bar sisi kiri
 * 290px pada desktop (>= 1200px), kepala 65px dengan hamburger,
 * Help dan menu akaun. Pada skrin kecil bar sisi tersembunyi dan
 * dibuka sebagai laci di atas lapisan gelap lutsinar; laci tutup
 * bila klik luar atau Escape.
 *
 * Tandatangan komponen ini TIDAK berubah. Ia masih menerima `tabs`, jadi
 * setiap halaman sedia ada yang memanggil <Shell tabs={EDU_TABS}> terus
 * mendapat rupa baharu tanpa disunting. Logik sesi, profil, logo tersuai,
 * menu akaun, log keluar, Help dan keadaan aktif `match` semuanya kekal.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, HelpCircle, ChevronDown, Menu, X, User as UserIcon, CircleDot, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useBarSisiKecil } from "@/lib/barSisi";
import { useTabPapanPendidik } from "@/lib/papanPendidikNav";
import { getSession, clearSession } from "@/lib/session";
import { LogoMark } from "@/components/Logo";
import type { User, Profile } from "@/lib/types";
import { getMyProfile } from "@/lib/data";

type Tab = {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** Awalan laluan tambahan yang masih dikira destinasi yang sama. */
  match?: string[];
  /**
   * Nama kumpulan bar sisi (KZ-021, KZ-DS-v3 bahagian 3). Tab tanpa
   * `group` berada di atas tanpa tajuk kumpulan, jadi pemanggil lama
   * yang tidak menghantar kumpulan terus mendapat menu rata seperti
   * sebelum ini.
   */
  group?: string;
  /** Sub-item (pilihan): 14px 400 tanpa ikon, aktif ungu. */
  sub?: Tab[];
};

/** Satu blok bar sisi: tajuk kumpulan pilihan + senarai itemnya. */
type Kumpulan = { label?: string; tabs: Tab[] };

/**
 * Kumpulkan tab mengikut medan `group` mengikut susunan kemunculan.
 * Tab tanpa kumpulan terkumpul di blok pertama tanpa tajuk.
 */
function kumpulkanTabs(tabs: Tab[]): Kumpulan[] {
  const keluar: Kumpulan[] = [];
  const indeks = new Map<string, Kumpulan>();
  for (const t of tabs) {
    const kunci = t.group ?? "";
    let k = indeks.get(kunci);
    if (!k) {
      k = { label: t.group, tabs: [] };
      indeks.set(kunci, k);
      keluar.push(k);
    }
    k.tabs.push(t);
  }
  return keluar;
}

/** Huruf awal untuk avatar. Tiada gambar rekaan. */
function initials(name?: string | null): string {
  const parts = String(name || "")
    .replace(/^(Dr|Dr\.|Prof|Prof\.|Mr|Ms|Mrs)\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Shell({
  tabs,
  /**
   * Kumpulan eksplisit (KZ-021, pilihan). Jika diberikan, ia mengatasi
   * medan `group` pada tab. Pemanggil lama yang hanya menghantar `tabs`
   * tidak berubah tingkah lakunya.
   */
  groups,
  children,
}: {
  tabs: Tab[];
  groups?: { label?: string; tabs: Tab[] }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Sub-item bar sisi yang dibuka secara manual (KZ-021).
  const [subTerbuka, setSubTerbuka] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Bar sisi desktop boleh dikecilkan kepada lajur ikon (seperti ChatGPT/Claude).
  const [kecil, togolKecil] = useBarSisiKecil();
  // KZ-022d: Intro Board dan Learning Board kelas semasa untuk menu pendidik.
  const tabsPenuh = useTabPapanPendidik(tabs);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    const apply = (u: User | null) => {
      if (cancelled) return;
      resolved = true;
      if (!u) {
        router.replace("/login");
      } else {
        setUser(u);
        getMyProfile().then((p) => {
          if (!cancelled) setProfile(p);
        });
      }
    };
    const initial = getSession();
    if (initial) apply(initial);
    else {
      import("@/lib/supabase")
        .then(({ supabase }) => supabase.auth.getUser())
        .then(() => {
          if (!resolved) apply(getSession());
        })
        .catch(() => {
          if (!resolved) apply(null);
        });
      setTimeout(() => {
        if (!resolved) apply(getSession());
      }, 1500);
    }
    const onAuth = () => apply(getSession());
    window.addEventListener("qm-auth", onAuth);
    window.addEventListener("qm-brand", onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener("qm-auth", onAuth);
      window.removeEventListener("qm-brand", onAuth);
    };
  }, [router]);

  // Menu akaun: tutup bila klik di luar atau Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  // Laci telefon: tutup bila klik lapisan luar atau Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [drawerOpen]);

  // Menu dan laci tutup apabila destinasi bertukar.
  useEffect(() => { setMenuOpen(false); setDrawerOpen(false); }, [pathname]);

  if (!user) return null;

  const onLogout = () => {
    clearSession();
    router.replace("/login");
  };

  const mark = initials(profile?.display_name || user.display_name);
  const here = (href: string) => pathname === href || pathname?.startsWith(href + "/");
  const active = (href: string) => here(href);
  const activeTab = (t: Tab) => here(t.href) || (t.match || []).some(here) || (t.sub || []).some((s) => here(s.href) || (s.match || []).some(here));

  // Kumpulan menu: eksplisit melalui `groups`, atau dibina daripada medan
  // `group` setiap tab. Bila tiada tab mempunyai kumpulan, hasilnya satu
  // blok tanpa tajuk dan menu kelihatan sama seperti sebelum KZ-021.
  const blokMenu: Kumpulan[] = groups ?? kumpulkanTabs(tabsPenuh);
  // Bila dua item sepadan (contoh Classes dan Intro Board pada
  // /educator/classes/<id>/board), hanya item paling tepat dinyalakan.
  const hrefTerbaik = tabsPenuh
    .filter((t) => here(t.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const adaKumpulan = blokMenu.some((k) => !!k.label);

  const tahun = new Date().getFullYear();

  // Bar sisi dipaparkan dua kali: statik pada desktop dan laci pada
  // telefon/tablet. Kedua-duanya guna blok menu yang sama.
  const logoBarSisi = profile?.logo_url ? (
    <>
      {/* Logo tersuai pendidik, seperti shell lama. Tanda Kuizen kekal
          di sebelahnya supaya pengguna masih tahu platform apa ini. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={profile.logo_url} alt="" className="h-7 w-auto max-w-[120px] object-contain" />
      <span className="w-px h-5 bg-hairline" />
      <LogoMark size={26} />
    </>
  ) : (
    <>
      <LogoMark size={28} />
      <span className="text-[20px] font-bold tracking-tight text-ink">Kuizen</span>
    </>
  );

  // ===== Blok menu =====
  // Item dengan sub-item mempunyai anak panah yang boleh dibuka/tutup;
  // sub-item yang aktif menyebabkan induknya terbuka secara automatik.
  const subAktif = (t: Tab) =>
    !!t.sub && (t.sub.some((s) => here(s.href) || (s.match || []).some(here)));
  const subTerbukaFn = (t: Tab) => subAktif(t) || subTerbuka.includes(t.href);

  const ItemMenu = ({ t, padat = false }: { t: Tab; padat?: boolean }) => {
    const aktif = activeTab(t) && !(hrefTerbaik && hrefTerbaik !== t.href && hrefTerbaik.startsWith(t.href + "/"));
    // Mod lajur ikon: ikon sahaja, nama dalam tooltip dan aria-label.
    if (padat) {
      return (
        <Link
          href={t.href}
          aria-current={aktif ? "page" : undefined}
          aria-label={t.label}
          title={t.label}
          className={`mx-auto flex h-11 w-11 items-center justify-center rounded-md transition ${
            aktif ? "bg-kz-menu-active text-brand-purple" : "text-ink-faint hover:bg-canvas hover:text-ink"
          }`}
        >
          {t.icon ?? <CircleDot className="h-5 w-5" />}
        </Link>
      );
    }
    return (
      <div>
        <div className="flex items-center">
          <Link
            href={t.href}
            aria-current={aktif ? "page" : undefined}
            className={`flex h-11 flex-1 items-center gap-2 rounded-md px-3 text-[15px] font-bold tracking-[0.15px] transition ${
              aktif ? "bg-kz-menu-active text-brand-purple" : "text-ink hover:bg-canvas"
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center ${
                aktif ? "text-brand-purple" : "text-ink-faint"
              }`}
            >
              {/* Tab tanpa ikon guna ikon lalai. */}
              {t.icon ?? <CircleDot className="h-5 w-5" />}
            </span>
            <span className="truncate">{t.label}</span>
          </Link>
          {t.sub && t.sub.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSubTerbuka((s) =>
                  s.includes(t.href) ? s.filter((x) => x !== t.href) : [...s, t.href]
                )
              }
              aria-expanded={subTerbukaFn(t)}
              aria-label={`${t.label} submenu`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint hover:text-ink"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${subTerbukaFn(t) ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
        {/* Sub-item: 14px 400 tanpa ikon, aktif ungu (KZ-DS-v3 bahagian 3). */}
        {t.sub && t.sub.length > 0 && subTerbukaFn(t) && (
          <div className="ml-[30px] flex flex-col">
            {t.sub.map((s) => {
              const subAkt = here(s.href) || (s.match || []).some(here);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={subAkt ? "page" : undefined}
                  className={`flex h-9 items-center rounded-md px-3 text-[14px] font-normal transition ${
                    subAkt ? "text-brand-purple font-medium" : "text-ink-muted hover:text-ink hover:bg-canvas"
                  }`}
                >
                  <span className="truncate">{s.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const binaMenu = (padat: boolean) => (
    <nav aria-label="Main" className={`flex flex-col gap-0.5 ${padat ? "px-2 pt-2" : "px-3"} pb-6`}>
      {/* Tajuk "Menu" lama hanya dipaparkan bila tiada kumpulan, supaya
          pemanggil lama mendapat rupa yang sama seperti sebelum ini. */}
      {!adaKumpulan && !padat && (
        <div className="px-3 pb-2 pt-4 text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint">
          Menu
        </div>
      )}
      {blokMenu.map((k, i) => (
        <div key={k.label ?? `blok-${i}`}>
          {/* Tajuk kumpulan: overline 11px 700 uppercase ls 2.2px, padding 24px. */}
          {k.label && padat && i > 0 && <div className="mx-3 my-2 h-px bg-hairline" />}
          {k.label && !padat && (
            <div className="px-6 pt-6 pb-2 text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint">
              {k.label}
            </div>
          )}
          {k.tabs.map((t) => (
            <ItemMenu key={t.href} t={t} padat={padat} />
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* ===== Bar sisi desktop (>= 1200px): penuh 290px atau lajur ikon 72px ===== */}
      <aside
        className={`hidden xl:flex ${kecil ? "w-[72px]" : "w-[290px]"} shrink-0 flex-col bg-white shadow-bar sticky top-0 h-screen transition-[width] duration-200`}
      >
        <div className={`flex h-[65px] shrink-0 items-center gap-2.5 ${kecil ? "justify-center px-2" : "px-6"}`}>
          {!kecil && (
            <Link href="/educator/classes" className="inline-flex min-w-0 items-center gap-2.5" aria-label="Kuizen">
              {logoBarSisi}
            </Link>
          )}
          <button
            type="button"
            onClick={togolKecil}
            aria-label={kecil ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!kecil}
            title={kecil ? "Expand sidebar" : "Collapse sidebar"}
            className={`${kecil ? "" : "ml-auto"} flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint transition hover:bg-canvas hover:text-ink`}
          >
            {kecil ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{binaMenu(kecil)}</div>
      </aside>

      {/* ===== Laci telefon/tablet: lapisan gelap lutsinar + panel ===== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-[290px] flex-col bg-white shadow-raised">
            <div className="flex h-[65px] shrink-0 items-center gap-2.5 px-6">
              <Link href="/educator/classes" className="inline-flex items-center gap-2.5" aria-label="Kuizen">
                {logoBarSisi}
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-ink-faint hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{binaMenu(false)}</div>
          </div>
        </div>
      )}

      {/* ===== Kolum kandungan ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 h-[65px] shrink-0 bg-white shadow-bar">
          <div className="flex h-full items-center gap-3 px-[22px]">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="xl:hidden flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:text-ink"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/educator/classes" className={`${kecil ? "" : "xl:hidden"} inline-flex items-center gap-2`} aria-label="Kuizen">
              <LogoMark size={26} />
              <span className="text-[17px] font-bold tracking-tight text-ink">Kuizen</span>
            </Link>

            <div className="ml-auto flex items-center gap-2 shrink-0">
              <Link
                href="/help"
                className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-2 rounded-md text-[15px] font-bold transition ${
                  active("/help") ? "text-brand-purple" : "text-ink-faint hover:text-ink"
                }`}
              >
                <HelpCircle className="w-5 h-5" /> Help
              </Link>

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-canvas"
                >
                  <span className="w-9 h-9 rounded-full bg-brand-purple text-white text-[13px] font-semibold flex items-center justify-center">
                    {mark}
                  </span>
                  <span className="hidden md:flex flex-col items-start leading-tight">
                    <span className="max-w-[140px] truncate text-[14px] font-bold text-ink">
                      {profile?.display_name || user.display_name}
                    </span>
                    <span className="text-[11px] capitalize text-ink-faint">{user.role}</span>
                  </span>
                  <ChevronDown className="w-4 h-4 text-ink-faint" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 bg-white rounded-lg border border-hairline shadow-raised py-1.5 z-50"
                  >
                    <div className="px-3.5 py-2.5">
                      <div className="text-sm font-semibold text-ink truncate">
                        {profile?.display_name || user.display_name}
                      </div>
                      <div className="text-xs text-ink-faint truncate">{user.role}</div>
                    </div>
                    <div className="h-px bg-hairline my-1" />
                    <Link
                      href="/educator/profile"
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-canvas transition"
                    >
                      <UserIcon className="w-4 h-4 text-ink-faint" /> Account settings
                    </Link>
                    <Link
                      href="/help"
                      className="sm:hidden flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-canvas transition"
                    >
                      <HelpCircle className="w-4 h-4 text-ink-faint" /> Help
                    </Link>
                    <div className="h-px bg-hairline my-1" />
                    <button
                      onClick={onLogout}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-canvas transition"
                    >
                      <LogOut className="w-4 h-4 text-ink-faint" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full min-w-0">
          <div className="mx-auto max-w-shell px-[22px] py-8">{children}</div>
        </main>

        <footer className="bg-white">
          <div className="mx-auto max-w-shell px-[22px] py-6 text-sm text-ink-faint">
            © {tahun} Kuizen. UPSI · AFK · Veltrix
          </div>
        </footer>
      </div>
    </div>
  );
}
