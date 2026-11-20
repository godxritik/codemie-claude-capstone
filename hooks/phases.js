import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const APPROVALS = path.join(ROOT, 'approvals.json');
export const PROGRESS = path.join(ROOT, 'progress.md');

// Ordered pipeline: each phase is owned by one agent and gated by the previous phase's approval.
export const PHASES = [
  { phase: 'analysis',      agent: 'requirements-analyst' },
  { phase: 'plan',          agent: 'planner' },
  { phase: 'design',        agent: 'designer' },
  { phase: 'development',   agent: 'developer' },
  { phase: 'review',        agent: 'code-reviewer' },
  { phase: 'testing',       agent: 'tester' },
  { phase: 'documentation', agent: 'documenter' },
];

export const STATUSES = ['pending', 'in_progress', 'awaiting_approval', 'approved', 'revision_requested', 'rejected'];

export const readApprovals = () => JSON.parse(fs.readFileSync(APPROVALS, 'utf8'));
export const writeApprovals = (data) => fs.writeFileSync(APPROVALS, JSON.stringify(data, null, 2) + '\n');

export function renderProgressTable(data) {
  const rows = PHASES.map(({ phase, agent }) => `| ${phase} | ${agent} | ${data.phases[phase].status} |`);
  return ['| Phase | Agent | Status |', '| --- | --- | --- |', ...rows].join('\n');
}

export function updateProgressTable(data) {
  let md = fs.existsSync(PROGRESS) ? fs.readFileSync(PROGRESS, 'utf8') : '# SDLC Pipeline Progress\n\n## Activity log\n\n';
  const table = renderProgressTable(data);
  md = /\| Phase \|[\s\S]*?(?=\n\n)/.test(md) ? md.replace(/\| Phase \|[\s\S]*?(?=\n\n)/, table) : md + '\n' + table + '\n';
  fs.writeFileSync(PROGRESS, md);
}

export function appendLog(line) {
  fs.appendFileSync(PROGRESS, `- ${new Date().toISOString()} ${line}\n`);
}
