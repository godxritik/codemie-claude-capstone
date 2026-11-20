const $ = (sel) => document.querySelector(sel);

const dateInput = $('#date');
const scheduleEl = $('#schedule');
const emptyEl = $('#empty');
const messageEl = $('#message');
const progressEl = $('#progress');
const taskRows = $('#task-rows');
let categories = [];
let currentEntries = []; // last list from GET or generate
let editingId = null; // id of the entry in edit mode, or null

const toISODate = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// kind: 'ok' | 'warn' | '' (error styling). Empty text hides the message.
function showMessage(text, kind = '') {
  messageEl.textContent = text;
  messageEl.classList.toggle('ok', kind === 'ok');
  messageEl.classList.toggle('warn', kind === 'warn');
  messageEl.hidden = !text;
}

class ApiError extends Error {
  constructor(message, status, body = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Returns parsed JSON (null for 204); throws ApiError for network and HTTP errors.
async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check that it is running.', 0);
  }
  if (res.status === 204) return null;
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

const scheduleErrorEl = $('#schedule-error');
const flagged = new WeakMap(); // error region -> { el, prev } of the field it flagged

// Empties the region and removes the invalid state it put on a field.
function clearError(region) {
  region.replaceChildren();
  const f = flagged.get(region);
  if (!f) return;
  f.el.removeAttribute('aria-invalid');
  if (f.prev) f.el.setAttribute('aria-describedby', f.prev);
  else f.el.removeAttribute('aria-describedby');
  flagged.delete(region);
}

// Shows err in the region (role=alert announces it). resolve(field) maps a server field to an
// element to mark invalid and focus; without one the region itself takes focus.
function showError(region, err, resolve = () => null, { focus = true } = {}) {
  clearError(region);
  region.append(document.createTextNode(err.message));
  const skipped = err.body?.unscheduled ?? [];
  if (skipped.length) {
    const ul = document.createElement('ul');
    for (const u of skipped) {
      const li = document.createElement('li');
      li.textContent = `"${u.title}" (${u.minutes} min): ${u.reason}`;
      ul.append(li);
    }
    region.append(ul);
  }
  const el = err.body?.field ? resolve(err.body.field) : err.el ?? null;
  if (el) {
    const prev = el.getAttribute('aria-describedby');
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', prev ? `${region.id} ${prev}` : region.id);
    flagged.set(region, { el, prev });
    if (focus) el.focus();
  } else if (focus) {
    region.focus();
  }
}

// Maps a server error field to a control of the form (null when unknown).
function resolveField(form, field) {
  if (field === 'date') return dateInput;
  if (field === 'tasks') return $('#add-task');
  const task = /^tasks\[(\d+)\](?:\.(\w+))?$/.exec(field);
  if (task) return taskRows.children[Number(task[1])]?.querySelector(`[name=${task[2] ?? 'title'}]`) ?? null;
  const el = form.elements.namedItem(field);
  return el instanceof Element ? el : null;
}

const fieldLabel = (el) =>
  el.getAttribute('aria-label') || el.closest('label')?.firstChild?.textContent.trim() || el.name;

// Constraint check for novalidate forms. Shows the first problem in the region and returns false.
function validateForm(form, region) {
  for (const el of form.elements) {
    if (el.willValidate && !el.checkValidity()) {
      showError(region, { message: `${fieldLabel(el)}: ${el.validationMessage}`, el });
      return false;
    }
  }
  return true;
}

// Typing in a field flagged invalid clears its error.
const clearOnInput = (ev) => {
  const el = ev.target;
  if (el.getAttribute?.('aria-invalid') !== 'true') return;
  const region = document.getElementById(el.getAttribute('aria-describedby')?.split(' ')[0]);
  if (region) clearError(region);
};
document.addEventListener('input', clearOnInput);
document.addEventListener('change', clearOnInput);

// Runs a user-initiated schedule action (toggle, delete, clear day, day navigation).
async function runSchedule(fn, { focus = true } = {}) {
  clearError(scheduleErrorEl);
  try {
    await fn();
    return true;
  } catch (e) {
    showError(scheduleErrorEl, e, undefined, { focus });
    return false;
  }
}

function render(entries = currentEntries) {
  currentEntries = entries;
  scheduleEl.replaceChildren();
  emptyEl.hidden = entries.length > 0;
  const tasks = entries.filter((e) => e.category !== 'break');
  const done = tasks.filter((e) => e.done).length;
  $('#copy-day').disabled = !entries.length;
  progressEl.textContent = tasks.length ? `${done}/${tasks.length} done` : '';

  for (const e of entries) {
    const li = document.createElement('li');
    li.className = `entry cat-${e.category}${e.done ? ' done' : ''}`;
    li.dataset.id = e.id;

    if (e.id === editingId) {
      li.classList.add('editing');
      renderEditForm(li, e);
      scheduleEl.append(li);
      continue;
    }

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = `${e.start} - ${e.end}`;

    const title = document.createElement('span');
    title.className = 'title';
    const strong = document.createElement('strong');
    strong.textContent = e.title;
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = e.category;
    title.append(strong, cat);

    const actions = document.createElement('span');
    actions.className = 'actions';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = e.done;
    check.setAttribute('aria-label', `Mark "${e.title}" done`);
    check.addEventListener('change', async () => {
      const ok = await runSchedule(async () => {
        await api(`/entries/${e.id}`, { method: 'PATCH', body: { done: check.checked } });
        await load();
      });
      if (!ok) check.checked = !check.checked;
    });
    const edit = document.createElement('button');
    edit.className = 'secondary small edit';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit "${e.title}"`);
    edit.addEventListener('click', () => openEdit(e.id));
    const del = document.createElement('button');
    del.className = 'danger small';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', `Delete "${e.title}"`);
    del.addEventListener('click', () =>
      runSchedule(async () => {
        await api(`/entries/${e.id}`, { method: 'DELETE' });
        await load();
      }),
    );
    actions.append(check, edit, del);

    li.append(time, title, actions);
    scheduleEl.append(li);
  }
}

async function load() {
  const entries = await api(`/entries?date=${dateInput.value}`);
  if (editingId !== null && !entries.some((e) => e.id === editingId)) editingId = null;
  render(entries);
  await Promise.all([refreshWeek(), refreshCategories()]);
}

// --- Time by category (server-computed; includes breaks, share of all planned time) ---
async function refreshCategories() {
  const date = dateInput.value;
  const { days } = await api(`/summary?from=${date}&to=${date}`);
  if (date !== dateInput.value) return; // a newer navigation superseded this response
  const day = days[0];
  const section = $('#cat-summary');
  section.hidden = !day.categories.length;
  const rows = $('#cat-rows');
  rows.replaceChildren();
  for (const c of day.categories) {
    const tr = document.createElement('tr');
    for (const text of [c.category, c.duration, c.share]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    rows.append(tr);
  }
  $('#cat-total').textContent = day.totalDuration;
}

// --- Week overview ---
const weekDaysEl = $('#week-days');
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let weekStart = null; // ISO date of the Monday of the shown week

// Local-date arithmetic (as shiftDay does) so month/year boundaries and DST are safe.
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T00:00:00`).getDay() + 6) % 7));

