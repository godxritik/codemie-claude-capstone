// PreToolUse hook (matcher: Agent|Task). Blocks a phase agent from starting
// unless the previous phase has been approved by a human in approvals.json.
import fs from 'node:fs';
import { PHASES, readApprovals } from './phases.js';

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin */ }

const agent = input.tool_input?.subagent_type;
const idx = PHASES.findIndex((p) => p.agent === agent);
if (idx === -1) process.exit(0); // not an SDLC phase agent

const approvals = readApprovals();
const { phase } = PHASES[idx];
const current = approvals.phases[phase].status;

if (current === 'approved') {
  console.error(`Phase "${phase}" is already approved. Reset it via "node hooks/approve.js ${phase} revision_requested" to re-run.`);
  process.exit(2);
}

if (idx > 0) {
  const prev = PHASES[idx - 1].phase;
  const prevStatus = approvals.phases[prev].status;
  if (prevStatus !== 'approved') {
    console.error(`HITL gate: cannot start "${phase}" (${agent}) because "${prev}" is "${prevStatus}", not "approved". Obtain human approval for "${prev}" first.`);
    process.exit(2);
  }
}

process.exit(0);
