import { useState } from 'react';
import { Plus, Wand2, Save, FolderOpen, Trash2 } from 'lucide-react';
import GlassCard from './ui/GlassCard.jsx';
import Button from './ui/Button.jsx';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import TaskRow from './TaskRow.jsx';
import { api } from '../lib/api.js';
import { parseTaskField } from '../lib/fieldError.js';

const blankTask = (category) => ({ title: '', minutes: 60, priority: 2, category });

export default function GeneratorPanel({ date, categories, templates, entries, busy, run, refresh, refreshTemplates }) {
  const defaultCategory = categories[categories.length - 1] ?? 'general';
  const [start, setStart] = useState('09:00');
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [replace, setReplace] = useState(true);
  const [tasks, setTasks] = useState([blankTask(defaultCategory)]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [confirm, setConfirm] = useState(null);

  function updateTask(index, patch) {
    setTasks((rows) => rows.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  function addTask() {
    setTasks((rows) => [...rows, blankTask(defaultCategory)]);
  }
  function removeTask(index) {
    setTasks((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  }

  async function doGenerate(doReplace) {
    const payload = {
      date,
      start,
      breakMinutes: Number(breakMinutes),
      replace: doReplace,
      tasks: tasks.map((t) => ({ ...t, minutes: Number(t.minutes), priority: Number(t.priority) })),
    };
    try {
      const result = await run(() => api.generate(payload));
      setError(null);
      setNotice(
        result.unscheduled?.length
          ? { type: 'warning', message: `Could not fit: ${result.unscheduled.map((t) => t.title).join(', ')}.` }
          : { type: 'success', message: 'Timetable generated.' },
      );
      refresh();
    } catch (err) {
      setNotice(null);
      setError({ message: err.message, field: parseTaskField(err.field) });
    }
  }

  function handleGenerate(e) {
    e.preventDefault();
    if (replace && entries.length > 0) {
      setConfirm({
        title: 'Replace this day?',
        message: 'This will replace everything planned for this day with the generated timetable.',
        danger: true,
        confirmLabel: 'Replace and generate',
        onConfirm: () => { setConfirm(null); doGenerate(true); },
      });
      return;
    }
    doGenerate(replace);
  }

  async function handleSaveTemplate(force = false) {
    const name = templateName.trim();
    if (!name) return;
    try {
      await run(() => api.saveTemplate({ name, tasks, replace: force }), { success: `Saved template "${name}".` });
      setTemplateName('');
      refreshTemplates();
    } catch (err) {
      if (err.status === 409) {
        setConfirm({
          title: 'Overwrite template?',
          message: err.message,
          danger: true,
          confirmLabel: 'Overwrite',
          onConfirm: () => { setConfirm(null); handleSaveTemplate(true); },
        });
      } else {
        setError({ message: err.message });
      }
    }
  }

  function loadTemplate(template) {
    const apply = () => setTasks(template.tasks.map((t) => ({ ...t })));
    const hasTyped = tasks.some((t) => t.title.trim());
    if (hasTyped) {
      setConfirm({
        title: 'Replace current tasks?',
        message: `Loading "${template.name}" will replace the tasks you have typed.`,
        confirmLabel: 'Load template',
        onConfirm: () => { setConfirm(null); apply(); },
      });
    } else {
      apply();
    }
  }

  function deleteTemplate(template) {
    setConfirm({
      title: 'Delete template?',
      message: `Delete the template "${template.name}"? This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirm(null);
        await run(() => api.deleteTemplate(template.id));
        refreshTemplates();
      },
    });
  }

  return (
    <GlassCard className="p-5 no-print">
      <ConfirmDialog open={!!confirm} {...confirm} onCancel={() => setConfirm(null)} />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Generate timetable</h2>
        <Wand2 size={18} className="text-brand-300" />
      </div>
      <p className="mb-4 text-xs text-slate-400">List your tasks; they are scheduled by priority, with breaks in between.</p>

      {templates.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {templates.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1 text-xs text-slate-200">
              {t.name}
              <button type="button" onClick={() => loadTemplate(t)} aria-label={`Load template ${t.name}`} className="ml-1 rounded-full p-1 transition-all hover:scale-110 hover:bg-brand-500/30">
                <FolderOpen size={12} />
              </button>
              <button type="button" onClick={() => deleteTemplate(t)} aria-label={`Delete template ${t.name}`} className="rounded-full p-1 transition-all hover:scale-110 hover:bg-rose-500/30">
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error.message}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            notice.type === 'warning' ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {notice.message}
        </p>
      )}

      <form onSubmit={handleGenerate} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
            Day starts
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-brand-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
            Break (min)
            <input
              type="number"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              min={0}
              max={120}
              required
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          {tasks.map((task, index) => (
            <TaskRow
              key={index}
              task={task}
              index={index}
              categories={categories}
              error={error?.field}
              onChange={updateTask}
              onRemove={removeTask}
              removable={tasks.length > 1}
            />
          ))}
        </div>
        <Button type="button" variant="ghost" onClick={addTask} className="self-start">
          <Plus size={15} /> Add task
        </Button>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 rounded accent-brand-500" />
          Replace existing entries for this day
        </label>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name"
            maxLength={50}
            aria-label="Template name"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          />
          <Button type="button" variant="ghost" onClick={() => handleSaveTemplate(false)} disabled={!templateName.trim()}>
            <Save size={15} /> Save as template
          </Button>
        </div>

        <Button type="submit" disabled={busy} className="mt-1">
          <Wand2 size={16} /> Generate
        </Button>
      </form>
    </GlassCard>
  );
}
