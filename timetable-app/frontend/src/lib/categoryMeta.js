import { Briefcase, BookOpen, HeartPulse, User, Coffee, CircleDot } from 'lucide-react';

// Category identity is text + icon, never colour alone (keeps the accessibility work from TIME-12).
const META = {
  work: { label: 'Work', icon: Briefcase, chip: 'bg-sky-500/15 text-sky-300 ring-sky-400/30', bar: 'from-sky-500 to-sky-300' },
  study: { label: 'Study', icon: BookOpen, chip: 'bg-violet-500/15 text-violet-300 ring-violet-400/30', bar: 'from-violet-500 to-violet-300' },
  health: { label: 'Health', icon: HeartPulse, chip: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30', bar: 'from-emerald-500 to-emerald-300' },
  personal: { label: 'Personal', icon: User, chip: 'bg-pink-500/15 text-pink-300 ring-pink-400/30', bar: 'from-pink-500 to-pink-300' },
  break: { label: 'Break', icon: Coffee, chip: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', bar: 'from-amber-500 to-amber-300' },
  general: { label: 'General', icon: CircleDot, chip: 'bg-slate-500/15 text-slate-300 ring-slate-400/30', bar: 'from-slate-500 to-slate-300' },
};

export function categoryMeta(category) {
  return META[category] ?? META.general;
}
