import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { PixelButton } from './PixelButton';

/** Models panel — shows the unified catalog of models (builtin + detected from
 *  Claude profiles' modelPicker + manually added custom models). Lets the user
 *  add/remove custom models and rescan profiles. */

interface CatalogModel {
  id?: string;
  label: string;
  modalities?: string[];
  source: string;
  provider?: string;
}

const headStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px',
  color: 'var(--cth-ink-500)', textTransform: 'uppercase', marginBottom: 6
};
const inputStyle: CSSProperties = {
  padding: '4px 8px 2px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 12,
  color: 'var(--cth-ink-900)',
  outline: 'none'
};

const MODALITIES = ['code', 'docs', 'image', 'video', 'embedding'] as const;

const SOURCE_COLORS: Record<string, string> = {
  builtin: 'var(--cth-sky-light)',
  detected: 'var(--cth-mint)',
  custom: 'var(--cth-cream-100)',
};

function modalityIcon(m: string): string {
  switch (m) {
    case 'code': return '⌨';
    case 'docs': return '📄';
    case 'image': return '🖼';
    case 'video': return '🎬';
    case 'embedding': return '🧬';
    default: return '·';
  }
}

export function ModelsPanel() {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newId, setNewId] = useState('');
  const [newProvider, setNewProvider] = useState('');
  const [newModalities, setNewModalities] = useState<string[]>(['code']);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await window.cth.listModels();
      setModels(list ?? []);
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rescan = async () => {
    setRescanning(true);
    setNote('');
    try {
      const list = await window.cth.rescanModels() as CatalogModel[] | null;
      setModels(list ?? []);
      setNote('Rescan complete');
    } catch { setNote('Rescan failed'); }
    setRescanning(false);
    setTimeout(() => setNote(''), 3000);
  };

  const addModel = async () => {
    const label = newLabel.trim();
    if (!label) return;
    const modalities = newModalities.length > 0 ? newModalities : ['code'];
    try {
      await window.cth.addModel({ label, id: newId.trim() || undefined, modalities, provider: newProvider.trim() || undefined });
      setNewLabel(''); setNewId(''); setNewProvider(''); setNewModalities(['code']);
      setShowAdd(false);
      await load();
    } catch { setNote('Failed to add model'); }
  };

  const removeModel = async (label: string) => {
    try {
      await window.cth.removeModel(label);
      await load();
    } catch { /* noop */ }
  };

  const toggleModality = (m: string) => {
    setNewModalities((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={headStyle}>Model Catalog</div>
          <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>
            {loading ? 'Loading…' : `${models.length} models`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <PixelButton variant="secondary" size="sm" onClick={rescan} disabled={rescanning}>
            {rescanning ? 'Scanning…' : 'Rescan'}
          </PixelButton>
          <PixelButton variant="secondary" size="sm" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : 'Add model'}
          </PixelButton>
        </div>
      </div>

      {note && <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{note}</div>}

      {showAdd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', background: 'var(--cth-paper-100)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input placeholder="Label (e.g. GLM 5.2)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={inputStyle} />
            <input placeholder="Model ID (optional)" value={newId} onChange={(e) => setNewId(e.target.value)} style={inputStyle} />
          </div>
          <input placeholder="Provider (e.g. Ark/ByteDance)" value={newProvider} onChange={(e) => setNewProvider(e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--cth-ink-700)' }}>Modalities:</span>
            {MODALITIES.map((m) => (
              <button
                key={m}
                onClick={() => toggleModality(m)}
                style={{
                  padding: '2px 8px', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 11,
                  background: newModalities.includes(m) ? 'var(--cth-sky-light)' : 'var(--cth-cream-100)',
                  boxShadow: newModalities.includes(m) ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-100)'
                }}
              >{modalityIcon(m)} {m}</button>
            ))}
          </div>
          <PixelButton variant="primary" size="sm" onClick={addModel} disabled={!newLabel.trim()}>
            Save model
          </PixelButton>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {models.map((m, i) => (
          <div key={`${m.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
            <span style={{
              fontSize: 8, fontFamily: 'var(--cth-font-display)', textTransform: 'uppercase',
              padding: '2px 5px', color: 'var(--cth-ink-700)',
              background: SOURCE_COLORS[m.source] ?? 'var(--cth-cream-100)',
              boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
            }}>{m.source}</span>
            <span style={{ fontSize: 12, color: 'var(--cth-ink-900)', fontWeight: 500 }}>{m.label}</span>
            {m.id && <span style={{ fontSize: 10, color: 'var(--cth-ink-500)' }}>{m.id}</span>}
            {m.provider && <span style={{ fontSize: 10, color: 'var(--cth-ink-500)' }}>· {m.provider}</span>}
            <div style={{ flex: 1 }} />
            {m.modalities?.map((mod) => (
              <span key={mod} style={{ fontSize: 14 }} title={mod}>{modalityIcon(mod)}</span>
            ))}
            {m.source === 'custom' && (
              <button
                onClick={() => void removeModel(m.label)}
                style={{ border: 'none', cursor: 'pointer', background: 'none', fontSize: 12, color: 'var(--cth-ink-500)', padding: '0 4px' }}
                title="Remove"
              >✕</button>
            )}
          </div>
        ))}
        {!loading && models.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--cth-ink-500)', padding: 10 }}>No models found. Click "Rescan" to detect models from Claude profiles.</div>
        )}
      </div>
    </div>
  );
}