async function refreshWeek() {
  if (!weekStart) weekStart = mondayOf(dateInput.value);
  const res = await api(`/summary?from=${weekStart}&to=${addDays(weekStart, 6)}`);
  const today = toISODate(new Date());
  $('#week-range').textContent = `${weekStart} to ${addDays(weekStart, 6)}`;
  weekDaysEl.replaceChildren();
  for (const day of res.days) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(day.date === dateInput.value));
    const name = document.createElement('span');
    name.textContent = `${DAY_NAMES[new Date(`${day.date}T00:00:00`).getDay()]} ${day.date.slice(5)}`;
    btn.append(name);
    if (day.date === today) {
      const mark = document.createElement('span');
      mark.className = 'today-mark';
      mark.textContent = 'Today';
      btn.append(mark);
    }
    for (const text of [`${day.count} ${day.count === 1 ? 'entry' : 'entries'}`, `${day.minutes} min`, `${day.done} done`]) {
      const line = document.createElement('span');
      line.textContent = text;
      btn.append(line);
    }
    btn.addEventListener('click', () => {
      dateInput.value = day.date;
      weekStart = mondayOf(day.date);
      showMessage('');
      runSchedule(load);
    });
    li.append(btn);
    weekDaysEl.append(li);
  }
}

function shiftWeek(n) {
  weekStart = addDays(weekStart ?? mondayOf(dateInput.value), 7 * n);
  runSchedule(refreshWeek);
}
$('#prev-week').addEventListener('click', () => shiftWeek(-1));
$('#next-week').addEventListener('click', () => shiftWeek(1));

