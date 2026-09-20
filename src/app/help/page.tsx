"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, ChevronDown, ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";


const KB_ARTICLES = [
  {
    role: "Getting Started",
    items: [
      { t: "What is Kuizen?", b: "Kuizen is a gamified, team-based learning platform. Educators create Classes, students join Teams within a class, and everyone completes Quests (activities) to earn points and climb the Leaderboard." },
      { t: "How do I join a class?", b: "Your educator will give you a Class Code (an 8-character code like F5DFD237). Sign in, go to Classes → Join Class, and paste the code. You can also use a direct join link." },
      { t: "How are points earned?", b: "Each Quest has a point value. Your team earns points by completing the quest within the active window. Points appear on the Live Leaderboard in real time." },
    ],
  },
  {
    role: "For Educators",
    items: [
      { t: "Creating a class", b: "Click '+ New Class' on the Classes page, give it a name and color, and Kuizen will auto-generate a join code. Share that code with your students." },
      { t: "Designing a quest", b: "Go to Activities → New Activity. Add a title, instructions, up to two reference links, an optional submission folder, point value, and active window. Save as Draft, then publish when ready." },
      { t: "Reading the leaderboard", b: "The Rankings tab shows live team scores per class. Use it during lectures to drive engagement — students love seeing rankings update in real time." },
      { t: "Inviting co-educators", b: "From your class's Manage page, use the Invites section to add a co-educator by email. They get the same edit access you do." },
    ],
  },
  {
    role: "For Students",
    items: [
      { t: "Finding your team", b: "After joining a class, go to Teams and either join an existing team or create one. Some classes have teacher-assigned teams — in that case yours will already be set." },
      { t: "Submitting a quest", b: "Open the quest from Activities, read the instructions, click the reference links if any, do the work, then upload your submission to the linked folder (if provided) and mark the quest done." },
      { t: "Tracking your progress", b: "The Home page shows active quests and deadlines. The Leaderboard tab shows your team’s rank. Your Profile shows total points earned." },
    ],
  },
];

const FAQS = [
  { q: "I forgot my password — what do I do?", a: "On the login page, click 'Forgot password'. You’ll get a reset link by email. If it doesn’t arrive within 5 minutes, check your spam folder." },
  { q: "My class code isn’t working.", a: "Class codes are case-sensitive 8-character codes. Make sure there are no spaces. If it still fails, ask your educator to confirm the class is active." },
  { q: "Can I be in more than one class?", a: "Yes. You can join as many classes as your educator(s) invite you to. Each class has its own teams, quests, and leaderboard." },
  { q: "I submitted a quest but didn’t get points.", a: "Points are awarded when your educator marks the quest complete for your team. If you submitted on time and still don’t see points after 48 hours, contact your educator." },
  { q: "How do I switch the language?", a: "Click the language flag in the bottom-right corner of any page. Kuizen supports Bahasa Melayu, Mandarin, Arabic, Tamil, Hindi, Japanese, Korean, Indonesian, and English." },
  { q: "Does Kuizen work on mobile?", a: "Yes. Kuizen is a Progressive Web App — open it in your browser and tap 'Install app' to add it to your home screen. It works offline for previously-viewed content." },
  { q: "Is my data private?", a: "Your submissions, points, and activity are visible to your educator and classmates as part of the leaderboard. Personal info (email, phone) is not shared with classmates. Kuizen is hosted by UPSI and follows their data governance policies." },
  { q: "How do I report a bug?", a: "Use the Feedback tab on this page — select 'Bug report' as the type. Include what you were doing when it happened." },
];

type Hit = { section: string; q: string; a: string };

const ALL: Hit[] = [
  ...KB_ARTICLES.flatMap((s) => s.items.map((it) => ({ section: s.role, q: it.t, a: it.b }))),
  ...FAQS.map((f) => ({ section: "FAQ", q: f.q, a: f.a })),
];

