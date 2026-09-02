import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  Plus,
  PlusCircle,
  Home,
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
import { FEATURE_FLAGS } from '../utils/featureFlags';
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
        const res = await fetch(apiUrl('/api/v1/workspaces/nav-stats'), { headers, credentials: 'include' });
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
    return 'ET';
  };

  const isActive = (path) => location.pathname === path;

  const navLinks = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/news', label: 'Latest News', icon: Radio },
    ...(FEATURE_FLAGS.SHOW_FAKE_NEWS_SECTION ? [{
      to: '/fake-news',
      label: 'Fake News',
      icon: ShieldAlert,
      badge: navStats.fakeNewsCount > 0 ? String(navStats.fakeNewsCount) : null
    }] : []),
    { to: '/history', label: 'History', icon: History }
  ];

  const usagePercent = Math.min(100, Math.round(((navStats.usage.used || 0) / (navStats.usage.limit || 500)) * 100));

  return (
    <>
      {/* Top Bar Header */}
      <header className="sticky top-0 z-40 w-full bg-[#000D59] border-b border-[rgba(240,237,233,0.16)] select-none shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Left: Mobile Toggle + Logo + Main Nav Links */}
            <div className="flex items-center gap-4 lg:gap-8">
              
              {/* Mobile Hamburger Trigger */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden w-11 h-11 inline-flex items-center justify-center rounded-xl text-[#A7B0D4] hover:text-white hover:bg-[rgba(240,237,233,0.10)] transition"
                aria-label="Toggle navigation drawer"
                aria-expanded={isMobileMenuOpen}
                aria-controls="app-mobile-navigation"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* DeepTrust Logo */}
              <Link to="/" className="flex items-center gap-3 group" aria-label="DeepTrust homepage">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0033C4] to-[#D97757] shadow-md shadow-[#0033C4]/30 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-bold tracking-tight text-[#F0EDE9] font-sans leading-none">
                    deep<b className="text-[#E88F6B] font-bold">trust</b>
                  </span>
                  <span className="text-[10px] text-[#E88F6B] font-semibold tracking-wider uppercase leading-none mt-1">
                    AI VERIFICATION
                  </span>
                </div>
              </Link>

              {/* Desktop Nav Links */}
              <nav className="hidden md:flex items-center gap-1.5">
                {navLinks.map((item) => {
                  const active = isActive(item.to);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 relative ${
                        active
                          ? 'bg-[rgba(240,237,233,0.15)] text-white border border-[rgba(240,237,233,0.26)] shadow-sm font-semibold'
                          : 'text-[#A7B0D4] hover:text-white hover:bg-[rgba(240,237,233,0.10)]'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#E88F6B]' : 'text-[#A7B0D4]'}`} />
                      <span>{item.label}</span>
                      
                      {/* Active Count Badge for Low-Trust Items */}
                      {item.badge && (
                        <span className="px-1.5 py-0.2 bg-[#B23F35] text-white rounded-full text-[10px] font-mono font-bold shadow-sm animate-pulse">
                          {item.badge}
                        </span>
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
                className="flex min-w-11 min-h-11 items-center justify-center gap-2 px-2.5 py-1.5 rounded-xl bg-[rgba(240,237,233,0.09)] hover:bg-[rgba(240,237,233,0.14)] border border-[rgba(240,237,233,0.16)] text-[#A7B0D4] hover:text-white transition text-xs"
                title={`Search (${shortcutKey})`}
              >
                <Search className="w-3.5 h-3.5 text-[#A7B0D4]" />
                <span className="hidden lg:inline text-[#A7B0D4] text-xs">Search...</span>
                <kbd className="hidden sm:inline px-1.5 py-0.5 text-[10px] font-mono bg-[#031246] border border-[rgba(240,237,233,0.2)] rounded text-[#A7B0D4]">
                  {shortcutKey}
                </kbd>
              </button>

              {/* Start New Analysis Primary CTA */}
              <Link
                to="/analysis"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0033C4] hover:bg-[#0A45E4] text-white font-semibold text-xs shadow-md shadow-[#0033C4]/30 border border-[rgba(240,237,233,0.28)] transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Analysis</span>
              </Link>

              {/* Upgrade Plan Jewel Button */}
              <Link
                to="/billing"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[rgba(242,196,107,0.14)] hover:bg-[rgba(242,196,107,0.22)] border border-[rgba(242,196,107,0.42)] text-[#F2C46B] text-xs font-semibold shadow-sm hover:shadow-[rgba(242,196,107,0.2)] transition group"
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
                  className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-[#A7B0D4] hover:text-white hover:bg-[rgba(240,237,233,0.10)] transition relative"
                  title="Notifications & Activity"
                >
                  <Bell className="w-4 h-4" />
                  {navStats.notifications.length > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-[#D97757] rounded-full ring-2 ring-[#000D59]" />
                  )}
                </button>

                {/* Notifications Flyout */}
                {isNotifOpen && (
                  <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-white border border-[#CECECE] rounded-2xl shadow-2xl py-3 z-50 animate-scaleUp text-xs text-[#2C4E86]">
                    <div className="flex items-center justify-between px-4 pb-2 border-b border-[#CECECE]">
                      <span className="font-bold text-[#0B5CD5] uppercase font-mono text-[11px]">Recent Activity</span>
                      <span className="text-[10px] text-[#7386A8] font-mono">Live Database</span>
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y divide-[#CECECE]/60 custom-scrollbar">
                      {navStats.notifications.length > 0 ? (
                        navStats.notifications.map((n) => (
                          <div
                            key={n.id}
                            className="p-3 hover:bg-[#F8F8F6] transition flex items-start gap-2.5 cursor-pointer"
                            onClick={() => {
                              setIsNotifOpen(false);
                              if (n.reportId) navigate(`/results/${n.reportId}`);
                            }}
                          >
                            <span className="w-2 h-2 rounded-full bg-[#D97757] mt-1 flex-shrink-0" />
                            <div className="space-y-0.5 min-w-0">
                              <p className="font-bold text-[#0B5CD5] truncate">{n.title}</p>
                              <p className="text-[11px] text-[#7386A8] line-clamp-2">{n.message}</p>
                              <span className="text-[10px] text-[#7386A8] font-mono block">{n.time}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-6 px-4 text-center text-[#7386A8] text-xs">
                          No recent system alerts
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Avatar & Context Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => {
                    setIsUserMenuOpen(!isUserMenuOpen);
                    setIsNotifOpen(false);
                  }}
                  className="min-h-11 flex items-center gap-2 p-1 pl-2 rounded-xl hover:bg-[rgba(240,237,233,0.10)] transition border border-transparent"
                  aria-label="User account menu"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#0033C4] to-[#D97757] flex items-center justify-center text-xs font-bold text-white shadow-sm">
                    {getInitials(user?.fullName, user?.email)}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#A7B0D4]" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-2rem))] bg-white border border-[#CECECE] rounded-2xl shadow-2xl py-2 z-50 animate-scaleUp text-xs">
                    
                    {/* User Profile Header */}
                    <div className="px-4 py-2.5 border-b border-[#CECECE] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0033C4] to-[#D97757] flex items-center justify-center text-xs font-bold text-white">
                        {getInitials(user?.fullName, user?.email)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-[#0B5CD5] block truncate">{user?.fullName || 'Active Analyst'}</span>
                        <span className="text-[11px] text-[#7386A8] block truncate">{user?.email || 'rishiaggarwal7862@gmail.com'}</span>
                      </div>
                    </div>

                    {/* Real Usage Meter Card */}
                    <div className="p-3 m-2 bg-[#F8F8F6] border border-[#CECECE] rounded-xl space-y-1.5">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[#7386A8] uppercase font-mono font-semibold">
                          {navStats.usage.plan} Quota
                        </span>
                        <span className="font-mono text-[#0B5CD5] font-bold">
                          {navStats.usage.used} / {navStats.usage.limit}
                        </span>
                      </div>
                      
                      {/* Proportional Usage Progress Bar */}
                      <div className="w-full h-1.5 bg-[#EFEEE9] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#0033C4] to-[#D97757] transition-all duration-500"
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                      
                      <div className="flex justify-between items-center text-[10px] text-[#7386A8]">
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
                        className="w-full text-left px-4 py-2 text-[#2C4E86] hover:text-[#0B5CD5] hover:bg-[#F8F8F6] flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2"><Search className="w-3.5 h-3.5 text-[#0B5CD5]" /> Search Command</span>
                        <span className="font-mono text-[10px] text-[#7386A8]">{shortcutKey}</span>
                      </button>
                      <Link
                        to="/billing"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-[#2C4E86] hover:text-[#0B5CD5] hover:bg-[#F8F8F6] flex items-center gap-2 block"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-[#D97757]" /> My Subscription
                      </Link>
                      <Link
                        to="/billing"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-[#B98520] hover:bg-[#F8F8F6] flex items-center gap-2 block font-medium"
                      >
                        <Gem className="w-3.5 h-3.5" /> Upgrade Plan
                      </Link>
                      <Link
                        to="/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-[#2C4E86] hover:text-[#0B5CD5] hover:bg-[#F8F8F6] flex items-center gap-2 block"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#D97757]" /> My Account &amp; Beats
                      </Link>
                      <Link
                        to="/workspace"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-[#2C4E86] hover:text-[#0B5CD5] hover:bg-[#F8F8F6] flex items-center gap-2 block"
                      >
                        <Users className="w-3.5 h-3.5 text-[#D97757]" /> My Team &amp; Seats
                      </Link>
                      <Link
                        to="/settings?tab=algo"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-[#2C4E86] hover:text-[#0B5CD5] hover:bg-[#F8F8F6] flex items-center gap-2 block"
                      >
                        <Sliders className="w-3.5 h-3.5 text-[#D97757]" /> Scoring Algorithm
                      </Link>
                    </div>

                    <div className="pt-1 border-t border-[#CECECE]">
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-[#B23F35] hover:bg-[#F7E3E0] flex items-center gap-2 font-semibold"
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
          <div id="app-mobile-navigation" className="md:hidden max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-[rgba(240,237,233,0.16)] bg-[#000D59] px-4 py-4 space-y-2 animate-fadeIn">
            {navLinks.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`min-h-11 flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                    active ? 'bg-[rgba(240,237,233,0.15)] text-white font-bold border border-[rgba(240,237,233,0.26)]' : 'text-[#A7B0D4] hover:text-white'
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

            <div className="pt-2 border-t border-[rgba(240,237,233,0.16)] flex flex-col gap-2">
              <Link
                to="/analysis"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full min-h-11 py-2.5 bg-[#0033C4] hover:bg-[#0A45E4] text-white rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>New Analysis</span>
              </Link>
              <Link
                to="/billing"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full min-h-11 py-2 bg-[rgba(242,196,107,0.14)] border border-[rgba(242,196,107,0.42)] text-[#F2C46B] rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5"
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
