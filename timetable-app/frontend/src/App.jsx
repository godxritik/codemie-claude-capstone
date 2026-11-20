import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Rows3 } from 'lucide-react';
import { api } from './lib/api.js';
import { toISODate, addDays } from './lib/dateUtils.js';
import GlassCard from './components/ui/GlassCard.jsx';
import Button from './components/ui/Button.jsx';
import AlertBanner from './components/ui/AlertBanner.jsx';
import AddEntryForm from './components/AddEntryForm.jsx';
import ScheduleView from './components/ScheduleView.jsx';
import GeneratorPanel from './components/GeneratorPanel.jsx';
import WeekView from './components/WeekView.jsx';
import CategorySummary from './components/CategorySummary.jsx';

export default function App() {
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [view, setView] = useState('day');
  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const notifyError = useCallback((err) => setNotice({ type: 'error', message: err.message || 'Something went wrong' }), []);
  const notifySuccess = useCallback((message) => setNotice({ type: 'success', message }), []);

  const refreshEntries = useCallback(async () => {
    try {
      setEntries(await api.entries(date));
    } catch (err) {
      notifyError(err);
    }
  }, [date, notifyError]);

  const refreshTemplates = useCallback(async () => {
    try {
      setTemplates(await api.templates());
    } catch (err) {
      notifyError(err);
    }
  }, [notifyError]);

  useEffect(() => {
    api.categories().then(setCategories).catch(notifyError);
    refreshTemplates();
    // Runs once on mount; refreshTemplates/notifyError are stable useCallback refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view === 'day') refreshEntries();
  }, [date, view, refreshEntries]);

  useEffect(() => {
    document.title = `${date} · My Day Timetable`;
  }, [date]);

  async function run(action, { success } = {}) {
    setBusy(true);
    try {
      const result = await action();
      if (success) notifySuccess(success);
      return result;
    } catch (err) {
      notifyError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  function goToDate(d) {
    setDate(d);
    setView('day');
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <BackgroundDecor />
      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-300/80">Day Planner</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">My Day Timetable</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 no-print">
            <DateNav date={date} onChange={goToDate} />
            <ViewTabs view={view} setView={setView} />
          </div>
        </header>

        <AlertBanner notice={notice} onDismiss={() => setNotice(null)} />

        {view === 'week' ? (
          <WeekView date={date} onSelectDate={goToDate} notifyError={notifyError} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-6">
              <ScheduleView date={date} entries={entries} categories={categories} busy={busy} run={run} refresh={refreshEntries} />
              <CategorySummary date={date} entries={entries} />
            </div>
            <div className="flex flex-col gap-6">
              <AddEntryForm date={date} categories={categories} busy={busy} run={run} refresh={refreshEntries} />
              <GeneratorPanel
                date={date}
                categories={categories}
                templates={templates}
                entries={entries}
                busy={busy}
                run={run}
                refresh={refreshEntries}
                refreshTemplates={refreshTemplates}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DateNav({ date, onChange }) {
  return (
    <GlassCard as="div" className="flex items-center gap-1 p-1">
      <Button variant="subtle" className="px-2" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        <ChevronLeft size={18} />
      </Button>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Selected date"
        className="rounded-lg bg-transparent px-2 py-1.5 text-sm text-slate-100 outline-none [color-scheme:dark]"
      />
      <Button variant="subtle" className="px-2" aria-label="Next day" onClick={() => onChange(addDays(date, 1))}>
        <ChevronRight size={18} />
      </Button>
      <Button variant="ghost" onClick={() => onChange(toISODate(new Date()))}>
        <CalendarDays size={16} /> Today
      </Button>
    </GlassCard>
  );
}

function ViewTabs({ view, setView }) {
  const tabs = [
    { id: 'day', label: 'Day', icon: Rows3 },
    { id: 'week', label: 'Week', icon: LayoutGrid },
  ];
  return (
    <GlassCard as="div" className="flex gap-1 p-1">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150
            hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
            ${view === id ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30' : 'text-slate-300 hover:bg-white/10'}`}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </GlassCard>
  );
}

function BackgroundDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden no-print">
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl animate-blob" />
      <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl animate-blob [animation-delay:4s]" />
      <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl animate-blob [animation-delay:8s]" />
    </div>
  );
}
