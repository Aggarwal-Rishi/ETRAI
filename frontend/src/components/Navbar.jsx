import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  Plus,
  LayoutDashboard,
  Radio,
  ShieldAlert,
  History,
  Users,
  CreditCard,
  Settings,
  Lock,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
  Gem,
  Check,
  Sparkles,
  Sliders,
  ExternalLink,
  Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import GlobalSearchModal from './GlobalSearchModal';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Platform detection for Mac (⌘K) vs Windows/Linux (Ctrl+K)
  const isMac = typeof window !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator?.userAgent || '');
  const shortcutKey = isMac ? '⌘K' : 'Ctrl+K';

  // Real Nav Telemetry from Backend
  const [navStats, setNavStats] = useState({
    fakeNewsCount: 0,
    usage: {
      used: 0,
      limit: 500,
      plan: 'Team',
      resetDate: '1 Sep'
    },
    notifications: []
  });

  const userMenuRef = useRef(null);
  const notifMenuRef = useRef(null);

  // Fetch real nav stats on mount
  useEffect(() => {
    let isMounted = true;
    async function loadNavStats() {
      try {
        const token = localStorage.getItem('etrai_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(apiUrl('/api/v1/workspaces/nav-stats'), { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setNavStats({
              fakeNewsCount: data.fakeNewsCount ?? 0,
              usage: data.usage || { used: 0, limit: 500, plan: 'Team', resetDate: '1 Sep' },
              notifications: data.notifications || []
            });
          }
        }
      } catch (err) {
        // Fallback gracefully
      }
    }
    loadNavStats();
    return () => { isMounted = false; };
  }, [location.pathname]);

  // Global Shortcut listener (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const getInitials = (fullName, email) => {
    if (fullName) {
      const parts = fullName.trim().split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return fullName.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.split('@')[0].slice(0, 2).toUpperCase();
    }
    return 'DT';
  };

  const isActive = (path) => location.pathname === path;

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/news', label: 'Latest News', icon: Radio },
    {
      to: '/fake-news',
      label: 'Fake News',
      icon: ShieldAlert,
      badge: navStats.fakeNewsCount > 0 ? String(navStats.fakeNewsCount) : null
    },
    { to: '/history', label: 'History', icon: History }
  ];

  const usagePercent = Math.min(100, Math.round(((navStats.usage.used || 0) / (navStats.usage.limit || 500)) * 100));

  return (
    <>
      {/* Top Bar Header */}
      <header className="sticky top-0 z-40 w-full bg-[#000D59] border-b border-[#F0EDE9]/15 shadow-xl select-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            
            {/* Left: Mobile Toggle + Logo + Main Nav Links */}
            <div className="flex items-center gap-4 lg:gap-8">
              
              {/* Mobile Hamburger Trigger */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
                aria-label="Toggle navigation drawer"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Glowing Terracotta Shield Logo */}
              <Link to="/dashboard" className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#D97757] via-indigo-600 to-[#B0512F] p-0.5 shadow-lg shadow-[#D97757]/20 group-hover:scale-105 transition-transform flex items-center justify-center">
                  <div className="w-full h-full bg-[#000D59] rounded-[10px] flex items-center justify-center">
                    <ShieldCheck className="w-4.5 h-4.5 text-[#E88F6B] group-hover:text-[#F2C46B] transition-colors" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-bold tracking-tight text-white font-sans flex items-center gap-1.5">
                    ETRAI
                    <span className="text-[9px] px-1.5 py-0.2 bg-[#E88F6B]/20 text-[#E88F6B] border border-[#E88F6B]/30 rounded font-mono font-bold uppercase hidden sm:inline">
                      DeepTrust
                    </span>
                  </span>
                </div>
              </Link>

              {/* Desktop Nav Links */}
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.map((item) => {
                  const active = isActive(item.to);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 relative ${
                        active
                          ? 'bg-white/15 text-white font-semibold shadow-sm'
                          : 'text-[#A7B0D4] hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                      
                      {/* Active Count Badge for Low-Trust Items */}
                      {item.badge && (
                        <span className="px-1.5 py-0.2 bg-[#B23F35] text-white rounded-full text-[10px] font-mono font-bold shadow-sm animate-pulse">
                          {item.badge}
                        </span>
                      )}

                      {/* Active Accent Underline */}
                      {active && (
                        <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#E88F6B] rounded-full" />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right: Search + Action Buttons + Notifications + Avatar */}
            <div className="flex items-center gap-2 sm:gap-3">
              
              {/* Search Command Palette Trigger */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-300 hover:text-white transition text-xs"
                title={`Search (${shortcutKey})`}
              >
                <Search className="w-3.5 h-3.5 text-[#A7B0D4]" />
                <span className="hidden lg:inline text-slate-300 text-xs">Search...</span>
                <kbd className="hidden sm:inline px-1.5 py-0.5 text-[10px] font-mono bg-black/40 border border-white/20 rounded text-[#A7B0D4]">
                  {shortcutKey}
                </kbd>
              </button>

              {/* Generate DeepTrust Primary CTA (Clay) */}
              <Link
                to="/analysis"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#D97757] hover:bg-[#B0512F] text-white font-semibold text-xs shadow-md shadow-[#D97757]/20 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Generate DeepTrust</span>
              </Link>

              {/* Upgrade Plan Jewel Button (Gold Accent Glow) */}
              <Link
                to="/billing"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-[#F2C46B]/40 text-[#F2C46B] text-xs font-semibold shadow-sm hover:shadow-[#F2C46B]/20 transition group"
                title="Upgrade Plan & Quota"
              >
                <Gem className="w-3.5 h-3.5 text-[#F2C46B] group-hover:scale-110 transition-transform" />
                <span>Upgrade</span>
              </Link>

              {/* Notification Bell Dropdown */}
              <div className="relative" ref={notifMenuRef}>
                <button
                  onClick={() => {
                    setIsNotifOpen(!isNotifOpen);
                    setIsUserMenuOpen(false);
                  }}
                  className="p-2 rounded-xl text-[#A7B0D4] hover:text-white hover:bg-white/10 transition relative"
                  title="Notifications & Activity"
                >
                  <Bell className="w-4 h-4" />
                  {navStats.notifications.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#E88F6B] rounded-full ring-2 ring-[#000D59]" />
                  )}
                </button>

                {/* Notifications Flyout */}
                {isNotifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-3 z-50 animate-scaleUp text-xs text-slate-200">
                    <div className="flex items-center justify-between px-4 pb-2 border-b border-slate-800">
                      <span className="font-bold text-white uppercase font-mono text-[11px]">Recent Activity</span>
                      <span className="text-[10px] text-slate-400 font-mono">Live Database</span>
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60 custom-scrollbar">
                      {navStats.notifications.length > 0 ? (
                        navStats.notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              setIsNotifOpen(false);
                              if (n.link) navigate(n.link);
                            }}
                            className="p-3 hover:bg-slate-850 cursor-pointer transition space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white text-xs">{n.title}</span>
                              {n.score !== undefined && (
                                <span className="font-mono text-[10px] font-bold text-indigo-400">
                                  {n.score}/100
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 line-clamp-2">{n.message}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-slate-500 text-xs">
                          No recent system alerts.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Account Avatar with Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => {
                    setIsUserMenuOpen(!isUserMenuOpen);
                    setIsNotifOpen(false);
                  }}
                  className="flex items-center gap-1.5 p-1 rounded-full hover:bg-white/10 border border-transparent hover:border-white/20 transition"
                  aria-label="User profile menu"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#D97757] to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shadow-sm ring-1 ring-white/20">
                    {getInitials(user?.fullName, user?.email)}
                  </div>
                  <ChevronDown className="w-3 h-3 text-[#A7B0D4]" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 animate-scaleUp text-xs">
                    
                    {/* User Profile Header */}
                    <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#D97757] to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                        {getInitials(user?.fullName, user?.email)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-white block truncate">{user?.fullName || 'Active Workspace'}</span>
                        <span className="text-[11px] text-slate-400 block truncate">{user?.email}</span>
                      </div>
                    </div>

                    {/* Real Usage Meter Card */}
                    <div className="p-3 m-2 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400 uppercase font-mono font-semibold">
                          {navStats.usage.plan} Quota
                        </span>
                        <span className="font-mono text-[#E88F6B] font-bold">
                          {navStats.usage.used} / {navStats.usage.limit}
                        </span>
                      </div>
                      
                      {/* Proportional Usage Progress Bar */}
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-[#D97757] transition-all duration-500"
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                      
                      <div className="flex justify-between items-center text-[10px] text-slate-500">
                        <span>{usagePercent}% utilized</span>
                        <span>Resets {navStats.usage.resetDate}</span>
                      </div>
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
                        <span className="flex items-center gap-2"><Search className="w-3.5 h-3.5 text-[#A7B0D4]" /> Search Command</span>
                        <span className="font-mono text-[10px] text-slate-500">{shortcutKey}</span>
                      </button>
                      <Link
                        to="/billing"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center gap-2 block"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-indigo-400" /> My Subscription
                      </Link>
                      <Link
                        to="/billing"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-[#F2C46B] hover:bg-slate-850 flex items-center gap-2 block font-medium"
                      >
                        <Gem className="w-3.5 h-3.5" /> Upgrade Plan
                      </Link>
                      <Link
                        to="/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center gap-2 block"
                      >
                        <Settings className="w-3.5 h-3.5 text-indigo-400" /> My Account & Beats
                      </Link>
                      <Link
                        to="/workspace"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center gap-2 block"
                      >
                        <Users className="w-3.5 h-3.5 text-indigo-400" /> My Team & Seats
                      </Link>
                      <Link
                        to="/settings?tab=algo"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-850 flex items-center gap-2 block"
                      >
                        <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Scoring Algorithm
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
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#000D59] px-4 py-4 space-y-2 animate-slideDown">
            {navLinks.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium ${
                    active ? 'bg-white/15 text-white font-bold' : 'text-[#A7B0D4] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 bg-[#B23F35] text-white rounded-full text-[10px] font-mono font-bold">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
              <Link
                to="/analysis"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full py-2.5 bg-[#D97757] hover:bg-[#B0512F] text-white rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Generate DeepTrust</span>
              </Link>
              <Link
                to="/billing"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full py-2 bg-white/10 border border-[#F2C46B]/40 text-[#F2C46B] rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5"
              >
                <Gem className="w-3.5 h-3.5" />
                <span>Upgrade Plan</span>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Global Command Palette Search Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
