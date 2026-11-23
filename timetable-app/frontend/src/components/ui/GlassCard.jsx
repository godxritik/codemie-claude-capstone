export default function GlassCard({ className = '', children, as: As = 'section', ...props }) {
  return (
    <As
      className={`rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl
        shadow-[0_8px_30px_rgba(0,0,0,0.25)] ${className}`}
      {...props}
    >
      {children}
    </As>
  );
}
