import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  PlusCircle,
  LayoutDashboard,
  History,
  LogOut,
  Search,
  Users,
  CreditCard,
  Lock,
  Menu,
  X,
  Sparkles,
  ChevronDown
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

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const getInitials = (email) => {
    if (!email) return 'U';
    const namePart = email.split('@')[0];
    return namePart.slice(0, 2).toUpperCase();
  };

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/history', label: 'History', icon: History },
    { to: '/workspace', label: 'Team', icon: Users },
    { to: '/billing', label: 'Billing', icon: CreditCard },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/70 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            
            {/* Left: Brand Logo */}
            <div className="flex items-center gap-6">
              <Link to="/dashboard" className="flex items-center gap-3 group shrink-0">
                <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-brand-600 to-indigo-700 shadow-md shadow-indigo-500/20 ring-1 ring-white/15 group-hover:scale-105 transition-all duration-200">
                  <ShieldCheck className="w-5 h-5 text-white" />
                  <div className="absolute inset-0 rounded-xl bg-indigo-400/20 blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-bold tracking-tight text-white font-sans">
                      ETRAI
                    </span>
                    <span className="px-1.5 py-0.2 text-[9px] font-semibold tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded uppercase">
                      PRO
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                    Verification Engine
                  </span>
                </div>
              </Link>

              {/* Desktop Command Bar Trigger */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all text-xs w-64 shadow-sm group"
              >
                <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                <span className="flex-1 text-left truncate text-slate-400">Search claims, reports...</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800/80 border border-slate-700/80 rounded text-slate-400 group-hover:text-slate-300">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Middle / Nav items */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? 'bg-slate-800/80 text-indigo-300 border border-slate-700/80 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right: Actions & User Menu */}
            <div className="flex items-center gap-2.5">
              {/* Primary Call to Action */}
              <Link
                to="/analysis"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 to-brand-600 hover:from-indigo-500 hover:to-brand-500 text-white shadow-sm shadow-indigo-600/30 ring-1 ring-white/20 transition-all hover:scale-[1.02]"
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">New Analysis</span>
              </Link>

              {/* Mobile Search Button */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-2 lg:hidden rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
                title="Search"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* User Dropdown / Authenticated State */}
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-800 transition-all focus:outline-none"
                  >
                    <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-900 to-slate-800 border border-indigo-500/30 text-indigo-200 text-xs font-semibold shadow-inner">
                      {getInitials(user.email)}
                      <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-950"></span>
                    </div>
                    <div className="hidden xl:flex flex-col text-left">
                      <span className="text-xs font-medium text-slate-200 max-w-[120px] truncate leading-tight">
                        {user.email}
                      </span>
                      <span className="text-[10px] text-slate-400 leading-tight">
                        Account Active
                      </span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                  </button>

                  {/* Dropdown Menu */}
                  {isUserMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsUserMenuOpen(false)}
                      ></div>
                      <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-1.5 z-50 text-xs animate-in fade-in-50 zoom-in-95">
                        <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                          <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Signed In</p>
                          <p className="text-xs font-medium text-slate-200 truncate mt-0.5">{user.email}</p>
                        </div>

                        <Link
                          to="/security"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-indigo-600/15 hover:border-indigo-500/20 transition-colors"
                        >
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Account & Security</span>
                        </Link>

                        <Link
                          to="/workspace"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-indigo-600/15 hover:border-indigo-500/20 transition-colors"
                        >
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>Team & Permissions</span>
                        </Link>

                        <Link
                          to="/billing"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-indigo-600/15 hover:border-indigo-500/20 transition-colors"
                        >
                          <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                          <span>Billing & Plan</span>
                        </Link>

                        <div className="h-px bg-slate-800 my-1"></div>

                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="text-xs font-semibold px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700/60"
                >
                  Sign In
                </Link>
              )}

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 md:hidden rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-xl px-4 pt-2 pb-4 space-y-1 animate-in slide-in-from-top-2">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