// Builds a labelled control; the label wraps the input like the other forms.
function labelled(text, control) {
  const label = document.createElement('label');
  label.append(text, control);
  return label;
}

function renderEditForm(li, entry) {
  const form = document.createElement('form');
  form.className = 'edit-form';
  form.noValidate = true;
  form.setAttribute('aria-label', `Edit "${entry.title}"`);

  const error = document.createElement('div');
  error.id = `edit-error-${entry.id}`;
  error.className = 'form-error';
  error.setAttribute('role', 'alert');
  error.tabIndex = -1;

  const title = document.createElement('input');
  title.name = 'title';
  title.required = true;
  title.maxLength = 100;
  title.value = entry.title;

  const start = document.createElement('input');
  start.type = 'time';
  start.name = 'start';
  start.required = true;
  start.value = entry.start;

  // A native time input cannot hold 24:00, so a full-day end is edited as text.
  const end = document.createElement('input');
  end.name = 'end';
  end.required = true;
  const hint = document.createElement('small');
  if (entry.end === '24:00') {
    end.type = 'text';
    end.inputMode = 'numeric';
    end.placeholder = 'HH:MM';
    end.pattern = '([01][0-9]|2[0-3]):[0-5][0-9]|24:00';
    hint.id = `edit-end-hint-${entry.id}`;
    hint.className = 'muted';
    hint.textContent = 'HH:MM, 24:00 = midnight';
    end.setAttribute('aria-describedby', hint.id);
  } else {
    end.type = 'time';
  }
  end.value = entry.end;

  const category = document.createElement('select');
  category.name = 'category';
  for (const c of categories) category.add(new Option(c, c));
  category.value = entry.category;

  const row = document.createElement('div');
  row.className = 'row';
  const endLabel = labelled('End', end);
  if (hint.id) endLabel.append(hint);
  row.append(labelled('Start', start), endLabel);

  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => cancelEdit(entry.id));
  actions.append(save, cancel);

  form.append(error, labelled('Title', title), row, labelled('Category', category), actions);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    saveEdit(form, entry);
  });
  form.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelEdit(entry.id);
    }
  });
  li.append(form);
}

// Disables the submit button and flags the form busy while a request runs.
function setBusy(form, busy) {
  const submit = form.querySelector('[type=submit]');
  if (submit) submit.disabled = busy;
  form.toggleAttribute('aria-busy', busy);
}

// Sends only the changed fields (never `done`); on error the form stays open and the entry unchanged.
async function saveEdit(form, entry) {
  const region = form.querySelector('.form-error');
  clearError(region);
  if (!validateForm(form, region)) return;
  const changes = {};
  for (const k of ['title', 'start', 'end', 'category']) {
    let v = form.elements[k].value;
    if (k === 'title' || k === 'end') v = v.trim();
    if (v !== entry[k]) changes[k] = v;
  }
  if (!Object.keys(changes).length) return cancelEdit(entry.id);

  setBusy(form, true);
  try {
    await api(`/entries/${entry.id}`, { method: 'PATCH', body: changes });
    editingId = null;
    await load(); // the row may have moved after the re-sort
    focusEditButton(entry.id);
  } catch (e) {
    if (e.status === 404) {
      editingId = null;
      await load();
      showError(scheduleErrorEl, e);
    } else {
      showError(region, e, (f) => resolveField(form, f));
    }
  } finally {
    setBusy(form, false);
  }
}

