import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/cpu', label: 'CPU Monitor', icon: '🖥️' },
    { path: '/claude-remote', label: 'Claude Remote', icon: '🤖' },
    { path: '/logs', label: 'Recovery Logs', icon: '📋' },
    { path: '/chat', label: 'Chat', icon: '💬' },
    { path: '/usage', label: 'Usage', icon: '📊' }
  ];

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  return (
    <nav className="mb-4 sm:mb-6 bg-slate-800 rounded-lg p-2 sm:p-4 border border-slate-700">
      <div className="flex gap-1 sm:gap-2 items-center">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex-1 sm:flex-none px-2 sm:px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 text-xs sm:text-sm ${
              location.pathname === item.path
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <span className="text-base sm:text-sm">{item.icon}</span>
            <span className="hidden xs:inline sm:inline text-xs sm:text-sm">{item.label}</span>
          </Link>
        ))}
        <button
          onClick={handleLogout}
          className="ml-auto px-2 sm:px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white"
          title="Logout"
        >
          <span className="text-base sm:text-sm">🚪</span>
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </nav>
  );
}

export default Navigation;
