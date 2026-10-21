import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/campaigns', label: 'Campaigns', icon: '🎯' },
  { to: '/prospects', label: 'Prospects', icon: '👥' },
  { to: '/templates', label: 'Templates', icon: '✉️' },
  { to: '/unsubscribed', label: 'Unsubscribed', icon: '🚫' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <span className="font-semibold text-gray-900">Client Scraper</span>
          </div>
          <div className="flex gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`
                }
              >
                <span className="mr-1.5">{l.icon}</span>
                {l.label}
              </NavLink>
            ))}
          </div>
          <button
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).then(() => {
                window.location.href = '/login';
              });
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
