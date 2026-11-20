// CLI used by the orchestrator to record phase state and human decisions.
// Usage: node hooks/approve.js <phase> <status> [--reviewer NAME] [--comment TEXT] [--artifact PATH]...
import { PHASES, STATUSES, readApprovals, writeApprovals, updateProgressTable, appendLog } from './phases.js';

const [phase, status, ...rest] = process.argv.slice(2);
if (!PHASES.some((p) => p.phase === phase) || !STATUSES.includes(status)) {
  console.error(`Usage: node hooks/approve.js <${PHASES.map((p) => p.phase).join('|')}> <${STATUSES.join('|')}> [--reviewer N] [--comment T] [--artifact P]`);
  process.exit(1);
}

const opts = { artifact: [], comment: [], jira: [] };
for (let i = 0; i < rest.length; i += 2) {
  const key = rest[i].replace(/^--/, '');
  if (key === 'artifact' || key === 'comment' || key === 'jira') opts[key].push(rest[i + 1]);
  else opts[key] = rest[i + 1];
}

const data = readApprovals();
const entry = data.phases[phase];
entry.status = status;
if (status === 'in_progress') entry.iteration += 1;
if (opts.artifact.length) entry.artifacts = [...new Set([...entry.artifacts, ...opts.artifact])];
if (opts.jira.length) {
  const bad = opts.jira.filter((k) => !/^[A-Z][A-Z0-9]+-\d+$/.test(k));
  if (bad.length) { console.error(`Invalid Jira key(s): ${bad.join(', ')}`); process.exit(1); }
  entry.jira = [...new Set([...(entry.jira ?? []), ...opts.jira])];
}
if (opts.comment.length) entry.comments.push(...opts.comment);
if (['approved', 'revision_requested', 'rejected'].includes(status)) {
  entry.reviewer = opts.reviewer ?? entry.reviewer;
  entry.decidedAt = new Date().toISOString();
}

writeApprovals(data);
updateProgressTable(data);
appendLog(`${phase} -> ${status}${opts.reviewer ? ` (by ${opts.reviewer})` : ''}${opts.comment.length ? `: ${opts.comment.join('; ')}` : ''}`);
console.log(`${phase}: ${status} (iteration ${entry.iteration})`);