function focusEditButton(id) {
  scheduleEl.querySelector(`li[data-id="${id}"] .edit`)?.focus();
}

// Only one entry is editable at a time; opening another discards the first without saving.
function openEdit(id) {
  editingId = id;
  render();
  scheduleEl.querySelector(`li[data-id="${id}"] [name=title]`)?.focus();
}

function cancelEdit(id) {
  editingId = null;
  render();
  focusEditButton(id);
}

function fillCategories(select) {
  for (const c of categories) select.add(new Option(c, c));
  select.value = 'general';
}

function addTaskRow() {
  const row = $('#task-row').content.firstElementChild.cloneNode(true);
  fillCategories(row.querySelector('[name=category]'));
  row.querySelector('.remove').addEventListener('click', () => {
    if (taskRows.children.length > 1) row.remove();
  });
  taskRows.append(row);
}

const collectTasks = () =>
  [...taskRows.children].map((row) => ({
    title: row.querySelector('[name=title]').value,
    minutes: Number(row.querySelector('[name=minutes]').value),
    priority: Number(row.querySelector('[name=priority]').value),
    category: row.querySelector('[name=category]').value,
  }));

function shiftDay(days) {
  const d = new Date(`${dateInput.value}T00:00:00`);
  d.setDate(d.getDate() + days);
  dateInput.value = toISODate(d);
  weekStart = mondayOf(dateInput.value);
  showMessage('');
  runSchedule(load);
}

$('#prev-day').addEventListener('click', () => shiftDay(-1));
$('#next-day').addEventListener('click', () => shiftDay(1));
$('#today').addEventListener('click', () => {
  dateInput.value = toISODate(new Date());
  weekStart = mondayOf(dateInput.value);
  showMessage('');
  runSchedule(load);
});
dateInput.addEventListener('change', () => {
  if (dateInput.value) weekStart = mondayOf(dateInput.value);
  showMessage('');
  runSchedule(load);
});

$('#add-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const region = $('#add-error');
  clearError(region);
  if (!validateForm(form, region)) return;
  const f = new FormData(form);
  setBusy(form, true);
  try {
    await api('/entries', {
      method: 'POST',
      body: { date: dateInput.value, title: f.get('title'), start: f.get('start'), end: f.get('end'), category: f.get('category') },
    });
    showMessage('');
    form.reset();
    form.category.value = 'general';
    await load();
  } catch (e) {
    showError(region, e, (field) => resolveField(form, field));
  } finally {
    setBusy(form, false);
  }
});

$('#add-task').addEventListener('click', addTaskRow);

$('#gen-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const region = $('#gen-error');
  clearError(region);
  showMessage('');
  if (!validateForm(form, region)) return;
  const f = new FormData(form);
  const replace = f.get('replace') === 'on';
  if (replace && scheduleEl.children.length && !confirm('This will replace everything planned for this day. Continue?')) return;
  const tasks = collectTasks();
  const describe = (u) => `"${u.title}" (${u.minutes} min, ${u.reason})`;
  setBusy(form, true);
  try {
    const res = await api('/generate', {
      method: 'POST',
      body: { date: dateInput.value, start: f.get('start'), breakMinutes: Number(f.get('breakMinutes')), tasks, replace },
    });
    editingId = null;
    render(res.entries);
    await Promise.all([refreshWeek(), refreshCategories()]);
    // Task rows are kept on purpose so skipped tasks can be adjusted.
    if (res.unscheduled.length) {
      showMessage(`Timetable generated. ${res.unscheduled.length} task(s) not scheduled: ${res.unscheduled.map(describe).join('; ')}`, 'warn');
    } else {
      showMessage('Timetable generated.', 'ok');
    }
  } catch (e) {
    showError(region, e, (field) => resolveField(form, field));
  } finally {
    setBusy(form, false);
  }
});

// --- Task templates ---
const tplError = $('#tpl-error');
const tplList = $('#tpl-list');
const tplStatus = $('#tpl-status');
let templates = [];

