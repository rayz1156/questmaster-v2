"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  HelpCircle, BookOpen, MessageSquare, ChevronDown, ChevronUp,
  Send, Trophy, ArrowLeft, Bug, Lightbulb, MessageCircle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Tab = "kb" | "faq" | "feedback";

// Artikel pangkalan pengetahuan (teks statik UI, dalam Bahasa Melayu)
const KB_ARTICLES = [
  {
    role: "Mula Mengguna",
    items: [
      { t: "Apakah itu StafKita Akademi?", b: "StafKita Akademi ialah platform pembelajaran berasaskan pasukan dan gamifikasi. Pendidik mencipta Kelas, pelajar menyertai Pasukan dalam sesebuah kelas, dan semua orang melengkapkan Aktiviti untuk meraih mata serta mendaki Papan Pendahulu." },
      { t: "Bagaimana saya menyertai kelas?", b: "Pendidik anda akan memberi Kod Kelas (kod 8 aksara contohnya F5DFD237). Log masuk, pergi ke Kelas → Sertai Kelas, dan tampal kod tersebut. Anda juga boleh menggunakan pautan sertai terus." },
      { t: "Bagaimana mata diperoleh?", b: "Setiap aktiviti mempunyai nilai mata. Pasukan anda meraih mata dengan melengkapkan aktiviti dalam tempoh aktif. Mata dipaparkan pada Papan Pendahulu Langsung dalam masa nyata." },
    ],
  },
  {
    role: "Untuk Pendidik",
    items: [
      { t: "Mencipta kelas", b: "Klik '+ Kelas Baharu' pada halaman Kelas, berikan nama dan warna, dan sistem akan menjana kod sertai secara automatik. Kongsi kod tersebut dengan pelajar anda." },
      { t: "Merekabentuk aktiviti", b: "Pergi ke Aktiviti → Aktiviti Baharu. Tambah tajuk, arahan, sehingga dua pautan rujukan, folder penghantaran (pilihan), nilai mata dan tempoh aktif. Simpan sebagai Draf, kemudian terbitkan apabila sedia." },
      { t: "Membaca papan pendahulu", b: "Tab Kedudukan menunjukkan mata pasukan secara langsung bagi setiap kelas. Gunakannya semasa kuliah untuk mendorong penyertaan — pelajar suka melihat kedudukan dikemas kini dalam masa nyata." },
      { t: "Menjemput pendidik bersama", b: "Dari halaman Urus kelas anda, gunakan bahagian Jemputan untuk menambah pendidik bersama melalui e-mel. Mereka mendapat akses sunting yang sama seperti anda." },
    ],
  },
  {
    role: "Untuk Pelajar",
    items: [
      { t: "Mencari pasukan anda", b: "Selepas menyertai kelas, pergi ke Pasukan dan sama ada sertai pasukan sedia ada atau cipta satu. Sesetengah kelas mempunyai pasukan yang ditetapkan guru — dalam kes itu, pasukan anda sudah sedia ditetapkan." },
      { t: "Menghantar aktiviti", b: "Buka aktiviti dari halaman Aktiviti, baca arahan, klik pautan rujukan jika ada, lakukan kerja, kemudian muat naik penghantaran anda ke folder yang dipautkan (jika disediakan) dan tandakan aktiviti sebagai selesai." },
      { t: "Menjejak kemajuan anda", b: "Halaman Utama menunjukkan aktiviti aktif dan tarikh akhir. Tab Papan Pendahulu menunjukkan kedudukan pasukan anda. Profil anda menunjukkan jumlah mata yang diperoleh." },
    ],
  },
];

// Soalan lazim (teks statik UI, dalam Bahasa Melayu)
const FAQS = [
  { q: "Saya terlupa kata laluan — apa perlu saya buat?", a: "Pada halaman log masuk, klik 'Lupa kata laluan'. Anda akan menerima pautan tetapan semula melalui e-mel. Jika ia tidak tiba dalam masa 5 minit, semak folder spam anda." },
  { q: "Kod kelas saya tidak berfungsi.", a: "Kod kelas ialah kod 8 aksara yang sensitif huruf besar/kecil. Pastikan tiada ruang kosong. Jika masih gagal, minta pendidik anda mengesahkan kelas tersebut masih aktif." },
  { q: "Bolehkah saya berada dalam lebih daripada satu kelas?", a: "Ya. Anda boleh menyertai seberapa banyak kelas yang pendidik anda jemput. Setiap kelas mempunyai pasukan, aktiviti dan papan pendahulu tersendiri." },
  { q: "Saya menghantar aktiviti tetapi tidak mendapat mata.", a: "Mata diberikan apabila pendidik anda menandakan aktiviti sebagai lengkap untuk pasukan anda. Jika anda menghantar dalam masa dan masih tidak melihat mata selepas 48 jam, hubungi pendidik anda." },
  { q: "Bagaimana saya menukar bahasa?", a: "Klik bendera bahasa di penjuru kanan bawah mana-mana halaman. StafKita Akademi menyokong Bahasa Melayu, Mandarin, Arab, Tamil, Hindi, Jepun, Korea, Indonesia dan Inggeris." },
  { q: "Adakah StafKita Akademi berfungsi di telefon mudah alih?", a: "Ya. Ia ialah Progressive Web App — buka dalam pelayar anda dan ketik 'Pasang aplikasi' untuk menambahkannya ke skrin utama. Ia berfungsi luar talian untuk kandungan yang pernah dilihat." },
  { q: "Adakah data saya sulit?", a: "Penghantaran, mata dan aktiviti anda dapat dilihat oleh pendidik dan rakan sekelas sebagai sebahagian papan pendahulu. Maklumat peribadi (e-mel, telefon) tidak dikongsi dengan rakan sekelas. StafKita Akademi mengikut dasar tadbir data yang ditetapkan." },
  { q: "Bagaimana saya melaporkan pepijat?", a: "Gunakan tab Maklum Balas pada halaman ini — pilih 'Laporan pepijat' sebagai jenis. Sertakan apa yang anda lakukan ketika ia berlaku." },
];

