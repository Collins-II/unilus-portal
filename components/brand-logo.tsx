import Image from "next/image";

type BrandLogoProps = { 
  className?: string; 
  inverse?: boolean; 
  compact?: boolean; 
};

export default function BrandLogo({ className = "", inverse = false, compact = false }: BrandLogoProps) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-3 ${className}`}>
      <span className={`grid h-11 w-11 place-items-center rounded-full overflow-hidden ${inverse ? "bg-white/10 text-blue-200" : "bg-[var(--brand)] text-white"}`}>
        <Image 
          src="/logo/inilus_logo.jpg" 
          alt="" 
          width={35} 
          height={35} 
          className="rounded-full object-cover" 
          aria-hidden="true" 
        />
      </span>
      {!compact && (
        <span className={`text-left ${inverse ? "text-white" : "text-[var(--brand-ink)]"}`}>
          <span className="block text-lg font-extrabold leading-tight tracking-tight">
            UNILUS<span className="font-normal"> Navigator</span>
          </span>
          <span className={`block text-[9px] font-semibold uppercase tracking-[0.18em] ${inverse ? "text-white/55" : "text-slate-500"}`}>
            University of Lusaka
          </span>
        </span>
      )}
    </span>
  );
}