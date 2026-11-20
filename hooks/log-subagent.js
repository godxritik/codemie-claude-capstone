// SubagentStop hook: records every phase-agent completion in progress.md.
import fs from 'node:fs';
import { PHASES, appendLog } from './phases.js';

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin */ }

const agent = input.agent_type || input.subagent_type;
if (PHASES.some((p) => p.agent === agent)) appendLog(`agent ${agent} finished`);
process.exit(0);
