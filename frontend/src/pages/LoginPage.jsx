import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import VerdictBadge from '../components/VerdictBadge';
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  Phone,
  Building,
  Globe,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  HelpCircle,
  X
} from 'lucide-react';

export default function LoginPage({ defaultTab = 'login' }) {
  const [activeTab, setActiveTab] = useState(defaultTab); // 'login' | 'signup'
  const { login, signup, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  // Sync tab with route if accessed via /signup
  useEffect(() => {
    if (location.pathname === '/signup') {
      setActiveTab('signup');
    } else if (location.pathname === '/login') {
      setActiveTab('login');
    }
  }, [location.pathname]);

  // Ticker state (Real backend data)
  const [tickerItems, setTickerItems] = useState([]);
  const [tickerLoading, setTickerLoading] = useState(true);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Signup wizard state (Step 1, 2, 3)
  const [signupStep, setSignupStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  
  // OTP state (Step 2)
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const otpInputRefs = useRef([]);
  const [otpError, setOtpError] = useState(null);

  // Workspace setup state (Step 3)
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [primaryBeat, setPrimaryBeat] = useState('Policy & Governance');
  const [regionFocus, setRegionFocus] = useState('India');
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState(null);

  // Fetch real ticker items from database
  useEffect(() => {
    let isMounted = true;
    async function loadTicker() {
      try {
        const res = await fetch(apiUrl('/api/v1/reports/public/recent-ticker'));
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.items) {
            setTickerItems(data.items);
          }
        }
      } catch (err) {
        // Ticker falls back gracefully to empty state
      } finally {
        if (isMounted) setTickerLoading(false);
      }
    }
    loadTicker();
    return () => { isMounted = false; };
  }, []);

  // Handle Login Submit
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      await login(loginEmail, loginPassword, keepSignedIn);
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      setLoginError(err.message || 'Invalid email or password.');
    } finally {
      setLoginLoading(false);
    }
  };

  // OTP Input handlers (Step 2)
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    const newOtp = [...otpValues];
    newOtp[index] = value;
    setOtpValues(newOtp);

    // Auto-advance
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim().slice(0, 6);
    if (/^\d+$/.test(pasteData)) {
      const newOtp = pasteData.split('').concat(Array(6).fill('')).slice(0, 6);
      setOtpValues(newOtp);
      otpInputRefs.current[Math.min(pasteData.length, 5)]?.focus();
    }
  };

  // Step 1 Validation -> Step 2
  const handleStep1Next = (e) => {
    e.preventDefault();
    setSignupError(null);
    if (!signupEmail.trim() || !signupPassword) {
      setSignupError('Work email and password are required.');
      return;
    }
    if (signupPassword.length < 6) {
      setSignupError('Password must be at least 6 characters.');
      return;
    }
    setSignupStep(2);
  };

  // Step 2 Validation -> Step 3
  const handleStep2Next = () => {
    const fullOtp = otpValues.join('');
    if (fullOtp.length < 6) {
      setOtpError('Please enter all 6 digits of the verification code.');
      return;
    }
    setOtpError(null);
    setSignupStep(3);
  };

  // Step 3 Submit -> Final Signup API
  const handleStep3Submit = async (e) => {
    e.preventDefault();
    setSignupError(null);
    setSignupLoading(true);

    try {
      await signup({
        email: signupEmail,
        password: signupPassword,
        fullName,
        phone,
        company
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setSignupError(err.message || 'Failed to complete registration.');
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row text-slate-100 font-sans">
      
      {/* ========================================================================= */}
      {/* LEFT PANEL — BRAND ART & LIVE TRUST TICKER                                */}
      {/* ========================================================================= */}
      <div className="hidden md:flex md:order-1 w-full md:w-5/12 lg:w-1/2 bg-[#000D59] p-8 sm:p-12 lg:p-16 flex-col justify-between relative overflow-hidden border-b md:border-b-0 md:border-r border-slate-800">
        
        {/* Background Ambient Glows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#D97757]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Logo & Statement */}
        <div className="relative z-10 space-y-6">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-[#D97757] flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-white font-sans">DeepTrust</span>
              <span className="text-[10px] font-mono tracking-widest text-[#E88F6B] uppercase font-semibold">AI Verification OS</span>
            </div>
          </Link>

          <div className="space-y-3 pt-4">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight">
              Every claim leaves a trail. <br />
              <span className="text-[#E88F6B]">We follow it, then show you the map.</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
              Multi-agent fact-checking, spectral video forensics, and verified source provenance calibrated for serious newsrooms and intelligence desks.
            </p>
          </div>
        </div>

        {/* Live Trust Ticker Widget */}
        <div className="relative z-10 my-8 p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-2xl space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="w-2 h-2 rounded-full bg-emerald-500 -ml-4" />
              <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                Verified in the Last Hour
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Live Database Sync</span>
          </div>

          {/* Real Analyses List */}
          <div className="space-y-2.5 max-h-56 overflow-y-auto custom-scrollbar">
            {tickerLoading ? (
              <div className="py-6 text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-2">
                <Clock className="w-3.5 h-3.5 animate-spin text-[#E88F6B]" />
                <span>Checking live verification ledger...</span>
              </div>
            ) : tickerItems.length > 0 ? (
              tickerItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-950/80 border border-slate-800/60 rounded-xl space-y-1.5 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200 truncate flex-1" title={item.title}>
                      {item.title}
                    </span>
                    <VerdictBadge status={item.verdict} size="sm" />
                  </div>
                  
                  {/* Proportional Progress Bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          item.trustScore >= 75 ? 'bg-emerald-400' :
                          item.trustScore >= 40 ? 'bg-amber-400' : 'bg-rose-500'
                        }`}
                        style={{ width: `${item.trustScore}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 font-bold">
                      {item.trustScore}/100
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 px-4 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-xs text-slate-400">
                <Sparkles className="w-5 h-5 text-indigo-400 mx-auto mb-1.5" />
                <p className="font-medium text-slate-300">Live verification activity will appear here</p>
                <p className="text-[11px] text-slate-500 mt-0.5">As new claims and media assets are analyzed in your workspace.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-[11px] font-mono text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-4">
          <span>DeepTrust Platform · Neon DB</span>
          <span className="text-[#E88F6B]">SOC-2 & Cryptographic Audit Trails</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT PANEL — AUTH BOX (LOGIN / 3-STEP SIGNUP WIZARD)                     */}
      {/* ========================================================================= */}
      <div className="order-1 md:order-2 w-full md:w-7/12 lg:w-1/2 min-h-screen md:min-h-0 p-5 sm:p-10 lg:p-14 flex flex-col justify-center max-w-xl mx-auto">

        <Link to="/" className="md:hidden inline-flex items-center gap-3 mb-8 self-start" aria-label="DeepTrust home">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-[#D97757] flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="w-6 h-6 text-white" />
          </span>
          <span className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-white leading-none">DeepTrust</span>
            <span className="text-[9px] font-mono tracking-widest text-[#E88F6B] uppercase font-semibold mt-1">AI Verification OS</span>
          </span>
        </Link>
        
        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-2xl mb-7 sm:mb-8">
          <button
            onClick={() => {
              setActiveTab('login');
              navigate('/login', { replace: true });
            }}
            className={`flex-1 min-h-11 px-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'login'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In to Workspace
          </button>
          <button
            onClick={() => {
              setActiveTab('signup');
              navigate('/signup', { replace: true });
            }}
            className={`flex-1 min-h-11 px-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'signup'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create New Account
          </button>
        </div>

        {/* ------------------------------------------------------------------------- */}
        {/* LOGIN PANE                                                                */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'login' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Welcome Back</h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your verified credentials to access your newsroom verification desk.
              </p>
            </div>

            {loginError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Work Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@newsroom.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full min-h-11 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition placeholder-slate-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="text-[11px] text-[#E88F6B] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full min-h-11 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition placeholder-slate-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-0"
                  />
                  <span>Keep me signed in (30 days)</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full min-h-12 py-3 bg-gradient-to-r from-indigo-600 to-[#D97757] hover:from-indigo-500 hover:to-[#B0512F] text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loginLoading ? 'Authenticating...' : 'Sign In to Workspace'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Evidentiary dossiers and verification records are sealed and retained securely for 24 months.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* SIGNUP 3-STEP WIZARD                                                      */}
        {/* ------------------------------------------------------------------------- */}
        {activeTab === 'signup' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Step Progress Pill Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 font-medium">Setup Workspace Account</span>
                <span className="text-[#E88F6B] font-bold">Step {signupStep} of 3</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      signupStep >= s ? 'bg-gradient-to-r from-indigo-500 to-[#D97757]' : 'bg-slate-800'
                    }`}
                  />
                ))}
              </div>
            </div>

            {signupError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{signupError}</span>
              </div>
            )}

            {/* STEP 1: PERSONAL DETAILS */}
            {signupStep === 1 && (
              <form onSubmit={handleStep1Next} className="space-y-4 animate-fadeIn">
                <div>
                  <h3 className="text-lg font-bold text-white">Personal & Account Details</h3>
                  <p className="text-xs text-slate-400">Step 1 — Tell us about yourself and your desk.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Gajendra Singh"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full min-h-11 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Work Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="name@organization.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="w-full min-h-11 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Mobile Number (for SMS Alerts)</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      placeholder="+91 98110 42207"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full min-h-11 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      placeholder="Minimum 6 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="w-full min-h-11 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-12 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2"
                >
                  Continue to Phone Verification <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* STEP 2: OTP VERIFICATION */}
            {signupStep === 2 && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <h3 className="text-lg font-bold text-white">Phone Verification</h3>
                  <p className="text-xs text-slate-400">
                    Step 2 — Enter the 6-digit security code sent to <strong className="text-white">{phone || signupEmail}</strong>.
                  </p>
                </div>

                {/* 6-digit OTP Grid */}
                <div className="grid grid-cols-6 gap-1.5 sm:gap-2 on-paste" onPaste={handleOtpPaste}>
                  {otpValues.map((val, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (otpInputRefs.current[idx] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={val}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e.target.value ? e : e)}
                      className="w-full min-w-0 h-12 text-center text-lg font-mono font-bold bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  ))}
                </div>

                {otpError && (
                  <p className="text-xs text-rose-400 text-center">{otpError}</p>
                )}

                {/* Developer Demo Autofill (Strictly DEV mode only) */}
                {import.meta.env.DEV && (
                  <div className="p-3 bg-slate-900 border border-dashed border-slate-700 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">
                      [Dev Test Mode] Live SMS gateway optional
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpValues(['1', '2', '3', '4', '5', '6'])}
                      className="min-h-11 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 rounded-lg text-[11px] font-mono font-bold"
                    >
                      Autofill 123456
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setSignupStep(1)}
                    className="min-h-11 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={handleStep2Next}
                    className="min-h-11 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-500/20 flex items-center gap-1.5"
                  >
                    Verify Code <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: WORKSPACE SETUP */}
            {signupStep === 3 && (
              <form onSubmit={handleStep3Submit} className="space-y-4 animate-fadeIn">
                <div>
                  <h3 className="text-lg font-bold text-white">Workspace Configuration</h3>
                  <p className="text-xs text-slate-400">Step 3 — Customise your team workspace & coverage beat.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Company / Newsroom Name</label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Caasaa AI Innovations"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full min-h-11 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Website URL</label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="caasaa.ai"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="w-full min-h-11 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Primary Beat</label>
                    <select
                      value={primaryBeat}
                      onChange={(e) => setPrimaryBeat(e.target.value)}
                      className="w-full min-h-11 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option>Policy & Governance</option>
                      <option>Financial Markets & Banking</option>
                      <option>Healthcare & Science</option>
                      <option>Elections & Politics</option>
                      <option>Brand & Corporate Reputation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Region Focus</label>
                    <select
                      value={regionFocus}
                      onChange={(e) => setRegionFocus(e.target.value)}
                      className="w-full min-h-11 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option>India</option>
                      <option>South Asia</option>
                      <option>Global</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setSignupStep(2)}
                    className="min-h-11 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={signupLoading}
                    className="min-h-11 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    {signupLoading ? 'Creating Workspace...' : 'Create Account & Launch'}
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#E88F6B]" />
                Password Reset Assistance
              </h3>
              <button
                onClick={() => setShowForgotModal(false)}
                className="w-11 h-11 inline-flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
                aria-label="Close password reset help"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-300 leading-relaxed">
              Automated self-service password reset is currently disabled for security compliance during active news desk operations.
            </p>

            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 space-y-1 font-mono text-[11px]">
              <span className="text-slate-500 block uppercase">To reset your account:</span>
              <p>Email: <strong className="text-white">support@etrai.in</strong></p>
              <p>Or contact your designated newsroom workspace administrator.</p>
            </div>

            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full min-h-11 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
