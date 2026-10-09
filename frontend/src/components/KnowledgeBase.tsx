import { useEffect, useState } from 'react';
import {
  Brand,
  KbEntry,
  getKnowledge,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge
} from '../api';

const CATEGORIES = ['RETURN', 'REFUND', 'SHIPPING', 'CANCELLATION', 'GENERAL'];

interface Props {
  brands: Brand[];
}

interface FormState {
  id: string | null;
  category: string;
  title: string;
  content: string;
}

const EMPTY: FormState = { id: null, category: 'REFUND', title: '', content: '' };

export default function KnowledgeBase({ brands }: Props) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setEntries(await getKnowledge(id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(brandId);
    setForm(EMPTY);
  }, [brandId]);

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (form.id) {
        await updateKnowledge(form.id, { category: form.category, title: form.title, content: form.content });
      } else {
        await createKnowledge(brandId, { category: form.category, title: form.title, content: form.content });
      }
      setForm(EMPTY);
      await load(brandId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteKnowledge(id);
      setConfirmDelete(null);
      if (form.id === id) setForm(EMPTY);
      await load(brandId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="kb">
      <div className="kb-toolbar">
        <div>
          <label className="field-label">Brand</label>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <p className="muted small">
          Edits here change what the AI retrieves — no code or SQL needed.
        </p>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="kb-grid">
        <div className="kb-list">
          <div className="section-title">
            {loading ? 'Loading…' : `${entries.length} entries`}
          </div>
          {entries.map((e) => (
            <div key={e.id} className={`kb-card ${form.id === e.id ? 'active' : ''}`}>
              <div className="kb-card-head">
                <span className="cat">{e.category}</span>
                <span className={`dot ${e.has_embedding ? 'on' : 'off'}`} title={e.has_embedding ? 'Embedded' : 'No embedding (keyword only)'} />
              </div>
              <strong>{e.title}</strong>
              <p>{e.content}</p>
              <div className="kb-card-actions">
                <button
                  onClick={() =>
                    setForm({ id: e.id, category: e.category, title: e.title, content: e.content })
                  }
                >
                  Edit
                </button>
                {confirmDelete === e.id ? (
                  <span className="confirm">
                    Sure?
                    <button className="danger" onClick={() => handleDelete(e.id)}>
                      Delete
                    </button>
                    <button onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </span>
                ) : (
                  <button className="danger-ghost" onClick={() => setConfirmDelete(e.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {!loading && entries.length === 0 && <p className="muted">No entries yet.</p>}
        </div>

        <div className="kb-form">
          <div className="section-title">{form.id ? 'Edit entry' : 'New entry'}</div>
          <label className="field-label">Category</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="field-label">Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Damaged Product Refund"
          />

          <label className="field-label">Content</label>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={5}
            placeholder="The policy text the AI may use…"
          />

          <div className="kb-form-actions">
            {form.id && (
              <button onClick={() => setForm(EMPTY)} disabled={saving}>
                Cancel
              </button>
            )}
            <button className="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : form.id ? 'Update entry' : 'Create entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
