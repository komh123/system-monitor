import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/cpu', label: 'CPU', icon: '🖥️' },
    { path: '/claude-remote', label: 'Remote', icon: '🤖' },
    { path: '/chat', label: 'Chat', icon: '💬' },
    { path: '/usage', label: 'Usage', icon: '📊' },
    { path: '/logs', label: 'Logs', icon: '📋' }
  ];

  const handleLogout = () => {
    if (confirm('Logout?')) {
      localStorage.removeItem('auth_token');
      navigate('/login');
    }
  };

  return (
    <>
      {/* Desktop: Top navigation bar (hidden on mobile) */}
      <nav className="hidden sm:block mb-6 bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="flex gap-2 items-center">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
                location.pathname === item.path
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span className="text-sm">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="ml-auto px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm bg-red-600 hover:bg-red-700 text-white"
            title="Logout"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </nav>

      {/* Mobile: Bottom tab bar (visible only on mobile) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-800 border-t border-slate-700 safe-area-bottom">
        <div className="flex items-stretch">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                location.pathname === item.path
                  ? 'text-blue-400 bg-blue-600/10'
                  : 'text-slate-400 active:bg-slate-700'
              }`}
              style={{ minHeight: '52px' }}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className={`text-[10px] font-medium leading-none ${
                location.pathname === item.path ? 'text-blue-400' : 'text-slate-500'
              }`}>{item.label}</span>
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-slate-400 active:bg-red-600/20 transition-colors btn-inline"
            style={{ minHeight: '52px' }}
          >
            <span className="text-lg leading-none">🚪</span>
            <span className="text-[10px] font-medium leading-none text-slate-500">Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
}

export default Navigation;