export default function HelpPage() {
  const [tab, setTab] = useState<Tab>("kb");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openKb, setOpenKb] = useState<string | null>("Mula Mengguna");
  const [fbType, setFbType] = useState<"bug" | "idea" | "question" | "other">("idea");
  const [fbSubject, setFbSubject] = useState("");
  const [fbMessage, setFbMessage] = useState("");
  const [fbEmail, setFbEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setUserEmail(data.user.email);
        setFbEmail(data.user.email);
      }
    });
  }, []);

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fbSubject.trim() || !fbMessage.trim()) {
      setError("Sila isi subjek dan mesej.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: fbType,
          subject: fbSubject,
          message: fbMessage,
          email: fbEmail || null,
          page_url: typeof window !== "undefined" ? window.location.href : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Gagal menghantar maklum balas.");
      }
      setSubmitted(true);
      setFbSubject("");
      setFbMessage("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sesuatu tidak kena.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-primary text-white">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center gap-4">
          <Link href="/" className="opacity-80 hover:opacity-100" aria-label="Kembali">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-10 h-10 rounded bg-white/15 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Bantuan &amp; Sokongan</h1>
            <p className="text-sm opacity-90">Cari jawapan, kenali platform, atau hantar maklum balas kepada kami.</p>
          </div>
        </div>
      </header>

      <nav className="max-w-5xl mx-auto px-4 mt-6">
        <div className="inline-flex bg-white rounded shadow-sm border border-slate-200 p-1">
          {[
            { id: "kb" as const, label: "Pangkalan Pengetahuan", icon: <BookOpen className="w-4 h-4" /> },
            { id: "faq" as const, label: "Soalan Lazim", icon: <HelpCircle className="w-4 h-4" /> },
            { id: "feedback" as const, label: "Hantar Maklum Balas", icon: <MessageSquare className="w-4 h-4" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold transition ${
                tab === t.id ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-32">
        {tab === "kb" && (
          <div className="space-y-4">
            {KB_ARTICLES.map((section) => (
              <div key={section.role} className="bg-white rounded shadow-sm border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setOpenKb(openKb === section.role ? null : section.role)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
                >
                  <span className="font-bold text-slate-900">{section.role}</span>
                  {openKb === section.role ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                </button>
                {openKb === section.role && (
                  <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
                    {section.items.map((it) => (
                      <div key={it.t} className="pt-4">
                        <h3 className="font-semibold text-slate-900">{it.t}</h3>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed">{it.b}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "faq" && (
          <div className="space-y-2">
            {FAQS.map((f, i) => (
              <div key={i} className="bg-white rounded shadow-sm border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{f.q}</span>
                  {openFaq === i ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "feedback" && (
          <div className="bg-white rounded shadow-sm border border-slate-200 p-6 max-w-2xl">
            {submitted ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-status-success mx-auto" />
                <h2 className="text-xl font-bold mt-3">Terima kasih!</h2>
                <p className="text-slate-600 mt-2">Maklum balas anda telah dihantar. Kami membaca setiap mesej.</p>
                <button onClick={() => setSubmitted(false)} className="mt-5 px-4 py-2 bg-primary text-white rounded text-sm font-semibold">Hantar lagi</button>
              </div>
            ) : (
              <form onSubmit={submitFeedback} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Bantu kami menambah baik StafKita Akademi</h2>
                  <p className="text-sm text-slate-600 mt-1">Pepijat? Idea ciri? Keliru tentang sesuatu? Beritahu kami — kami gunakannya untuk merancang keluaran akan datang.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Jenis maklum balas</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { v: "bug" as const, label: "Pepijat", icon: <Bug className="w-4 h-4" /> },
                      { v: "idea" as const, label: "Idea", icon: <Lightbulb className="w-4 h-4" /> },
                      { v: "question" as const, label: "Soalan", icon: <HelpCircle className="w-4 h-4" /> },
                      { v: "other" as const, label: "Lain-lain", icon: <MessageCircle className="w-4 h-4" /> },
                    ].map((o) => (
                      <button
                        type="button"
                        key={o.v}
                        onClick={() => setFbType(o.v)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium border ${
                          fbType === o.v ? "bg-primary-subtle border-primary text-primary-hover" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {o.icon}
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="fb-subject" className="block text-xs font-semibold text-slate-700 mb-1">Subjek</label>
                  <input id="fb-subject" value={fbSubject} onChange={(e) => setFbSubject(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Ringkasan ringkas" maxLength={120} />
                </div>
                <div>
                  <label htmlFor="fb-message" className="block text-xs font-semibold text-slate-700 mb-1">Mesej</label>
                  <textarea id="fb-message" value={fbMessage} onChange={(e) => setFbMessage(e.target.value)} rows={6} className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Ceritakan apa yang berlaku atau apa yang anda ingin lihat…" maxLength={4000} />
                </div>
                {!userEmail && (
                  <div>
                    <label htmlFor="fb-email" className="block text-xs font-semibold text-slate-700 mb-1">E-mel (pilihan, supaya kami boleh membalas)</label>
                    <input id="fb-email" type="email" value={fbEmail} onChange={(e) => setFbEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="anda@contoh.com" />
                  </div>
                )}
                {error && <div className="text-sm text-status-danger">{error}</div>}
                <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded text-sm font-semibold disabled:opacity-50">
                  <Send className="w-4 h-4" />
                  {submitting ? "Menghantar…" : "Hantar maklum balas"}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
