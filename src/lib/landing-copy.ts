/**
 * Teks halaman utama dalam dua bahasa.
 *
 * Halaman BM di "/" dan halaman Inggeris di "/en" berkongsi satu susun atur
 * (components/LandingPage.tsx). Semua teks yang dilihat pelawat ada di sini,
 * supaya kedua dua versi sentiasa selari: menambah soalan lazim atau ciri
 * baharu bermakna menambahnya dalam kedua dua blok di bawah.
 */
export type Bahasa = "ms" | "en";

export const TAPAK = "https://kuizen.fun";

export const LALUAN: Record<Bahasa, string> = { ms: "/", en: "/en" };

export type TeksLanding = {
  htmlLang: string;
  inLanguage: string;
  meta: { title: string; description: string; ogDescription: string };
  orgDescription: string;
  nav: { ciri: string; harga: string; blog: string; bantuan: string; logMasuk: string; daftar: string; tukarBahasa: string };
  hero: { eyebrow: string; tajuk1: string; tajuk2: string; sub: string; cta: string; nota: string };
  ciriTajuk: string;
  ciri: Array<{ tajuk: string; teks: string }>;
  harga: {
    tajuk: string;
    sub: string;
    suis: { tahunan: string; bulanan: string };
    popular: string;
    sebulan: string;
    seTahun: string;
    dibilkanTahunan: string;
    untukKerusi: string;
    tanpaHad: string;
    ya: string;
    tidak: string;
    pelanNama: { free: string; pro: string; institution: string };
    barisLabel: {
      kelas: string;
      pesertaSeKelas: string;
      pemainSeSesi: string;
      aktiviti: string;
      papan: string;
      pasukan: string;
      storan: string;
      saizFail: string;
      sijil: string;
      penilaianRakan: string;
      googleForm: string;
      laporan: string;
      aksesMcp: string;
      adminInvois: string;
    };
    templat: { kelas: string; peserta: string; aktiviti: string; papan: string };
    sijilNilai: { free: string; pro: string; institution: string };
    butang: { mula: string; pro: string; institusi: string };
    notaVideo: string;
  };
  faqTajuk: string;
  faq: Array<{ q: string; a: string }>;
  penutup: { tajuk: string; cta: string; blogSoalan: string; blogPautan: string };
  kaki: { slogan: string; privasi: string; terma: string; harga: string; blog: string; bantuan: string };
  pratonton: {
    menu: string[];
    soalanKe: string;
    soalan: string;
    pilihan: string[];
    papan: string;
    peserta: string;
    pasukan: string;
    moto: string;
  };
};

