import { useEffect, useState } from 'react';
import {
  Brand,
  Principal,
  getBrands,
  getToken,
  setToken,
  setUnauthorizedHandler
} from './api';
import Workspace from './components/Workspace';
import KnowledgeBase from './components/KnowledgeBase';
import LogsView from './components/LogsView';
import Login from './components/Login';

type Tab = 'workspace' | 'kb' | 'logs';
const PRINCIPAL_KEY = 'cx_principal';

function loadPrincipal(): Principal | null {
  try {
    const raw = localStorage.getItem(PRINCIPAL_KEY);
    return raw ? (JSON.parse(raw) as Principal) : null;
  } catch {
    return null;
  }
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function App() {
  const [tab, setTab] = useState<Tab>('workspace');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [principal, setPrincipal] = useState<Principal | null>(
    getToken() ? loadPrincipal() : null
  );

  function logout() {
    setToken(null);
    try {
      localStorage.removeItem(PRINCIPAL_KEY);
    } catch {
      /* ignore */
    }
    setPrincipal(null);
  }

  function handleLoggedIn(p: Principal) {
    try {
      localStorage.setItem(PRINCIPAL_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
    setPrincipal(p);
  }

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, []);

  useEffect(() => {
    if (principal) getBrands().then(setBrands).catch(console.error);
  }, [principal]);

  if (!principal) {
    return <Login onLoggedIn={handleLoggedIn} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">CX</div>
          <div className="brand-copy">
            <h1>CX Reply Assistant</h1>
            <p>AI copilot for support agents</p>
          </div>
        </div>

        <nav className="tabs" aria-label="Main navigation">
          <button
            className={tab === 'workspace' ? 'active' : ''}
            onClick={() => setTab('workspace')}
            aria-current={tab === 'workspace' ? 'page' : undefined}
          >
            <span className="tab-icon" aria-hidden="true">▦</span>
            <span>Workspace</span>
          </button>
          <button
            className={tab === 'kb' ? 'active' : ''}
            onClick={() => setTab('kb')}
            aria-current={tab === 'kb' ? 'page' : undefined}
          >
            <span className="tab-icon" aria-hidden="true">◇</span>
            <span>Knowledge Base</span>
          </button>
          <button
            className={tab === 'logs' ? 'active' : ''}
            onClick={() => setTab('logs')}
            aria-current={tab === 'logs' ? 'page' : undefined}
          >
            <span className="tab-icon" aria-hidden="true">≋</span>
            <span>Logs</span>
          </button>
        </nav>

        <div className="session">
          <span className="session-avatar" aria-hidden="true">{initials(principal.name)}</span>
          <span className="who">
            <span className="who-name">{principal.name}</span>
            {principal.isAdmin && <span className="pill">admin</span>}
          </span>
          <button className="link signout" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className={`main main-${tab}`}>
        {tab === 'workspace' && <Workspace />}
        {tab === 'kb' && <KnowledgeBase brands={brands} />}
        {tab === 'logs' && <LogsView />}
      </main>
    </div>
  );
}
