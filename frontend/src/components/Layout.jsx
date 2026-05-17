import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const links = [
    { to: '/dashboard', label: 'Dashboard',     icon: '📊' },
    { to: '/patients',  label: 'Patients',      icon: '👥' },
    { to: '/patients/new', label: 'New Patient', icon: '➕' },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">N+</div>
          <span>NovaMed AI</span>
        </div>

        {links.map(l => (
          <NavLink key={l.to} to={l.to} end={l.to === '/dashboard'} className={({isActive}) => 'nav-link' + (isActive ? ' active' : '')}>
            <span style={{ fontSize: 16 }}>{l.icon}</span>
            <span>{l.label}</span>
          </NavLink>
        ))}

        <div className="spacer" />

        <div className="user-card">
          <div className="who">{user?.full_name || 'User'}</div>
          <div className="role">{user?.role} · {user?.specialty || '—'}</div>
          <button className="logout" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
