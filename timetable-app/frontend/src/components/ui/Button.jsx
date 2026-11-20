const VARIANTS = {
  primary: 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/30',
  ghost: 'bg-white/5 hover:bg-white/10 text-slate-100 border border-white/10',
  danger: 'bg-rose-500/90 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20',
  subtle: 'bg-transparent hover:bg-white/10 text-slate-300',
};

export default function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium
        transition-all duration-150 ease-out hover:scale-[1.03] active:scale-95
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
        ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
