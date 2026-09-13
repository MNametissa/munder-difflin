import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CatalogModel, Modality } from '../shared/modelCatalogPayload';
import { listProfiles } from './profiles';

/** A model picker option as found in a Claude Code settings.json:
 *  { model, label, description, behavesAs }. */
interface ModelPickerOption {
  model?: unknown;
  label?: unknown;
  description?: unknown;
  behavesAs?: unknown;
}

/** Heuristic: infer modalities from a model id / label / description. Most
 *  coding-plan models handle code+docs; image/video models are rarer and
 *  name-spellable ("dola-seed" → image, "seedream" → image, "wan" → video). */
function inferModalities(id: string, label: string, desc: string): Modality[] {
  const haystack = `${id} ${label} ${desc}`.toLowerCase();
  const modalities: Modality[] = [];
  // Image generation models
  if (/\b(dola-seed|seedream|dall-?e|stable-?diffusion|imagen|flux|sdxl)\b/.test(haystack)) {
    modalities.push('image');
  }
  // Video generation models
  if (/\b(wan|sora|veo|kling|hunyuan-?video|pika)\b/.test(haystack)) {
    modalities.push('video');
  }
  // Embedding models
  if (/\b(embed|minilm|embeddinggemma|bge|e5)\b/.test(haystack)) {
    modalities.push('embedding');
  }
  // Everything in a coding-plan picker handles code + docs by default
  if (modalities.length === 0 || !modalities.includes('embedding')) {
    if (!modalities.includes('image') && !modalities.includes('video')) {
      modalities.push('code', 'docs');
    }
  }
  return modalities.length ? modalities : ['code', 'docs'];
}

/** Read the modelPicker.options array from a Claude profile's settings.json.
 *  Returns an empty array when the file or the key is absent. */
function readPickerOptions(profileDir: string): ModelPickerOption[] {
  try {
    const settingsPath = path.join(profileDir, 'settings.json');
    if (!existsSync(settingsPath)) return [];
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const picker = raw?.modelPicker;
    if (!picker || typeof picker !== 'object') return [];
    const opts = picker.options;
    if (!Array.isArray(opts)) return [];
    return opts.filter((o): o is ModelPickerOption => o != null && typeof o === 'object');
  } catch { return []; }
}

/** Detect models from every profile's modelPicker.options. Each detected model
 *  is tagged source: 'detected', provider: 'ark' (models coming through the Ark
 *  / ByteDance base URL), and enriched with inferred modalities. De-duplicated by
 *  model id across profiles (the same model in two profiles is one entry). */
export function detectModels(): CatalogModel[] {
  const profiles = listProfiles();
  const seen = new Set<string>();
  const out: CatalogModel[] = [];
  for (const profile of profiles) {
    const opts = readPickerOptions(profile.dir);
    for (const opt of opts) {
      const id = typeof opt.model === 'string' ? opt.model.trim() : '';
      const label = typeof opt.label === 'string' ? opt.label.trim() : '';
      const desc = typeof opt.description === 'string' ? opt.description.trim() : '';
      const behavesAs = typeof opt.behavesAs === 'string' ? opt.behavesAs.trim() : '';
      if (!id && !label) continue;
      const dedupKey = id || label;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const modalities = inferModalities(id, label, `${desc} ${behavesAs}`);
      out.push({
        ...(id ? { id } : {}),
        label: label || id,
        modalities,
        source: 'detected',
        provider: 'ark',
      });
    }
  }
  return out;
}

/** Read custom models persisted in the harness config. Stored under
 *  `customModels` in config.json. Returns an empty array when absent. */
export function readCustomModels(configPath: string): CatalogModel[] {
  try {
    if (!existsSync(configPath)) return [];
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    const arr = raw?.customModels;
    if (!Array.isArray(arr)) return [];
    const out: CatalogModel[] = [];
    for (const m of arr) {
      if (!m || typeof m !== 'object' || typeof m.label !== 'string') continue;
      out.push({ ...m, source: 'custom' });
    }
    return out;
  } catch { return []; }
}

/** The default Ark/ByteDance models baked into this build, so the picker is never
 *  empty even before detection runs. Mirrors the modelPicker the operator shipped
 *  with. */
export const BAKED_ARK_MODELS: CatalogModel[] = [
  { id: 'glm-5.2', label: 'GLM 5.2', modalities: ['code', 'docs'], source: 'builtin', provider: 'ark' },
  { id: 'kimi-k2.5', label: 'Kimi K2.5', modalities: ['code', 'docs'], source: 'builtin', provider: 'ark' },
  { id: 'dola-seed-2.0-pro', label: 'Dola Seed 2.0 Pro', modalities: ['image'], source: 'builtin', provider: 'ark' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', modalities: ['code', 'docs'], source: 'builtin', provider: 'ark' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', modalities: ['code', 'docs'], source: 'builtin', provider: 'ark' },
  { id: 'dola-seed-2.0-code', label: 'Dola Seed 2.0 Code', modalities: ['code'], source: 'builtin', provider: 'ark' },
];
