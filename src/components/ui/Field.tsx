import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Medan borang kit UI (KZ-021, nilai KZ-DS-v3).
 *
 * Label 14px 500 #344357 margin bawah 8px dengan pautan kanan 13px ungu.
 * Input tinggi 36px (lg 44px), padding 7px 16px, 13px, sudut 4px,
 * sempadan #dbdfea, fokus sempadan #854fff + bayang 0 0 0 3px
 * rgba(133,79,255,.1), ralat sempadan #e85347, nota 12px #8094ae,
 * ikon kiri/kanan #8094ae, select dengan anak panah, checkbox/radio ungu.
 */

const INPUT_ASAS =
  "w-full rounded-[4px] bg-white px-4 py-[7px] text-[13px] text-[#3c4d62] outline-none transition placeholder:text-ink-faint border border-hairline focus:border-brand-purple";
const FOKUS = "focus:shadow-[0_0_0_3px_rgba(133,79,255,.1)]";
const RALAT = "border-[#e85347]";

export type FieldProps = {
  label: string;
  htmlFor?: string;
  /** Pautan kanan label (contoh "Forgot?"): label + href. */
  linkLabel?: string;
  linkHref?: string;
  note?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Field({
  label,
  htmlFor,
  linkLabel,
  linkHref,
  note,
  error,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[14px] font-medium text-[#344357]">
          {label}
        </label>
        {linkHref && linkLabel && (
          <a href={linkHref} className="text-[13px] font-medium text-brand-purple hover:underline">
            {linkLabel}
          </a>
        )}
      </div>
      {children}
      {note != null && <p className="text-[12px] text-ink-faint mt-1.5">{note}</p>}
      {error != null && (
        <p role="alert" className="text-[12px] text-kz-down mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  lg?: boolean;
  ikonKiri?: ReactNode;
  ikonKanan?: ReactNode;
  ralat?: boolean;
};

export function Input({ lg, ikonKiri, ikonKanan, ralat, className = "", ...rest }: InputProps) {
  const saiz = lg ? "h-11" : "h-9";
  const pad = ikonKiri ? "pl-10" : "";
  const padKanan = ikonKanan ? "pr-10" : "";
  return (
    <span className="relative block">
      {ikonKiri && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
          {ikonKiri}
        </span>
      )}
      <input
        {...rest}
        aria-invalid={ralat || undefined}
        className={`${INPUT_ASAS} ${FOKUS} ${saiz} ${pad} ${padKanan} ${ralat ? RALAT : ""} ${className}`.trim()}
      />
      {ikonKanan && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
          {ikonKanan}
        </span>
      )}
    </span>
  );
}

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  lg?: boolean;
  ralat?: boolean;
};

export function Select({ lg, ralat, className = "", children, ...rest }: SelectProps) {
  const saiz = lg ? "h-11" : "h-9";
  return (
    <span className="relative block">
      <select
        {...rest}
        aria-invalid={ralat || undefined}
        className={`${INPUT_ASAS} ${FOKUS} ${saiz} appearance-none pr-9 ${ralat ? RALAT : ""} ${className}`.trim()}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
    </span>
  );
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ralat?: boolean;
};

export function Textarea({ ralat, className = "", ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      aria-invalid={ralat || undefined}
      className={`${INPUT_ASAS} ${FOKUS} min-h-[84px] py-2.5 ${ralat ? RALAT : ""} ${className}`.trim()}
    />
  );
}

export function CheckRadio({
  label,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-ink-muted select-none cursor-pointer">
      <input
        {...rest}
        type={rest.type === "radio" ? "radio" : "checkbox"}
        className="h-4 w-4 accent-brand-purple"
      />
      {label}
    </label>
  );
}
