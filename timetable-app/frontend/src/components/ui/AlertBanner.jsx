import { X, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function AlertBanner({ notice, onDismiss }) {
  if (!notice) return null;
  const isError = notice.type === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`no-print mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur-xl animate-fade-in
        ${isError ? 'border-rose-400/30 bg-rose-500/10 text-rose-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'}`}
    >
      {isError ? <AlertTriangle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
      <p className="flex-1">{notice.message}</p>
      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDismiss}
        className="rounded-md p-1 transition-colors hover:bg-white/10"
      >
        <X size={16} />
      </button>
    </div>
  );
}
