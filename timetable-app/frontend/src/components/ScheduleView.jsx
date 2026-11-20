import { useState } from 'react';
import { Download, Printer, Copy as CopyIcon, Trash2 } from 'lucide-react';
import GlassCard from './ui/GlassCard.jsx';
import Button from './ui/Button.jsx';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import EntryItem from './EntryItem.jsx';
import { api } from '../lib/api.js';

export default function ScheduleView({ date, entries, categories, busy, run, refresh }) {
  const [editingId, setEditingId] = useState(null);
  const [copyTo, setCopyTo] = useState('');
  const [confirm, setConfirm] = useState(null);

  const tasks = entries.filter((e) => e.category !== 'break');
  const done = tasks.filter((e) => e.done).length;
  const hasEntries = entries.length > 0;

  function handleClear() {
    setConfirm({
      title: 'Clear this day?',
      message: 'This deletes every entry planned for this day. This cannot be undone.',
      danger: true,
      confirmLabel: 'Clear day',
      onConfirm: async () => {
        setConfirm(null);
        await run(() => api.clearDay(date), { success: 'Day cleared.' });
        refresh();
      },
    });
  }

  function performCopy(replace) {
    run(() => api.copyDay({ from: date, to: copyTo, replace }), { success: `Copied to ${copyTo}.` })
      .then(() => setCopyTo(''))
      .catch((err) => {
        if (err.status === 409) {
          setConfirm({
            title: 'Replace the target day?',
            message: `${copyTo} already has ${err.existing} entr${err.existing === 1 ? 'y' : 'ies'}. Replace them with this day's plan?`,
            danger: true,
            confirmLabel: 'Replace and copy',
            onConfirm: () => { setConfirm(null); performCopy(true); },
          });
        }
      });
  }

  function handleCopy(e) {
    e.preventDefault();
    if (!copyTo || copyTo === date) return;
    performCopy(false);
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <ConfirmDialog open={!!confirm} {...confirm} onCancel={() => setConfirm(null)} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Schedule</h2>
          {tasks.length > 0 && <p className="text-sm text-slate-400">{done}/{tasks.length} done</p>}
          <p className="mb-1 hidden text-sm text-slate-500 print:block">{date}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <form onSubmit={handleCopy} className="flex items-center gap-1.5">
            <input
              type="date"
              value={copyTo}
              onChange={(e) => setCopyTo(e.target.value)}
              aria-label="Copy this day to date"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-slate-100 outline-none [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-brand-400"
            />
            <Button type="submit" variant="ghost" disabled={!hasEntries || !copyTo || copyTo === date} aria-label="Copy day to selected date">
              <CopyIcon size={15} /> Copy
            </Button>
          </form>
          <a
            href={hasEntries ? api.exportUrl(date) : undefined}
            aria-disabled={!hasEntries}
            onClick={(e) => { if (!hasEntries) e.preventDefault(); }}
            download
            className={`inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100
              transition-all duration-150 hover:scale-[1.03] hover:bg-white/10 active:scale-95
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
              ${!hasEntries ? 'pointer-events-none opacity-40' : ''}`}
          >
            <Download size={15} /> Export
          </a>
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer size={15} /> Print
          </Button>
          <Button variant="danger" disabled={!hasEntries} onClick={handleClear}>
            <Trash2 size={15} /> Clear day
          </Button>
        </div>
      </div>

      {!hasEntries ? (
        <p className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-400">
          Nothing planned yet. Add an entry or generate a timetable.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <EntryItem
              key={entry.id}
              entry={entry}
              categories={categories}
              editing={editingId === entry.id}
              onEdit={() => setEditingId(entry.id)}
              onCloseEdit={() => setEditingId(null)}
              busy={busy}
              run={run}
              refresh={refresh}
            />
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