export const TEKS_LANDING: Record<Bahasa, TeksLanding> = {
  ms: {
    htmlLang: "ms",
    inLanguage: "ms-MY",
    meta: {
      title: "Kuizen: Platform Kuiz Interaktif dan Gamifikasi Bilik Darjah",
      description:
        "Cipta kuiz bilik darjah interaktif, jalankan sesi PdPc langsung, dan lihat markah serta papan pendahulu serta merta. Untuk guru sekolah dan pensyarah IPT.",
      ogDescription:
        "Cipta kuiz bilik darjah interaktif, jalankan sesi PdPc langsung, dan lihat markah serta papan pendahulu serta merta.",
    },
    orgDescription:
      "Platform kuiz interaktif dan gamifikasi pembelajaran untuk pendidik sekolah dan institusi pengajian tinggi.",
    nav: { ciri: "Ciri", harga: "Harga", blog: "Blog", bantuan: "Bantuan", logMasuk: "Log masuk", daftar: "Daftar", tukarBahasa: "Pilih bahasa" },
    hero: {
      eyebrow: "Untuk guru dan pensyarah",
      tajuk1: "Hidupkan",
      tajuk2: "kelas anda.",
      sub: "Kuiz, aktiviti dan kemajuan pelajar. Semua dalam satu tempat.",
      cta: "Daftar sebagai pendidik",
      nota: "Akaun pendidik disemak sebelum kelas boleh dicipta.",
    },
    ciriTajuk: "Satu kelas. Lebih banyak penglibatan.",
    ciri: [
      { tajuk: "Mulakan kuiz langsung", teks: "Pelajar sertai dengan kod atau QR." },
      { tajuk: "Satukan aktiviti kelas", teks: "Bahan, tugasan dan pasukan tersusun." },
      { tajuk: "Lihat kemajuan bersama", teks: "Markah terkumpul dalam papan pendahulu." },
    ],
    harga: {
      tajuk: "Pelan dan harga",
      sub: "Mula percuma. Naik taraf apabila kelas anda mahu lebih.",
      suis: { tahunan: "Tahunan", bulanan: "Bulanan" },
      popular: "Paling popular",
      sebulan: "/ bulan",
      seTahun: "/ tahun",
      dibilkanTahunan: "Dibilkan {harga} setahun",
      untukKerusi: "untuk {n} educator",
      tanpaHad: "Tanpa had",
      ya: "Ya",
      tidak: "Tidak",
      pelanNama: { free: "Percuma", pro: "Pro", institution: "Institusi" },
      barisLabel: {
        kelas: "Kelas dimiliki",
        pesertaSeKelas: "Peserta setiap kelas",
        pemainSeSesi: "Peserta setiap sesi Live Quiz",
        aktiviti: "Aktiviti (quiz dan quest)",
        papan: "Papan",
        pasukan: "Pasukan dan papan pendahulu",
        storan: "Storan",
        saizFail: "Saiz setiap fail",
        sijil: "Sijil peserta",
        penilaianRakan: "Penilaian rakan",
        googleForm: "Jambatan Google Form",
        laporan: "Laporan",
        aksesMcp: "Akses MCP (Claude)",
        adminInvois: "Papan pemuka admin dan invois",
      },
      templat: { kelas: "{n} kelas", peserta: "{n} peserta", aktiviti: "{n} aktiviti", papan: "{n} papan" },
      sijilNilai: {
        free: "Templat lalai dengan tera Kuizen",
        pro: "Latar dan logo sendiri, tanpa tera, emel pukal",
        institution: "Seperti Pro, dengan logo institusi",
      },
      butang: { mula: "Mula percuma", pro: "Naik taraf ke Pro", institusi: "Hubungi kami" },
      notaVideo: "Video dibenamkan melalui pautan YouTube atau Google Drive.",
    },
    faqTajuk: "Soalan ringkas. Jawapan jelas.",
    faq: [
      {
        q: "Pelajar perlu akaun?",
        a: "Tidak untuk kuiz langsung. Pelajar masuk dengan kod sesi dan nama panggilan sahaja. Akaun hanya diperlukan apabila pelajar mahu menyertai kelas secara berterusan dan menyimpan rekod markah mereka.",
      },
      {
        q: "Sesuai untuk sekolah dan IPT?",
        a: "Ya untuk kedua duanya. Kelas di Kuizen tidak terikat kepada tingkatan sekolah, jadi satu kelas boleh mewakili satu tingkatan, satu kursus, satu kohort atau satu bengkel. Pensyarah IPT menggunakannya untuk penglibatan kuliah, pentaksiran formatif dan kerja berkumpulan.",
      },
      {
        q: "Boleh import soalan sedia ada?",
        a: "Boleh. Soalan diimport secara pukal daripada fail CSV, jadi bank soalan yang sudah ada dalam fail Excel atau dokumen lama tidak perlu ditaip semula.",
      },
      {
        q: "Apakah itu Kuizen?",
        a: "Kuizen ialah platform kuiz interaktif dan gamifikasi pembelajaran untuk pendidik. Guru dan pensyarah mencipta kelas, membina kuiz dan aktiviti, menjalankan sesi langsung di dalam bilik darjah, dan melihat markah serta papan pendahulu terkumpul serta merta.",
      },
      {
        q: "Berapa cara pelajar boleh menyertai?",
        a: "Tiga cara: mengimbas kod QR, membuka pautan jemputan, atau memasukkan kod ringkas. Pilihan itu ada supaya sesi berjalan lancar sama ada di dalam bilik darjah dengan projektor atau dari jauh.",
      },
      {
        q: "Apakah bezanya berbanding platform kuiz konvensional?",
        a: "Kuizen menggabungkan kuiz langsung, aktiviti yang dinilai, papan pembelajaran dan papan pendahulu kelas dalam satu tempat, jadi markah daripada semua aktiviti itu terkumpul dalam papan pendahulu yang sama. Kandungan juga boleh disediakan sepenuhnya dalam Bahasa Melayu.",
      },
      {
        q: "Apakah beza pelan Percuma dan Pro?",
        a: "Percuma memberi anda 3 kelas, 150 peserta setiap kelas, 60 peserta setiap sesi Live Quiz, 30 aktiviti, 5 papan dan 100 MB storan. Pro membuka 30 kelas tanpa had peserta, 300 peserta setiap sesi, aktiviti dan papan tanpa had, 1 GB storan, serta penilaian rakan, jambatan Google Form, laporan dan akses MCP.",
      },
      {
        q: "Apakah yang berlaku apabila had pelan saya dicapai?",
        a: "Penciptaan baharu disekat sehingga anda membuang yang lama atau menaik taraf pelan. Data sedia ada tidak dipadam dan kelas yang sedang berjalan kekal berfungsi seperti biasa.",
      },
      {
        q: "Bagaimana bil tahunan Pro berfungsi?",
        a: "Bil tahunan Pro ialah RM228 setahun, bersamaan RM19 sebulan, berbanding RM29 sebulan untuk bil bulanan. Anda menjimatkan lebih daripada satu pertiga dengan bil tahunan.",
      },
      {
        q: "Untuk siapa pelan Institusi?",
        a: "Pelan Institusi sesuai untuk sekolah dan institusi pengajian tinggi yang mahu satu akaun tengah: RM1,500 setahun untuk 10 educator, dengan storan 10 GB dikongsi merentas semua educator dalam institusi anda.",
      },
      {
        q: "Adakah data saya kekal jika saya turun taraf pelan?",
        a: "Ya, data anda kekal. Selepas turun taraf, hanya penciptaan baharu yang melebihi had pelan baharu disekat, contohnya kelas keempat pada pelan Percuma. Kelas dan aktiviti sedia ada tidak dipadam.",
      },
    ],
    penutup: {
      tajuk: "Kelas seterusnya, lebih bermakna.",
      cta: "Daftar sebagai pendidik",
      blogSoalan: "Baharu dengan kuiz dalam talian?",
      blogPautan: "Baca blog Kuizen",
    },
    kaki: { slogan: "Pembelajaran lebih hidup.", privasi: "Privasi", terma: "Terma", harga: "Harga", blog: "Blog", bantuan: "Bantuan" },
    pratonton: {
      menu: ["Kelas", "Kuiz langsung", "Tugasan", "Bahan", "Pasukan", "Laporan"],
      soalanKe: "Soalan 3 daripada 10",
      soalan: "Apakah fungsi HTML?",
      pilihan: [
        "Membina struktur halaman web",
        "Mengurus pangkalan data",
        "Mereka bentuk grafik",
        "Mengendalikan rangkaian komputer",
      ],
      papan: "Papan pendahulu",
      peserta: "12 peserta",
      pasukan: "Pasukan",
      moto: "Kerja berpasukan membawa lebih jauh.",
    },
  },
  en: {
    htmlLang: "en",
    inLanguage: "en",
    meta: {
      title: "Kuizen: Interactive Classroom Quizzes and Gamified Learning",
      description:
        "Create interactive classroom quizzes, run live sessions, and see scores and leaderboards instantly. Built for school teachers and university lecturers.",
      ogDescription:
        "Create interactive classroom quizzes, run live sessions, and see scores and leaderboards instantly.",
    },
    orgDescription:
      "An interactive quiz and gamified learning platform for school and higher education educators.",
    nav: { ciri: "Features", harga: "Pricing", blog: "Blog", bantuan: "Help", logMasuk: "Log in", daftar: "Sign up", tukarBahasa: "Choose language" },
    hero: {
      eyebrow: "For teachers and lecturers",
      tajuk1: "Bring your",
      tajuk2: "class to life.",
      sub: "Quizzes, activities and student progress. All in one place.",
      cta: "Sign up as an educator",
      nota: "Educator accounts are reviewed before classes can be created.",
    },
    ciriTajuk: "One class. More engagement.",
    ciri: [
      { tajuk: "Start a live quiz", teks: "Students join with a code or QR." },
      { tajuk: "Bring class activities together", teks: "Materials, tasks and teams, organised." },
      { tajuk: "See progress together", teks: "Scores add up on one leaderboard." },
    ],
    harga: {
      tajuk: "Plans and pricing",
      sub: "Start free. Upgrade when your class wants more.",
      suis: { tahunan: "Yearly", bulanan: "Monthly" },
      popular: "Most popular",
      sebulan: "/ month",
      seTahun: "/ year",
      dibilkanTahunan: "Billed {harga} a year",
      untukKerusi: "for {n} educators",
      tanpaHad: "Unlimited",
      ya: "Yes",
      tidak: "No",
      pelanNama: { free: "Free", pro: "Pro", institution: "Institution" },
      barisLabel: {
        kelas: "Classes you own",
        pesertaSeKelas: "Participants per class",
        pemainSeSesi: "Players per live quiz session",
        aktiviti: "Activities (quizzes and quests)",
        papan: "Boards",
        pasukan: "Teams and leaderboard",
        storan: "Storage",
        saizFail: "Size per file",
        sijil: "Participant certificates",
        penilaianRakan: "Peer evaluation",
        googleForm: "Google Form bridge",
        laporan: "Reports",
        aksesMcp: "MCP access (Claude)",
        adminInvois: "Admin dashboard and invoices",
      },
      templat: { kelas: "{n} classes", peserta: "{n} participants", aktiviti: "{n} activities", papan: "{n} boards" },
      sijilNilai: {
        free: "Default template with the Kuizen watermark",
        pro: "Your own background and logo, no watermark, bulk email",
        institution: "Like Pro, plus your institution logo",
      },
      butang: { mula: "Start free", pro: "Upgrade to Pro", institusi: "Contact us" },
      notaVideo: "Videos are embedded via YouTube or Google Drive links.",
    },
    faqTajuk: "Short questions. Clear answers.",
    faq: [
      {
        q: "Do students need an account?",
        a: "Not for live quizzes. Students join with a session code and a nickname only. An account is needed only when a student wants to join a class long term and keep a record of their scores.",
      },
      {
        q: "Is it suitable for schools and universities?",
        a: "Yes, for both. Classes in Kuizen are not tied to school grades, so one class can represent a form, a course, a cohort or a workshop. University lecturers use it for lecture engagement, formative assessment and group work.",
      },
      {
        q: "Can I import existing questions?",
        a: "Yes. Questions are imported in bulk from a CSV file, so a question bank you already keep in Excel or older documents does not need to be retyped.",
      },
      {
        q: "What is Kuizen?",
        a: "Kuizen is an interactive quiz and gamified learning platform for educators. Teachers and lecturers create classes, build quizzes and activities, run live sessions in the classroom, and see scores and a running leaderboard instantly.",
      },
      {
        q: "How can students join?",
        a: "Three ways: scan a QR code, open an invite link, or enter a short code. The choice keeps sessions running smoothly, whether in a classroom with a projector or remotely.",
      },
      {
        q: "How is it different from a conventional quiz platform?",
        a: "Kuizen brings live quizzes, graded activities, learning boards and a class leaderboard into one place, so scores from every activity add up on the same leaderboard. Content can also be prepared entirely in Bahasa Melayu or English.",
      },
      {
        q: "What is the difference between Free and Pro?",
        a: "Free gives you 3 classes, 150 participants per class, 60 players per live quiz session, 30 activities, 5 boards and 100 MB of storage. Pro opens up 30 classes with unlimited participants, 300 players per session, unlimited activities and boards, 1 GB of storage, plus peer evaluation, the Google Form bridge, reports and MCP access.",
      },
      {
        q: "What happens when I reach my plan limit?",
        a: "Creating new items is blocked until you delete old ones or upgrade. Existing data is never deleted, and classes already running keep working as usual.",
      },
      {
        q: "How does Pro yearly billing work?",
        a: "Pro yearly billing is RM228 a year, which works out to RM19 per month, compared with RM29 per month on monthly billing. Yearly billing saves you more than a third.",
      },
      {
        q: "Who is the Institution plan for?",
        a: "The Institution plan suits schools and higher education institutions that want one central account: RM1,500 a year for 10 educators, with 10 GB of storage shared across every educator in your institution.",
      },
      {
        q: "Does my data stay if I downgrade my plan?",
        a: "Yes, your data stays. After a downgrade, only creating new items beyond the new plan limit is blocked, for example a fourth class on the Free plan. Existing classes and activities are not deleted.",
      },
    ],
    penutup: {
      tajuk: "Make your next class count.",
      cta: "Sign up as an educator",
      blogSoalan: "New to online quizzes?",
      blogPautan: "Read the Kuizen blog (in Bahasa Melayu)",
    },
    kaki: { slogan: "Learning, brought to life.", privasi: "Privacy", terma: "Terms", harga: "Pricing", blog: "Blog", bantuan: "Help" },
    pratonton: {
      menu: ["Classes", "Live quiz", "Tasks", "Materials", "Teams", "Reports"],
      soalanKe: "Question 3 of 10",
      soalan: "What is HTML used for?",
      pilihan: [
        "Building the structure of web pages",
        "Managing databases",
        "Designing graphics",
        "Running computer networks",
      ],
      papan: "Leaderboard",
      peserta: "12 players",
      pasukan: "Team",
      moto: "Teamwork takes you further.",
    },
  },
};
