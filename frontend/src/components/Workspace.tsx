import { useEffect, useState } from 'react';
import {
  ConversationSummary,
  Conversation,
  getConversations,
  getConversation,
  sendMessage
} from '../api';
import AssistantPanel from './AssistantPanel';

export default function Workspace() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [sender, setSender] = useState<'CUSTOMER' | 'AGENT'>('CUSTOMER');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadConversations(selectFirst = true) {
    setLoading(true);
    try {
      const data = await getConversations();
      setConversations(data);
      if (selectFirst && !selected && data[0]) {
        setSelected(await getConversation(data[0].id));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSelected() {
    if (selected) setSelected(await getConversation(selected.id));
  }

  async function selectConversation(id: string) {
    setError(null);
    setSelected(await getConversation(id));
  }

  async function handleSend() {
    if (!selected || !message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(selected.id, sender, message.trim());
      setMessage('');
      await refreshSelected();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadConversations().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="section-title">Conversations</div>
        {loading && <div className="muted">Loading…</div>}
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`conversation-card ${selected?.id === c.id ? 'active' : ''}`}
            onClick={() => selectConversation(c.id)}
          >
            <strong>{c.customer_name}</strong>
            <span>{c.brand_name}</span>
            <small>{c.order_id}</small>
          </button>
        ))}
      </aside>

      <section className="conversation">
        {selected ? (
          <>
            <div className="conversation-header">
              <div>
                <h2>{selected.customer_name}</h2>
                <p>
                  {selected.brand_name} · Order {selected.order_id} ·{' '}
                  <span className="muted">{selected.customer_email}</span>
                </p>
              </div>
              <span className="badge">{selected.status}</span>
            </div>

            <div className="messages">
              {selected.messages.map((m) => (
                <div className={`message-row ${m.sender_type.toLowerCase()}`} key={m.id}>
                  <div className="message">
                    <small>
                      {m.sender_type} · {new Date(m.created_at).toLocaleTimeString()}
                    </small>
                    <p>{m.content}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="composer">
              <div className="composer-top">
                <div className="toggle">
                  <button
                    className={sender === 'CUSTOMER' ? 'selected' : ''}
                    onClick={() => setSender('CUSTOMER')}
                  >
                    Customer
                  </button>
                  <button
                    className={sender === 'AGENT' ? 'selected' : ''}
                    onClick={() => setSender('AGENT')}
                  >
                    Agent
                  </button>
                </div>
                <span className="sim-note">Simulated send · stays in-app</span>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Type a message as ${sender.toLowerCase()}…`}
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
                }}
              />

              {error && <div className="banner error">{error}</div>}

              <button className="send primary" onClick={handleSend} disabled={sending || !message.trim()}>
                {sending ? 'Sending…' : `Send as ${sender === 'CUSTOMER' ? 'Customer' : 'Agent'}`}
              </button>
            </div>
          </>
        ) : (
          <div className="empty">Select a conversation.</div>
        )}
      </section>

      {selected && <AssistantPanel conversation={selected} onSent={refreshSelected} />}
    </div>
  );
}
