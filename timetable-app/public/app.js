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
}

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

function shiftDay(days) {
  const d = new Date(`${dateInput.value}T00:00:00`);
  d.setDate(d.getDate() + days);
  dateInput.value = toISODate(d);
  showMessage('');
  runSchedule(load);
}

$('#prev-day').addEventListener('click', () => shiftDay(-1));
$('#next-day').addEventListener('click', () => shiftDay(1));
$('#today').addEventListener('click', () => {
  dateInput.value = toISODate(new Date());
  showMessage('');
  runSchedule(load);
});
dateInput.addEventListener('change', () => {
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
  const tasks = [...taskRows.children].map((row) => ({
    title: row.querySelector('[name=title]').value,
    minutes: Number(row.querySelector('[name=minutes]').value),
    priority: Number(row.querySelector('[name=priority]').value),
    category: row.querySelector('[name=category]').value,
  }));
  const describe = (u) => `"${u.title}" (${u.minutes} min, ${u.reason})`;
  setBusy(form, true);
  try {
    const res = await api('/generate', {
      method: 'POST',
      body: { date: dateInput.value, start: f.get('start'), breakMinutes: Number(f.get('breakMinutes')), tasks, replace },
    });
    editingId = null;
    render(res.entries);
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
    },
    { focus: false },
  );
})();
