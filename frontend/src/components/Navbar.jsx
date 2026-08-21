import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  Plus,
  LayoutDashboard,
  History,
  Users,
  CreditCard,
  Lock,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Radio,
  ShieldAlert,
  Sparkles,
  Sliders,
  Gem,
  Bell
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import GlobalSearchModal from './GlobalSearchModal';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [notificationToast, setNotificationToast] = useState(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const getInitials = (email) => {
    if (!email) return 'GS';
    const namePart = email.split('@')[0];
    return namePart.slice(0, 2).toUpperCase();
  };

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/news', label: 'Latest News', icon: Radio },
    { to: '/fake-news', label: 'Fake News', icon: ShieldAlert, badge: '14' },
    { to: '/history', label: 'History', icon: History },
    { to: '/workspace', label: 'My Team', icon: Users }
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            
            {/* Left: Brand Logo + Nav Links */}
            <div className="flex items-center gap-6">
              <Link to="/dashboard" className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/30 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-4.5 h-4.5 text-white" />
                </div>
                <span className="text-base font-bold tracking-tight text-white font-sans">
                  ETRAI
                </span>
              </Link>

              {/* Desktop Nav Links */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const active = isActive(item.to);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 ${
                        active
                          ? 'bg-slate-800 text-white shadow-sm font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                      {item.badge && (
                        <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-mono font-bold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right: Search + Quick CTAs + Profile Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Search Bar Button */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-300 transition-all text-xs"
                title="Search (⌘K)"
              >
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline text-slate-400">Search reports, claims…</span>
                <kbd className="hidden sm:inline px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 border border-slate-700 rounded text-slate-400">
                  ⌘K
                </kbd>
              </button>

              {/* Generate CTA */}
              <Link
                to="/analysis"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Analysis</span>
              </Link>

              {/* Upgrade Jewel Icon */}
              <Link
                to="/billing"
                className="p-2 rounded-xl text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition"
                title="Upgrade Plan"
              >
                <Gem className="w-4 h-4" />
              </Link>

              {/* Notification Bell */}
              <button
                onClick={() => {
                  setNotificationToast(true);
                  setTimeout(() => setNotificationToast(false), 3000);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition relative"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />
              </button>

              {/* User Avatar Menu Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center text-[11px] font-bold text-white shadow-sm">
                    {getInitials(user?.email)}
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 animate-scaleUp text-xs">
                    {/* Quota Usage Meter */}
                    <div className="px-4 py-2.5 border-b border-slate-800">
                      <div className="flex justify-between items-center mb-1 text-[11px]">
                        <span className="text-slate-400 uppercase font-mono">Verifications</span>
                        <span className="font-mono text-indigo-400 font-bold">310 / 500</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1">
                        <div className="w-[62%] h-full bg-gradient-to-r from-indigo-500 to-cyan-400" />
                      </div>
                      <span className="text-[10px] text-slate-500">Team plan · resets 1 Sep</span>
                    </div>

                    {/* Menu Actions */}
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsSearchOpen(true);
                        }}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2"><Search className="w-3.5 h-3.5" /> Search</span>
                        <span className="font-mono text-[10px] text-slate-500">⌘K</span>
                      </button>
                      <Link
                        to="/billing"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center gap-2 block"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-indigo-400" /> My Subscription
                      </Link>
                      <Link
                        to="/workspace"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center gap-2 block"
                      >
                        <Users className="w-3.5 h-3.5 text-indigo-400" /> My Team
                      </Link>
                      <Link
                        to="/settings?tab=algo"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center gap-2 block"
                      >
                        <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Scoring Algorithm
                      </Link>
                      <Link
                        to="/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center gap-2 block"
                      >
                        <Lock className="w-3.5 h-3.5 text-indigo-400" /> Account & Security
                      </Link>
                    </div>

                    <div className="pt-1 border-t border-slate-800">
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile menu trigger */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-slate-800 bg-slate-950 px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium ${
                    active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-mono">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Global Notification Toast */}
      {notificationToast && (
        <div className="fixed top-16 right-6 z-50 p-4 bg-slate-900 border border-slate-700 text-white text-xs rounded-2xl shadow-2xl flex items-center gap-3 animate-slideDown">
          <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span>3 new source-ranking updates active on your followed beats</span>
        </div>
      )}

      {/* Global Search Modal (⌘K) */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
