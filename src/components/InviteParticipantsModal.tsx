"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X, Copy, Share2, Check } from "lucide-react";

/**
 * Modal jemputan peserta (tiket V2-004): QR untuk /j/[kod], kod kelas
 * besar, salin pautan dan kongsi ke WhatsApp. Pautan dibina daripada
 * window.location.origin, bukan hardcode domain.
 */
export default function InviteParticipantsModal({
  open,
  onClose,
  joinCode,
  className,
}: {
  open: boolean;
  onClose: () => void;
  joinCode: string;
  className: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [link, setLink] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Jana QR dan pautan selepas modal dibuka (padang pelanggan sahaja).
  useEffect(() => {
    if (!open) return;
    const inviteLink = `${window.location.origin}/j/${joinCode}`;
    setLink(inviteLink);
    setCopied(false);
    QRCode.toDataURL(inviteLink, { width: 320, margin: 2 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(""));
  }, [open, joinCode]);

  // Kekunci Escape menutup modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* papan klip mungkin disekat pelayar */ }
  };

  const waText = encodeURIComponent(`Join my class ${className} on Kuizen: ${link}`);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold text-gray-900">Invite participants</h2>
        <p className="text-sm text-gray-500 mt-1">Students can scan this QR code or type the class code.</p>

        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mt-4 flex flex-col items-center gap-3">
          {qrDataUrl
            ? <img src={qrDataUrl} alt={`QR code for ${joinCode}`} className="w-56 h-56 rounded-lg bg-white" />
            : <div className="w-56 h-56 rounded-lg bg-white flex items-center justify-center text-xs text-gray-400">Generating QR…</div>}
          <div className="font-mono text-2xl font-bold tracking-[0.25em] text-gray-900">{joinCode}</div>
        </div>

        <div className="mt-4 space-y-2">
          <button
            onClick={copyLink}
            className="w-full py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center gap-2"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
          <a
            href={`https://wa.me/?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 rounded-xl text-white text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 inline-flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}