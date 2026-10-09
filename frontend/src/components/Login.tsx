import { useEffect, useState } from 'react';
import { DemoAgent, Principal, getDemoAgents, login, setToken } from '../api';

interface Props {
  onLoggedIn: (p: Principal) => void;
}

export default function Login({ onLoggedIn }: Props) {
  const [agents, setAgents] = useState<DemoAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDemoAgents()
      .then(setAgents)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function pick(agentId: string) {
    setBusy(agentId);
    setError(null);
    try {
      const { token, agent } = await login(agentId);
      setToken(token);
      onLoggedIn(agent);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <h1>CX Reply Assistant</h1>
        <p className="muted">Select a demo agent to sign in.</p>
        <div className="banner info small">
          Demo authentication — no passwords. Each agent carries brand access so you can see
          tenant isolation enforced (try the Acme-only agent against FreshBottle).
        </div>

        {loading && <div className="muted">Loading agents…</div>}
        {error && <div className="banner error">{error}</div>}

        <div className="agent-list">
          {agents.map((a) => (
            <button key={a.id} className="agent-pick" onClick={() => pick(a.id)} disabled={!!busy}>
              <div>
                <strong>{a.name}</strong>
                {a.is_admin && <span className="pill">admin</span>}
                <div className="muted small">{a.email}</div>
              </div>
              <div className="agent-brands">
                {a.brands.length ? a.brands.join(', ') : 'no brands'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
