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

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.body = data;
    throw err;
  }
  return data;
}

const run = async (fn) => {
  try {
    await fn();
  } catch (e) {
    showMessage(e.message);
    return false;
  }
  return true;
};

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
    check.addEventListener('change', () =>
      run(async () => {
        await api(`/entries/${e.id}`, { method: 'PATCH', body: { done: check.checked } });
        await load();
      }),
    );
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
      run(async () => {
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
    ev.preventDefault(); // saving is wired up in the next change
  });
  li.append(form);
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
  run(load);
}

$('#prev-day').addEventListener('click', () => shiftDay(-1));
$('#next-day').addEventListener('click', () => shiftDay(1));
$('#today').addEventListener('click', () => {
  dateInput.value = toISODate(new Date());
  showMessage('');
  run(load);
});
dateInput.addEventListener('change', () => {
  showMessage('');
  run(load);
});

$('#add-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const f = new FormData(form);
  const ok = await run(async () => {
    await api('/entries', {
      method: 'POST',
      body: { date: dateInput.value, title: f.get('title'), start: f.get('start'), end: f.get('end'), category: f.get('category') },
    });
    await load();
  });
  if (ok) {
    showMessage('');
    form.reset();
    form.category.value = 'general';
  }
});

$('#add-task').addEventListener('click', addTaskRow);

$('#gen-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const replace = f.get('replace') === 'on';
  if (replace && scheduleEl.children.length && !confirm('This will replace everything planned for this day. Continue?')) return;
  const tasks = [...taskRows.children].map((row) => ({
    title: row.querySelector('[name=title]').value,
    minutes: Number(row.querySelector('[name=minutes]').value),
    priority: Number(row.querySelector('[name=priority]').value),
    category: row.querySelector('[name=category]').value,
  }));
  const describe = (u) => `"${u.title}" (${u.minutes} min, ${u.reason})`;
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
    const skipped = e.body?.unscheduled ?? [];
    showMessage(skipped.length ? `${e.message}: ${skipped.map(describe).join('; ')}` : e.message);
  }
});

$('#clear-day').addEventListener('click', () => {
  if (!scheduleEl.children.length || !confirm('Delete all entries for this day?')) return;
  run(async () => {
    await api(`/day?date=${dateInput.value}`, { method: 'DELETE' });
    showMessage('');
    await load();
  });
});

(async function init() {
  dateInput.value = toISODate(new Date());
  await run(async () => {
    categories = await api('/categories');
    fillCategories($('#add-form').category);
    addTaskRow();
    await load();
  });
})();
