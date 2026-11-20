const $ = (sel) => document.querySelector(sel);

const dateInput = $('#date');
const scheduleEl = $('#schedule');
const emptyEl = $('#empty');
const messageEl = $('#message');
const progressEl = $('#progress');
const taskRows = $('#task-rows');
let categories = [];

const toISODate = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function showMessage(text, ok = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle('ok', ok);
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
  if (!res.ok) throw new Error(data.error || 'Request failed');
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

function render(entries) {
  scheduleEl.replaceChildren();
  emptyEl.hidden = entries.length > 0;
  const tasks = entries.filter((e) => e.category !== 'break');
  const done = tasks.filter((e) => e.done).length;
  progressEl.textContent = tasks.length ? `${done}/${tasks.length} done` : '';

  for (const e of entries) {
    const li = document.createElement('li');
    li.className = `entry cat-${e.category}${e.done ? ' done' : ''}`;
    li.dataset.id = e.id;

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
    const del = document.createElement('button');
    del.className = 'danger small';
    del.textContent = 'Delete';
    del.addEventListener('click', () =>
      run(async () => {
        await api(`/entries/${e.id}`, { method: 'DELETE' });
        await load();
      }),
    );
    actions.append(check, del);

    li.append(time, title, actions);
    scheduleEl.append(li);
  }
}

async function load() {
  const entries = await api(`/entries?date=${dateInput.value}`);
  render(entries);
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
  const ok = await run(async () => {
    const entries = await api('/generate', {
      method: 'POST',
      body: { date: dateInput.value, start: f.get('start'), breakMinutes: Number(f.get('breakMinutes')), tasks, replace },
    });
    render(entries);
  });
  if (ok) showMessage('Timetable generated.', true);
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
