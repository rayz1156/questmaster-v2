"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  HelpCircle, BookOpen, MessageSquare, ChevronDown, ChevronUp,
  Send, Trophy, ArrowLeft, Bug, Lightbulb, MessageCircle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Tab = "kb" | "faq" | "feedback";

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

export default function HelpPage() {
  const [tab, setTab] = useState<Tab>("kb");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openKb, setOpenKb] = useState<string | null>("Getting Started");
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      <header className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center gap-4">
          <Link href="/" className="opacity-80 hover:opacity-100" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Help &amp; Support</h1>
            <p className="text-sm opacity-90">Find answers, learn the platform, or send us feedback.</p>
          </div>
        </div>
      </header>

      <nav className="max-w-5xl mx-auto px-4 mt-6">
        <div className="inline-flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          {[
            { id: "kb" as const, label: "Knowledge Base", icon: <BookOpen className="w-4 h-4" /> },
            { id: "faq" as const, label: "FAQ", icon: <HelpCircle className="w-4 h-4" /> },
            { id: "feedback" as const, label: "Send Feedback", icon: <MessageSquare className="w-4 h-4" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t.id ? "bg-purple-600 text-white" : "text-gray-600 hover:bg-gray-50"
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
              <div key={section.role} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenKb(openKb === section.role ? null : section.role)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
                >
                  <span className="font-bold text-gray-900">{section.role}</span>
                  {openKb === section.role ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </button>
                {openKb === section.role && (
                  <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                    {section.items.map((it) => (
                      <div key={it.t} className="pt-4">
                        <h3 className="font-semibold text-gray-900">{it.t}</h3>
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{it.b}</p>
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
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">{f.q}</span>
                  {openFaq === i ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "feedback" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
            {submitted ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                <h2 className="text-xl font-bold mt-3">Thank you!</h2>
                <p className="text-gray-600 mt-2">Your feedback has been sent. We read every message.</p>
                <button onClick={() => setSubmitted(false)} className="mt-5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold">Send another</button>
              </div>
            ) : (
              <form onSubmit={submitFeedback} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Help us improve Kuizen</h2>
                  <p className="text-sm text-gray-600 mt-1">Bug? Feature idea? Confused about something? Tell us — we use this to plan the next release.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Type of feedback</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { v: "bug" as const, label: "Bug", icon: <Bug className="w-4 h-4" /> },
                      { v: "idea" as const, label: "Idea", icon: <Lightbulb className="w-4 h-4" /> },
                      { v: "question" as const, label: "Question", icon: <HelpCircle className="w-4 h-4" /> },
                      { v: "other" as const, label: "Other", icon: <MessageCircle className="w-4 h-4" /> },
                    ].map((o) => (
                      <button
                        type="button"
                        key={o.v}
                        onClick={() => setFbType(o.v)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${
                          fbType === o.v ? "bg-purple-50 border-purple-500 text-purple-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {o.icon}
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="fb-subject" className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                  <input id="fb-subject" value={fbSubject} onChange={(e) => setFbSubject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Short summary" maxLength={120} />
                </div>
                <div>
                  <label htmlFor="fb-message" className="block text-xs font-semibold text-gray-700 mb-1">Message</label>
                  <textarea id="fb-message" value={fbMessage} onChange={(e) => setFbMessage(e.target.value)} rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Tell us what happened or what you’d like to see…" maxLength={4000} />
                </div>
                {!userEmail && (
                  <div>
                    <label htmlFor="fb-email" className="block text-xs font-semibold text-gray-700 mb-1">Email (optional, so we can reply)</label>
                    <input id="fb-email" type="email" value={fbEmail} onChange={(e) => setFbEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="you@example.com" />
                  </div>
                )}
                {error && <div className="text-sm text-red-600">{error}</div>}
                <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  <Send className="w-4 h-4" />
                  {submitting ? "Sending…" : "Send feedback"}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
