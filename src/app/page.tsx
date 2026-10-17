import Link from "next/link";
import { BRANDING } from "@/lib/branding.config";
import { KuizenAcademyLogo } from "@/components/branding/KuizenAcademyLogo";

export const dynamic = "force-dynamic";

// ===== Section: Nav =====
function Nav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-lg bg-white/95 border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="StafKita Akademi home" className="flex items-center">
          <KuizenAcademyLogo variant="horizontal" height={36} />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-700">
          <a href="#capabilities" className="hover:text-academy-700">Capabilities</a>
          <a href="#how-it-works" className="hover:text-academy-700">How it works</a>
          <a href="#industries" className="hover:text-academy-700">Industries</a>
          <a href="#hrdcorp" className="hover:text-academy-700">HRDCorp</a>
          <a href="#pricing" className="hover:text-academy-700">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:inline-flex btn-outline text-sm px-4 py-2">Sign in</Link>
          <Link href="/demo" className="btn-academy text-sm px-4 py-2">Book a demo</Link>
        </div>
      </div>
    </header>
  );
}

// ===== Section 1: Hero =====
function Hero() {
  return (
    <section className="relative overflow-hidden bg-hero-mesh">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-slate-50" aria-hidden="true" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <span className="section-eyebrow">Corporate Training, Engineered</span>
            <h1 className="display-heading text-4xl sm:text-5xl lg:text-display-xl mb-6">
              Train your workforce.<br/>
              <span className="text-academy-700">Prove the outcomes.</span><br/>
              Stay compliant.
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mb-8 leading-relaxed">
              StafKita Akademi is the enterprise LMS for Malaysian organizations — built for HRDCorp claims, onboarding cohorts, compliance certifications, and measurable learning outcomes. Endorsed and operated by Veltrix.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/demo" className="btn-academy">Book a 30-min demo →</Link>
              <Link href="#capabilities" className="btn-outline">See capabilities</Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><Dot/> HRDCorp claimable</span>
              <span className="inline-flex items-center gap-1.5"><Dot/> PDPA compliant</span>
              <span className="inline-flex items-center gap-1.5"><Dot/> Malaysia-hosted</span>
              <span className="inline-flex items-center gap-1.5"><Dot/> BM &amp; EN ready</span>
            </div>
          </div>
          <div className="lg:col-span-5">
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

function Dot() { return <span className="w-1.5 h-1.5 rounded-full bg-academy-600 inline-block" />; }

function DashboardPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-academy-gradient opacity-10 blur-3xl rounded-3xl" aria-hidden="true" />
      <div className="relative surface-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">L&amp;D Dashboard</p>
            <p className="text-lg font-bold text-veltrix-900">Compliance overview · Q2 2026</p>
          </div>
          <span className="compliance-pill completed">94% on track</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatTile label="Learners" value="1,284"/>
          <StatTile label="Active cohorts" value="17"/>
          <StatTile label="HRDCorp claims" value="RM 84k"/>
        </div>
        <div className="space-y-3">
          <CohortRow name="Workplace Safety 2026" progress={92} required/>
          <CohortRow name="Anti-Bribery Refresher" progress={71} required/>
          <CohortRow name="Leadership Track · Q2" progress={45}/>
          <CohortRow name="Customer Service Mastery" progress={88}/>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-veltrix-900">{value}</div>
    </div>
  );
}

