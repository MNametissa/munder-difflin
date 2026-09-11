import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A Claude Code profile: one config directory (~/.claude, ~/.claude-mecid, …)
 *  holding its own settings.json, projects/, and sessions. The harness can run
 *  agents under different profiles side by side, each resuming sessions from its
 *  own pool. */
export interface ClaudeProfile {
  /** Stable id: 'default' for ~/.claude, otherwise the suffix after '.claude-'. */
  id: string;
  /** Absolute config directory, e.g. '/home/me/.claude-mecid'. */
  dir: string;
  /** Human label for the UI: the id, or 'default'. */
  label: string;
  /** True for the bare ~/.claude directory. */
  isDefault: boolean;
  /** Whether the profile's projects/ tree holds at least one .jsonl session. */
  hasSessions: boolean;
}

/** Derive a profile id from its directory path: ~/.claude → 'default',
 *  ~/.claude-<name> → '<name>'. */
function profileIdFromDir(dir: string): string {
  const base = path.basename(dir);
  return base === '.claude' ? 'default' : base.replace(/^\.claude-/, '');
}

/** List every Claude profile on this machine: ~/.claude (default) plus every
 *  ~/.claude-<name> that holds a settings.json. Fossil directories without a
 *  settings.json (.claude-flow, .claude-shared, .claude-code-router) are
 *  skipped — they are leftover artefacts, not usable profiles. */
export function listProfiles(): ClaudeProfile[] {
  const home = os.homedir();
  const profiles: ClaudeProfile[] = [];
  const seen = new Set<string>();

  const add = (dir: string, isDefault: boolean): void => {
    if (seen.has(dir)) return;
    seen.add(dir);
    const id = profileIdFromDir(dir);
    const projectsRoot = path.join(dir, 'projects');
    let hasSessions = false;
    try {
      if (existsSync(projectsRoot)) {
        for (const sub of readdirSync(projectsRoot)) {
          const subDir = path.join(projectsRoot, sub);
          try {
            if (!statSync(subDir).isDirectory()) continue;
            if (readdirSync(subDir).some((f) => f.endsWith('.jsonl'))) { hasSessions = true; break; }
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* projects root unreadable — hasSessions stays false */ }
    profiles.push({ id, dir, label: id, isDefault, hasSessions });
  };

  const def = path.join(home, '.claude');
  if (existsSync(path.join(def, 'settings.json'))) add(def, true);

  try {
    for (const entry of readdirSync(home)) {
      if (!entry.startsWith('.claude-')) continue;
      const dir = path.join(home, entry);
      try { if (statSync(dir).isDirectory() && existsSync(path.join(dir, 'settings.json'))) add(dir, false); } catch { /* skip */ }
    }
  } catch { /* home unreadable */ }

  return profiles;
}

/** Resolve a profile's config directory by id, or null if no such profile.
 *  'default' (or unset) maps to ~/.claude when it exists. */
export function profileDir(id: string | null | undefined): string | null {
  if (!id || id === 'default') {
    const def = path.join(os.homedir(), '.claude');
    return existsSync(path.join(def, 'settings.json')) ? def : null;
  }
  const dir = path.join(os.homedir(), `.claude-${id}`);
  return existsSync(path.join(dir, 'settings.json')) ? dir : null;
}

/** The profile id to use when none is specified: the operator's
 *  CLAUDE_CONFIG_DIR if set (so the harness defaults to the profile it was
 *  launched under), otherwise 'default'. */
export function defaultProfileId(): string {
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (env) {
    const id = profileIdFromDir(env);
    if (id) return id;
  }
  return 'default';
}
