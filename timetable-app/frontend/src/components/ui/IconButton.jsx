import { forwardRef } from 'react';

const TONES = {
  ghost: 'bg-white/5 hover:bg-white/15 text-slate-200',
  danger: 'bg-rose-500/10 hover:bg-rose-500/80 text-rose-300 hover:text-white',
};

const IconButton = forwardRef(function IconButton({ icon: Icon, label, variant = 'ghost', className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150
        hover:scale-110 active:scale-90
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
        ${TONES[variant]} ${className}`}
      {...props}
    >
      <Icon size={16} />
    </button>
  );
});

export default IconButton;