function CohortRow({ name, progress, required }: { name: string; progress: number; required?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-sm">
        <span className="font-medium text-slate-700 flex items-center gap-2">
          {name}
          {required && <span className="compliance-pill required text-[10px] px-2 py-0.5">Required</span>}
        </span>
        <span className="font-semibold text-veltrix-900">{progress}%</span>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

// ===== Section 2: Trust Indicators =====
function TrustBar() {
  const logos = ["Bank Berhad", "PETRONAS Group", "KPJ Healthcare", "Sunway Holdings", "Maxis Berhad", "MIDF Amanah"];
  return (
    <section className="border-y border-slate-200 bg-white py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <p className="text-center text-xs uppercase tracking-[0.2em] font-semibold text-slate-500 mb-6">
          Trusted by L&amp;D teams across Malaysia
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {logos.map(l => (
            <span key={l} className="text-base sm:text-lg font-bold tracking-tight text-slate-400">{l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 3: Audience Cards =====
function Audience() {
  const cards = [
    { role: "L&D Leaders", desc: "Design role-based learning paths, assign by department, and prove outcomes to the board.", icon: "📊" },
    { role: "Compliance Officers", desc: "Automate annual refreshers, audit-ready certificates, overdue alerts, and PDPA controls.", icon: "🛡️" },
    { role: "People Managers", desc: "Track your team's progress, assign onboarding playbooks, and intervene before deadlines slip.", icon: "👥" },
    { role: "HRDCorp Coordinators", desc: "Generate HRDCorp-claim-ready reports with attendance, completion, and assessment data.", icon: "📑" },
  ];
  return (
    <section className="pt-24 pb-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 max-w-3xl mx-auto">
          <span className="section-eyebrow">Built for your team</span>
          <h2 className="display-heading text-3xl sm:text-4xl mb-4">One platform. Every stakeholder served.</h2>
          <p className="text-lg text-slate-600">From frontline learners to the board’s compliance committee — everyone gets the view they need.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map(c => (
            <div key={c.role} className="surface-card p-6">
              <div className="text-3xl mb-3">{c.icon}</div>
              <h3 className="font-bold text-lg text-veltrix-900 mb-2">{c.role}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 4: Capabilities =====
function Capabilities() {
  const features = [
    { t: "Cohort Management", d: "Group learners by department, role, or onboarding wave. Schedule starts, due dates, and reminders automatically." },
    { t: "Compliance Tracking", d: "Mandatory courses with due dates, escalation paths, and audit logs. Built for ISO, BNM, MCMC, and SC requirements." },
    { t: "HRDCorp Integration", d: "Pre-formatted reports for claim submission. Track scheme eligibility, employer codes, and attendance hours." },
    { t: "Certifications", d: "Issue tamper-evident certificates with verification URLs. Auto-expire and trigger refresher cycles." },
    { t: "Manager Dashboards", d: "Every manager sees their direct reports' progress, overdue items, and skill coverage at a glance." },
    { t: "Skills & Competencies", d: "Map courses to competencies. Identify gaps, plan succession, and quantify readiness by role." },
    { t: "Assessments & Quizzes", d: "Question banks, randomization, proctoring options, and pass-mark gating before certification." },
    { t: "Single Sign-On (SSO)", d: "SAML 2.0 and OIDC. Provision via SCIM. Sync org charts from your HRIS in near real time." },
    { t: "Analytics & ROI", d: "Course-level ROI, completion velocity, manager benchmarks, and exportable board-ready reports." },
  ];
  return (
    <section id="capabilities" className="pt-24 pb-20 bg-white scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <span className="section-eyebrow">Capabilities</span>
          <h2 className="display-heading text-3xl sm:text-4xl mb-4">Everything corporate learning demands.</h2>
          <p className="text-lg text-slate-600">No bolt-ons. No surprises. A single source of truth for workforce development.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(f => (
            <div key={f.t} className="surface-card p-6">
              <div className="w-10 h-10 rounded-lg bg-academy-50 flex items-center justify-center mb-4">
                <span className="w-5 h-5 rounded-sm bg-academy-700" />
              </div>
              <h3 className="font-bold text-base text-veltrix-900 mb-2">{f.t}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 5: How It Works =====
function HowItWorks() {
  const steps = [
    { n: "01", t: "Discovery", d: "We map your org chart, compliance calendar, and existing content into a tailored rollout plan." },
    { n: "02", t: "Configure", d: "Brand the portal, set up SSO, import learners, and assign your first cohorts within days, not months." },
    { n: "03", t: "Launch", d: "Roll out by department or wave. Managers get dashboards. Learners get clear, mobile-friendly journeys." },
    { n: "04", t: "Measure", d: "Quarterly business reviews with your Veltrix CSM cover adoption, outcomes, and HRDCorp claim summaries." },
  ];
  return (
    <section id="how-it-works" className="pt-24 pb-20 bg-veltrix-900 text-white scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <span className="section-eyebrow" style={{color: "#fbbf24"}}>Implementation</span>
          <h2 className="display-heading text-3xl sm:text-4xl mb-4 text-white">Live in weeks. Compounding from day one.</h2>
          <p className="text-lg text-slate-300">A Veltrix consultant guides your launch — not a chatbot.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map(s => (
            <div key={s.n} className="rounded-2xl bg-veltrix-800/50 border border-veltrix-700 p-6">
              <div className="text-3xl font-bold text-gold-500 mb-3">{s.n}</div>
              <h3 className="font-bold text-lg text-white mb-2">{s.t}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 6: Industries =====
function Industries() {
  const industries = [
    { name: "Financial Services", use: "BNM-mandated AML/CFT refreshers, anti-bribery, code of conduct." },
    { name: "Healthcare", use: "Infection control, patient safety, clinical onboarding, license renewals." },
    { name: "Manufacturing", use: "DOSH safety, machinery handling, ESG audits, supervisor uplift." },
    { name: "Oil &amp; Gas", use: "PETRONAS-aligned HSE, contractor onboarding, technical certifications." },
    { name: "Government &amp; GLCs", use: "Integrity training, INTAN-aligned programs, multi-agency cohorts." },
    { name: "Retail &amp; Hospitality", use: "Service standards, brand academies, seasonal onboarding at scale." },
  ];
  return (
    <section id="industries" className="pt-24 pb-20 bg-white scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <span className="section-eyebrow">Industries</span>
          <h2 className="display-heading text-3xl sm:text-4xl mb-4">Configured for Malaysian regulators.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {industries.map(i => (
            <div key={i.name} className="surface-card p-6">
              <h3 className="font-bold text-lg text-veltrix-900 mb-2" dangerouslySetInnerHTML={{__html: i.name}} />
              <p className="text-sm text-slate-600 leading-relaxed">{i.use}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 7: HRDCorp Spotlight =====
function HRDCorp() {
  return (
    <section id="hrdcorp" className="pt-24 pb-20 bg-gradient-to-br from-gold-50 via-white to-academy-50 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="section-eyebrow" style={{color: "#b45309"}}>HRDCorp ready</span>
            <h2 className="display-heading text-3xl sm:text-4xl mb-5">Turn your levy into measurable upskilling.</h2>
            <p className="text-lg text-slate-700 mb-6 leading-relaxed">
              StafKita Akademi generates HRDCorp-claim-ready reports out of the box. Track attendance hours, completion evidence, and assessment scores for SBL-Khas, HRDCorp Claimable Courses, and in-house schemes.
            </p>
            <ul className="space-y-3 text-slate-700">
              {[
                "Pre-formatted attendance sheets with timestamps",
                "Completion certificates with verification URLs",
                "Trainer credentials and TTT certificates linked",
                "Claim-package ZIP export per cohort",
              ].map(li => (
                <li key={li} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-academy-700 text-white flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5">✓</span>
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="surface-card p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="cert-badge text-xs">HRDCorp Claim Package</span>
              <span className="text-xs text-slate-500">Q2 2026</span>
            </div>
            <div className="text-2xl font-bold text-veltrix-900 mb-1">Workplace Safety Refresher</div>
            <div className="text-sm text-slate-600 mb-5">Scheme · SBL-Khas · 128 learners · 6 hrs</div>
            <div className="space-y-2 text-sm">
              {[["Attendance evidence", "128 / 128"],["Assessment pass rate","96%"],["Total trainer hours","768"],["Claimable amount","RM 24,300"]].map(([k,v]) => (
                <div key={k} className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-600">{k}</span>
                  <span className="font-semibold text-veltrix-900">{v}</span>
                </div>
              ))}
            </div>
            <button className="mt-5 w-full btn-academy">Download claim package</button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ===== Section 8: Veltrix Doctrine =====
function Doctrine() {
  return (
    <section className="pt-24 pb-20 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <span className="section-eyebrow">The Veltrix doctrine</span>
        <h2 className="display-heading text-3xl sm:text-4xl mb-6">Software alone doesn’t transform a workforce.</h2>
        <p className="text-lg sm:text-xl text-slate-700 leading-relaxed mb-8">
          Every StafKita Akademi deployment is paired with a Veltrix consultant — because the platform is only as good as the instructional design, change management, and measurement discipline behind it. We don’t hand you a login. We hand you outcomes.
        </p>
        <div className="grid sm:grid-cols-3 gap-5 text-left">
          {[
            { k: "94%", l: "Average 90-day learner activation" },
            { k: "3.2×", l: "Faster onboarding to productivity" },
            { k: "RM 1.4M", l: "Median HRDCorp claims processed / yr" },
          ].map(m => (
            <div key={m.k} className="rounded-2xl bg-slate-50 border border-slate-200 p-6">
              <div className="text-3xl font-bold text-academy-700 mb-1">{m.k}</div>
              <div className="text-sm text-slate-600">{m.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 9: Ecosystem =====
function Ecosystem() {
  const integrations = ["Workday", "SAP SuccessFactors", "BambooHR", "Microsoft Teams", "Slack", "Google Workspace", "Azure AD", "Okta", "Zoom"];
  return (
    <section className="pt-24 pb-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 max-w-3xl mx-auto">
          <span className="section-eyebrow">Ecosystem</span>
          <h2 className="display-heading text-3xl sm:text-4xl mb-4">Plays well with your stack.</h2>
          <p className="text-lg text-slate-600">SSO, SCIM provisioning, calendar sync, and webhooks for the systems your IT team already trusts.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {integrations.map(i => (
            <span key={i} className="px-4 py-2 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-700">{i}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 10: Pricing =====
function Pricing() {
  const tiers = [
    { name: "Growth", desc: "Up to 250 learners. SSO, HRDCorp reports, manager dashboards.", cta: "Talk to sales", featured: false },
    { name: "Enterprise", desc: "Unlimited learners, custom SLAs, dedicated CSM, advanced compliance.", cta: "Book a demo", featured: true },
    { name: "Veltrix Partnership", desc: "Co-built academies, content production, and ongoing instructional design.", cta: "Apply for partnership", featured: false },
  ];
  return (
    <section id="pricing" className="pt-24 pb-20 bg-white scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <span className="section-eyebrow">Pricing</span>
          <h2 className="display-heading text-3xl sm:text-4xl mb-4">Tailored to your headcount and ambition.</h2>
          <p className="text-lg text-slate-600">Annual licensing. Implementation included. No surprise per-feature charges.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {tiers.map(t => (
            <div key={t.name} className={`p-7 rounded-2xl border ${t.featured ? "bg-veltrix-900 text-white border-veltrix-900 shadow-elevated -translate-y-1" : "surface-card"}`}>
              <h3 className={`font-bold text-xl mb-1 ${t.featured ? "text-white" : "text-veltrix-900"}`}>{t.name}</h3>
              <p className={`text-sm mb-6 ${t.featured ? "text-slate-300" : "text-slate-600"}`}>{t.desc}</p>
              <Link href="/demo" className={t.featured ? "btn-academy w-full" : "btn-outline w-full"}>{t.cta}</Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== Section 11: CTA Band =====
function CTABand() {
  return (
    <section className="py-16 bg-academy-gradient text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="display-heading text-3xl sm:text-4xl mb-4 text-white">Ready to upgrade your L&amp;D function?</h2>
        <p className="text-lg text-slate-100 mb-7 max-w-2xl mx-auto">30-minute demo. We’ll show you a sandbox seeded with your org structure.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/demo" className="inline-flex items-center justify-center bg-white text-academy-700 font-bold px-6 py-3 rounded-xl hover:bg-slate-50 transition">Book a demo →</Link>
          <a href={`mailto:${BRANDING.contact.salesEmail}`} className="inline-flex items-center justify-center border-2 border-white/40 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition">Email sales</a>
        </div>
      </div>
    </section>
  );
}

// ===== Section 12: Footer =====
function Footer() {
  return (
    <footer className="bg-veltrix-900 text-slate-300 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div>
            <KuizenAcademyLogo variant="horizontal" color="mono-light" height={36} />
            <p className="text-sm mt-4 text-slate-400 leading-relaxed">Enterprise learning, engineered for Malaysian organizations. Endorsed and operated by Veltrix.</p>
          </div>
          <FooterCol title="Product" links={[["Capabilities","#capabilities"],["How it works","#how-it-works"],["Industries","#industries"],["Pricing","#pricing"]]} />
          <FooterCol title="Company" links={[["About Veltrix","/about"],["Customers","/customers"],["Contact","/demo"]]} />
          <FooterCol title="Legal" links={[["Privacy","/legal/privacy"],["Terms","/legal/terms"],["PDPA","/legal/pdpa"]]} />
        </div>
        <div className="border-t border-veltrix-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Veltrix Sdn Bhd. StafKita Akademi is a Veltrix product.</span>
          <span>Made in Malaysia · PDPA compliant</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string,string][] }) {
  return (
    <div>
      <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">{title}</h4>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}><Link href={href} className="hover:text-white transition">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}

// ===== Page =====
export default function HomePage() {
  return (
    <main className="bg-white text-slate-900">
      <Nav />
      <Hero />
      <TrustBar />
      <Audience />
      <Capabilities />
      <HowItWorks />
      <Industries />
      <HRDCorp />
      <Doctrine />
      <Ecosystem />
      <Pricing />
      <CTABand />
      <Footer />
    </main>
  );
}
