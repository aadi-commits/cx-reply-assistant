import { useEffect, useState } from 'react';
import {
  generateReply,
  updateLog,
  sendAiReply,
  GenerateResult,
  Conversation
} from '../api';

interface Props {
  conversation: Conversation;
  onSent: () => void;
}

type Phase = 'idle' | 'generating' | 'draft' | 'sending';

const CONFIDENCE_LABEL: Record<string, { label: string; tone: string }> = {
  answered: { label: 'Answered from policy', tone: 'ok' },
  insufficient: { label: 'Insufficient policy — review needed', tone: 'warn' },
  no_knowledge: { label: 'No relevant policy found — review needed', tone: 'warn' }
};

export default function AssistantPanel({ conversation, onSent }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [draft, setDraft] = useState('');
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when switching conversations.
  useEffect(() => {
    setPhase('idle');
    setResult(null);
    setDraft('');
    setApproved(false);
    setError(null);
  }, [conversation.id]);

  async function handleGenerate() {
    setPhase('generating');
    setError(null);
    setApproved(false);
    try {
      const res = await generateReply(conversation.id);
      setResult(res);
      setDraft(res.reply);
      setPhase('draft');
    } catch (err) {
      setError((err as Error).message);
      setPhase('idle');
    }
  }

  async function handleApprove() {
    if (!result) return;
    try {
      await updateLog(result.logId, { agentEditedResponse: draft, status: 'APPROVED' });
      setApproved(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSend() {
    if (!result || !draft.trim()) return;
    setPhase('sending');
    setError(null);
    try {
      // Persist the latest edit, then send (idempotent on the server).
      await updateLog(result.logId, { agentEditedResponse: draft });
      await sendAiReply(result.logId, draft.trim());
      setResult(null);
      setDraft('');
      setApproved(false);
      setPhase('idle');
      onSent();
    } catch (err) {
      setError((err as Error).message);
      setPhase('draft');
    }
  }

  const conf = result ? CONFIDENCE_LABEL[result.confidence] : null;

  return (
    <aside className="assistant">
      <div className="assistant-header">
        <h2>AI Assistant</h2>
        {result && (
          <span className="muted small">
            {result.model}
            {result.devFallback ? ' · dev mode' : ''}
          </span>
        )}
      </div>

      {phase === 'idle' && !result && (
        <div className="assistant-empty">
          <div className="robot">AI</div>
          <h3>Generate a reply</h3>
          <p>Retrieves this brand's policies, then drafts a grounded response for you to review.</p>
          <button className="primary" onClick={handleGenerate}>
            Generate Reply
          </button>
          {error && <div className="banner error">{error}</div>}
        </div>
      )}

      {phase === 'generating' && (
        <div className="assistant-empty">
          <div className="spinner" />
          <p className="muted">Retrieving policies and drafting…</p>
        </div>
      )}

      {result && (phase === 'draft' || phase === 'sending') && (
        <div className="assistant-body">
          {conf && (
            <div className={`banner ${conf.tone}`}>
              <strong>{conf.label}</strong>
              {result.needsHumanReview && (
                <p className="small">
                  The assistant could not fully ground this answer in policy. Verify before sending.
                </p>
              )}
            </div>
          )}

          {result.devFallback && (
            <div className="banner info small">
              Dev mode: no LLM key configured — this is a deterministic placeholder draft.
            </div>
          )}

          <label className="field-label">Suggested reply (editable)</label>
          <textarea
            className="draft"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setApproved(false);
            }}
            rows={6}
          />

          <div className="assistant-actions">
            <button onClick={handleGenerate} disabled={phase === 'sending'} title="Discard and regenerate">
              Regenerate
            </button>
            <button onClick={handleApprove} disabled={phase === 'sending' || approved}>
              {approved ? 'Approved ✓' : 'Approve'}
            </button>
            <button className="primary" onClick={handleSend} disabled={phase === 'sending' || !draft.trim()}>
              {phase === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </div>

          {error && <div className="banner error">{error}</div>}

          <div className="retrieved">
            <div className="retrieved-head">
              <span>Retrieved context</span>
              <span className="pill">{result.retrieval.method}</span>
            </div>
            {result.retrieval.entries.length === 0 && (
              <p className="muted small">No policies matched this question.</p>
            )}
            {result.retrieval.entries.map((e) => (
              <div key={e.id} className={`retrieved-item ${e.relevant ? '' : 'dim'}`}>
                <div className="retrieved-item-head">
                  <span className="cat">{e.category}</span>
                  <span className="score">{(e.score * 100).toFixed(0)}%</span>
                </div>
                <strong>{e.title}</strong>
                <p>{e.content}</p>
                {!e.relevant && <span className="small muted">below relevance threshold</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
