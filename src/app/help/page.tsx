"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  HelpCircle, BookOpen, MessageSquare, ChevronDown, ChevronUp,
  Send, Trophy, ArrowLeft, Bug, Lightbulb, MessageCircle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { teks } from "@/i18n/teks";

type Tab = "kb" | "faq" | "feedback";

export default function HelpPage() {
  const [tab, setTab] = useState<Tab>("kb");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openKb, setOpenKb] = useState<string | null>(teks.bantuan.kb[0].peranan);
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
      setError(teks.bantuan.silaIsi);
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
        throw new Error(j.error || teks.bantuan.gagalHantar);
      }
      setSubmitted(true);
      setFbSubject("");
      setFbMessage("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : teks.bantuan.sesuatu);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-primary text-white">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center gap-4">
          <Link href="/" className="opacity-80 hover:opacity-100" aria-label={teks.bantuan.kembali}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-10 h-10 rounded bg-white/15 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{teks.bantuan.tajuk}</h1>
            <p className="text-sm opacity-90">{teks.bantuan.subtajuk}</p>
          </div>
        </div>
      </header>

      <nav className="max-w-5xl mx-auto px-4 mt-6">
        <div className="inline-flex bg-white rounded shadow-sm border border-slate-200 p-1">
          {[
            { id: "kb" as const, label: teks.bantuan.tabKb, icon: <BookOpen className="w-4 h-4" /> },
            { id: "faq" as const, label: teks.bantuan.tabFaq, icon: <HelpCircle className="w-4 h-4" /> },
            { id: "feedback" as const, label: teks.bantuan.tabMaklum, icon: <MessageSquare className="w-4 h-4" /> },
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
            {teks.bantuan.kb.map((section) => (
              <div key={section.peranan} className="bg-white rounded shadow-sm border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setOpenKb(openKb === section.peranan ? null : section.peranan)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
                >
                  <span className="font-bold text-slate-900">{section.peranan}</span>
                  {openKb === section.peranan ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                </button>
                {openKb === section.peranan && (
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
            {teks.bantuan.faq.map((f, i) => (
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
                <h2 className="text-xl font-bold mt-3">{teks.bantuan.terimaKasih}</h2>
                <p className="text-slate-600 mt-2">{teks.bantuan.maklumDihantar}</p>
                <button onClick={() => setSubmitted(false)} className="mt-5 px-4 py-2 bg-primary text-white rounded text-sm font-semibold">{teks.bantuan.hantarLagi}</button>
              </div>
            ) : (
              <form onSubmit={submitFeedback} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{teks.bantuan.bantuTajuk}</h2>
                  <p className="text-sm text-slate-600 mt-1">{teks.bantuan.bantuSub}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">{teks.bantuan.jenis}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { v: "bug" as const, label: teks.bantuan.jenisPepijat, icon: <Bug className="w-4 h-4" /> },
                      { v: "idea" as const, label: teks.bantuan.jenisIdea, icon: <Lightbulb className="w-4 h-4" /> },
                      { v: "question" as const, label: teks.bantuan.jenisSoalan, icon: <HelpCircle className="w-4 h-4" /> },
                      { v: "other" as const, label: teks.bantuan.jenisLain, icon: <MessageCircle className="w-4 h-4" /> },
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
                  <label htmlFor="fb-subject" className="block text-xs font-semibold text-slate-700 mb-1">{teks.bantuan.subjek}</label>
                  <input id="fb-subject" value={fbSubject} onChange={(e) => setFbSubject(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder={teks.bantuan.placeholderSubjek} maxLength={120} />
                </div>
                <div>
                  <label htmlFor="fb-message" className="block text-xs font-semibold text-slate-700 mb-1">{teks.bantuan.mesej}</label>
                  <textarea id="fb-message" value={fbMessage} onChange={(e) => setFbMessage(e.target.value)} rows={6} className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder={teks.bantuan.placeholderMesej} maxLength={4000} />
                </div>
                {!userEmail && (
                  <div>
                    <label htmlFor="fb-email" className="block text-xs font-semibold text-slate-700 mb-1">{teks.bantuan.emelPilihan}</label>
                    <input id="fb-email" type="email" value={fbEmail} onChange={(e) => setFbEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder={teks.bantuan.placeholderEmel} />
                  </div>
                )}
                {error && <div className="text-sm text-status-danger">{error}</div>}
                <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded text-sm font-semibold disabled:opacity-50">
                  <Send className="w-4 h-4" />
                  {submitting ? teks.bantuan.menghantar : teks.bantuan.butang}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