function Accordion({ items, openKey, onToggle }: { items: Hit[]; openKey: string | null; onToggle: (k: string) => void }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted py-6">Nothing matches that yet. Try fewer words, or send us the question below.</p>;
  }
  return (
    <div>
      {items.map((it) => {
        const open = openKey === it.q;
        return (
          <div key={it.q} className="border-t border-hairline">
            <button
              onClick={() => onToggle(it.q)}
              className="w-full flex items-start justify-between gap-6 py-4 text-left"
            >
              <span className="text-[15px] font-medium text-ink">{it.q}</span>
              <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && <p className="text-sm text-ink-muted leading-relaxed pb-5 pr-10">{it.a}</p>}
          </div>
        );
      })}
    </div>
  );
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showFb, setShowFb] = useState(false);
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

  const q = query.trim().toLowerCase();
  const results: Hit[] = q
    ? ALL.filter((it) => (it.q + " " + it.a).toLowerCase().includes(q))
    : category
    ? ALL.filter((it) => it.section === category)
    : FAQS.map((f) => ({ section: "FAQ", q: f.q, a: f.a }));

  const heading = q ? `${results.length} ${results.length === 1 ? "answer" : "answers"}` : category ? category : "Popular questions";

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fbSubject.trim() || !fbMessage.trim()) {
      setError("Please fill in subject and message.");
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
        throw new Error(j.error || "Failed to send feedback.");
      }
      setSubmitted(true);
      setFbSubject("");
      setFbMessage("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-3xl mx-auto px-6">
        <div className="pt-6">
          <Link href="/" className="btn-quiet">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </div>

        <div className="pt-12 pb-2 text-center">
          <h1 className="text-[34px] leading-tight font-semibold tracking-tight text-ink">How can we help?</h1>
        </div>

        <div className="relative mt-6">
          <Search className="w-[18px] h-[18px] text-ink-faint absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpenKey(null); }}
            placeholder="Search help"
            aria-label="Search help"
            className="input pl-11 pr-4"
            style={{ minHeight: 52, fontSize: "1rem" }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {KB_ARTICLES.map((s) => (
            <button
              key={s.role}
              onClick={() => { setCategory(category === s.role ? null : s.role); setQuery(""); setOpenKey(null); }}
              className={`text-sm font-medium rounded-full px-3.5 py-1.5 border transition ${
                category === s.role && !q
                  ? "border-brand-purple text-brand-purple bg-[#F4F2FD]"
                  : "border-hairline text-ink-muted hover:text-ink"
              }`}
            >
              {s.role}
            </button>
          ))}
        </div>

        <div className="mt-12">
          <div className="section-title mb-1">{heading}</div>
          <Accordion items={results} openKey={openKey} onToggle={(k) => setOpenKey(openKey === k ? null : k)} />
        </div>

        <div className="mt-16 mb-20 border-t border-hairline pt-6">
          {!showFb && !submitted && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-ink-muted">Have an idea or need a hand?</span>
              <button onClick={() => setShowFb(true)} className="btn-quiet text-brand-purple">Send feedback</button>
            </div>
          )}

          {submitted && (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#2E7D4F] mt-0.5 shrink-0" />
              <div>
                <div className="text-[15px] font-medium text-ink">Thank you.</div>
                <p className="text-sm text-ink-muted mt-0.5">Your feedback has been sent. We read every message.</p>
                <button onClick={() => { setSubmitted(false); setShowFb(true); }} className="btn-quiet text-brand-purple mt-2">Send another</button>
              </div>
            </div>
          )}

          {showFb && !submitted && (
            <form onSubmit={submitFeedback} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="section-title">Send feedback</div>
                <button type="button" onClick={() => setShowFb(false)} className="btn-quiet">Close</button>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { v: "bug" as const, label: "Bug" },
                  { v: "idea" as const, label: "Idea" },
                  { v: "question" as const, label: "Question" },
                  { v: "other" as const, label: "Other" },
                ].map((o) => (
                  <button
                    type="button"
                    key={o.v}
                    onClick={() => setFbType(o.v)}
                    className={`text-sm font-medium rounded-full px-3.5 py-1.5 border transition ${
                      fbType === o.v ? "border-brand-purple text-brand-purple bg-[#F4F2FD]" : "border-hairline text-ink-muted hover:text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="fb-subject" className="text-sm font-medium text-ink">Subject</label>
                <input id="fb-subject" value={fbSubject} onChange={(e) => setFbSubject(e.target.value)} className="input mt-1.5" placeholder="Short summary" maxLength={120} />
              </div>

              <div>
                <label htmlFor="fb-message" className="text-sm font-medium text-ink">Message</label>
                <textarea id="fb-message" value={fbMessage} onChange={(e) => setFbMessage(e.target.value)} rows={6} className="input mt-1.5 resize-y leading-relaxed" placeholder="Tell us what happened, or what you would like to see." maxLength={4000} />
              </div>

              {!userEmail && (
                <div>
                  <label htmlFor="fb-email" className="text-sm font-medium text-ink">Email</label>
                  <div className="text-xs text-ink-faint mt-0.5">Optional, so we can reply.</div>
                  <input id="fb-email" type="email" value={fbEmail} onChange={(e) => setFbEmail(e.target.value)} className="input mt-1.5" placeholder="you@example.com" />
                </div>
              )}

              {error && <div className="text-sm text-[#C0392B]">{error}</div>}

              <button type="submit" disabled={submitting} className="btn-primary">
                <Send className="w-4 h-4" />
                {submitting ? "Sending…" : "Send feedback"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
