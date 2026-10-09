import { Fragment, useEffect, useState } from 'react';
import { AiLog, getRecentLogs } from '../api';

const STATUS_TONE: Record<string, string> = {
  GENERATED: 'info',
  EDITED: 'info',
  APPROVED: 'ok',
  SENT: 'ok',
  FAILED: 'error'
};

export default function LogsView() {
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    getRecentLogs()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="muted pad">Loading logs…</div>;
  if (logs.length === 0) return <div className="muted pad">No AI activity logged yet.</div>;

  return (
    <div className="logs">
      <div className="section-title">AI &amp; agent action log ({logs.length})</div>
      <table className="logs-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Brand</th>
            <th>Status</th>
            <th>Confidence</th>
            <th>Retrieval</th>
            <th>Customer message</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <Fragment key={l.id}>
              <tr>
                <td className="nowrap">{new Date(l.created_at).toLocaleString()}</td>
                <td>{l.brand_name}</td>
                <td>
                  <span className={`tag ${STATUS_TONE[l.status] || 'info'}`}>{l.status}</span>
                </td>
                <td>{l.confidence || '—'}</td>
                <td>{l.retrieval_method || '—'}</td>
                <td className="truncate">{l.customer_message}</td>
                <td>
                  <button className="link" onClick={() => setOpen(open === l.id ? null : l.id)}>
                    {open === l.id ? 'Hide' : 'Details'}
                  </button>
                </td>
              </tr>
              {open === l.id && (
                <tr className="detail-row">
                  <td colSpan={7}>
                    <div className="log-detail">
                      <Field label="AI generated" value={l.generated_response} />
                      <Field label="Agent edited" value={l.agent_edited_response} />
                      <Field label="Final sent" value={l.final_response} />
                      {l.error && <Field label="Error" value={l.error} tone="error" />}
                      <div className="field">
                        <span className="field-label">Retrieved context</span>
                        <pre>{JSON.stringify(l.retrieved_context, null, 2)}</pre>
                      </div>
                      <div className="muted small">
                        model: {l.model || '—'} · latency: {l.latency_ms ?? '—'}ms
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string | null; tone?: string }) {
  if (!value) return null;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <p className={tone === 'error' ? 'error-text' : ''}>{value}</p>
    </div>
  );
}
