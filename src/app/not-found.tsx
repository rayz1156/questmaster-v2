import Link from 'next/link';
import { teks } from '@/i18n/teks';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-6">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 text-4xl font-bold mb-6">
          404
        </div>
        <h1 className="text-3xl font-bold text-slate-900">{teks.tiadaHalaman.tajuk}</h1>
        <p className="mt-3 text-slate-600">{teks.tiadaHalaman.teks}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-sm font-medium hover:opacity-95 transition"
          >
            {teks.tiadaHalaman.utama}
          </Link>
          <Link
            href="/creator"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:border-emerald-400 hover:text-emerald-700 transition"
          >
            {teks.tiadaHalaman.papanPencipta}
          </Link>
        </div>
      </div>
    </div>
  );
}