function renderTemplates() {
  tplList.replaceChildren();
  for (const t of templates) tplList.add(new Option(`${t.name} (${t.tasks.length} task${t.tasks.length === 1 ? '' : 's'})`, t.id));
  if (!templates.length) tplList.add(new Option('No saved templates', ''));
  tplList.disabled = !templates.length;
  $('#tpl-load').disabled = !templates.length;
  $('#tpl-delete').disabled = !templates.length;
}

async function loadTemplates() {
  templates = await api('/templates');
  renderTemplates();
}

async function runTemplate(fn) {
  clearError(tplError);
  tplStatus.textContent = '';
  try {
    await fn();
  } catch (e) {
    showError(tplError, e, (f) => (f === 'name' ? $('#tpl-name') : resolveField($('#gen-form'), f)));
  }
}

$('#tpl-save').addEventListener('click', () =>
  runTemplate(async () => {
    const name = $('#tpl-name').value;
    const body = { name, tasks: collectTasks() };
    let saved;
    try {
      saved = await api('/templates', { method: 'POST', body });
    } catch (e) {
      if (e.status !== 409 || !confirm(`A template named "${name.trim()}" already exists. Replace it?`)) throw e;
      saved = await api('/templates', { method: 'POST', body: { ...body, replace: true } });
    }
    $('#tpl-name').value = '';
    await loadTemplates();
    tplList.value = String(saved.id);
    tplStatus.textContent = `Template "${saved.name}" saved.`;
  }),
);

$('#tpl-load').addEventListener('click', () =>
  runTemplate(async () => {
    const t = templates.find((x) => String(x.id) === tplList.value);
    if (!t) return;
    const typed = [...taskRows.children].some((row) => row.querySelector('[name=title]').value.trim());
    if (typed && !confirm('Replace the task rows you have typed with this template?')) return;
    taskRows.replaceChildren();
    for (const task of t.tasks) {
      addTaskRow();
      const row = taskRows.lastElementChild;
      row.querySelector('[name=title]').value = task.title;
      row.querySelector('[name=minutes]').value = task.minutes;
      row.querySelector('[name=priority]').value = String(task.priority);
      row.querySelector('[name=category]').value = task.category;
    }
    tplStatus.textContent = `Template "${t.name}" loaded.`;
  }),
);

$('#tpl-delete').addEventListener('click', () =>
  runTemplate(async () => {
    const t = templates.find((x) => String(x.id) === tplList.value);
    if (!t || !confirm(`Delete template "${t.name}"?`)) return;
    await api(`/templates/${t.id}`, { method: 'DELETE' });
    await loadTemplates();
    tplStatus.textContent = `Template "${t.name}" deleted.`;
  }),
);

$('#copy-day').addEventListener('click', () => {
  const to = $('#copy-to').value;
  const body = { from: dateInput.value, to };
  runSchedule(async () => {
    if (!to) throw Object.assign(new ApiError('Choose a date to copy to', 400), { el: $('#copy-to') });
    let res;
    try {
      res = await api('/copy', { method: 'POST', body });
    } catch (e) {
      if (e.status !== 409 || !confirm(`${e.message}. Replace them with this day's entries?`)) throw e;
      res = await api('/copy', { method: 'POST', body: { ...body, replace: true } });
    }
    showMessage(`Copied ${res.copied} entries to ${to}.`, 'ok');
  });
});

$('#clear-day').addEventListener('click', () => {
  if (!scheduleEl.children.length || !confirm('Delete all entries for this day?')) return;
  runSchedule(async () => {
    await api(`/day?date=${dateInput.value}`, { method: 'DELETE' });
    showMessage('');
    await load();
  });
});

(async function init() {
  dateInput.value = toISODate(new Date());
  // Initial load errors are shown but must not steal focus on page load.
  await runSchedule(
    async () => {
      categories = await api('/categories');
      fillCategories($('#add-form').category);
      addTaskRow();
      await load();
      await loadTemplates();
    },
    { focus: false },
  );
})();
