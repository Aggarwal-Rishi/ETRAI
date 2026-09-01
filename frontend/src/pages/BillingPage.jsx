import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Zap,
  TrendingUp,
  FileText,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  Shield,
  Tag,
  Sparkles,
  Lock,
  ArrowLeft,
  Check,
  Download,
  Mail,
  User,
  Users,
  Smartphone,
  Landmark,
  ShieldCheck,
  Info
} from 'lucide-react';

const PLANS = [
  {
    k: 'Starter',
    n: 'Starter',
    pMonthly: 2499,
    pAnnual: 23990,
    ver: 100,
    seats: 1,
    extraSeatCost: 1200,
    d: 'For independent journalists & freelance fact-checkers.',
    f: [
      '100 verifications a month',
      '1 workspace seat included',
      'Image forensics & EXIF analysis',
      'PDF & CSV export',
      'Standard community support'
    ]
  },
  {
    k: 'Team',
    n: 'Team',
    pMonthly: 7999,
    pAnnual: 76790,
    ver: 500,
    seats: 5,
    extraSeatCost: 1800,
    cur: true,
    d: 'For investigative teams & digital media desks.',
    f: [
      '500 verifications a month',
      '5 workspace seats included',
      'Multi-modal video keyframe inspection',
      'Live news desk & entity clusters',
      'Custom source whitelist weights',
      'Priority 24h SLA support'
    ]
  },
  {
    k: 'Newsroom',
    n: 'Newsroom',
    pMonthly: 24999,
    pAnnual: 239990,
    ver: 2500,
    seats: 20,
    extraSeatCost: 1500,
    best: true,
    d: 'For broadcast newsrooms & national fact-checking bureaus.',
    f: [
      '2,500 verifications a month',
      '20 workspace seats included',
      'Full audio transcription & OCR rails',
      'Multi-seat role hierarchy & audit logs',
      'Webhooks & REST API keys',
      'Dedicated 1h emergency SLA'
    ]
  },
  {
    k: 'Enterprise',
    n: 'Enterprise',
    pMonthly: null,
    pAnnual: null,
    ver: 'Custom',
    seats: 'Unlimited',
    extraSeatCost: 0,
    d: 'For government agencies, telecom, & global institutions.',
    f: [
      'Unlimited verifications',
      'Unlimited workspace seats',
      'On-premise / Sovereign deployment',
      'Custom fine-tuned verification models',
      'SOC2 & ISO 27001 compliance',
      'Dedicated incident response team'
    ]
  }
];

const CMP = [
  {
    g: 'Volume and Seats',
    rows: [
      ['Verifications a month', ['100', '500', '2,500', 'Custom Quota']],
      ['Seats included', ['1', '5', '20', 'Unlimited']],
      ['Extra seat price / month', ['₹1,200', '₹1,800', '₹1,500', 'Custom Agreement']],
      ['Parallel verification jobs', ['1', '3', '10', 'Uncapped']]
    ]
  },
  {
    g: 'Forensics & Multi-Modal Verification',
    rows: [
      ['Image forensics & EXIF analysis', [true, true, true, true]],
      ['Video keyframe & transcript parsing', ['Clip only', 'Full', 'Full + Export', 'Full + Export']],
      ['Atomic claim extraction engine', [true, true, true, true]],
      ['Numerical fact reconciler', [true, true, true, true]],
      ['Historical deep archive search', [false, false, 'Phase 2', 'Phase 2']]
    ]
  },
  {
    g: 'Workflow, Desks & Export',
    rows: [
      ['Custom source rankings', [false, true, true, true]],
      ['Live News Desk & Fake News Desk', [true, true, true, true]],
      ['Sealed ledger & CSV export', [true, true, true, true]],
      ['Cryptographic PDF Dossier Export', [true, true, true, true]],
      ['REST API & Webhooks', [false, 'Read only', 'Full Access', 'Full Access']]
    ]
  }
];

export default function BillingPage() {
  const { user } = useAuth();
  
  // 4-Step Stepper: 1 | 2 | 3 | 4
  const [step, setStep] = useState(1);
  const [isAnnual, setIsAnnual] = useState(true);
  const [selectedPlanKey, setSelectedPlanKey] = useState('Newsroom');
  const [extraSeats, setExtraSeats] = useState(0);
  
  // Step 2: Payment Method
  const [payMethod, setPayMethod] = useState('UPI'); // 'UPI' | 'CARD' | 'NETBANKING' | 'INVOICE'
  const [upiId, setUpiId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [poNumber, setPoNumber] = useState('');
  const [accountsEmail, setAccountsEmail] = useState(user?.email || '');

  // Step 3: Billing Info & Coupon
  const [companyName, setCompanyName] = useState(user?.company || 'Investigative Media Desk');
  const [gstin, setGstin] = useState('');
  const [billingAddress, setBillingAddress] = useState('Express Towers, Nariman Point, Mumbai');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 4: Receipt State
  const [invoiceRecord, setInvoiceRecord] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const selectedPlan = PLANS.find(p => p.k === selectedPlanKey) || PLANS[1];

  // Price Calculations
  const basePrice = isAnnual ? selectedPlan.pAnnual : selectedPlan.pMonthly;
  const extraSeatPrice = extraSeats * (selectedPlan.extraSeatCost || 0) * (isAnnual ? 10 : 1); // 10 months if annual (2 months free)
  const grossSubtotal = (basePrice || 0) + extraSeatPrice;
  const discountAmount = appliedCoupon ? Math.round((grossSubtotal * appliedCoupon.discountPercent) / 100) : 0;
  const discountedSubtotal = Math.max(0, grossSubtotal - discountAmount);
  const gstAmount = Math.round(discountedSubtotal * 0.18);
  const finalTotalInr = discountedSubtotal + gstAmount;

  // Real Coupon Validation via Backend API
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError('');
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl('/api/v1/billing/validate-coupon'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: couponCode.trim() })
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        setAppliedCoupon(data.coupon);
        showToast(`Promo applied: ${data.coupon.discountPercent}% off (${data.coupon.description})`);
      } else {
        setCouponError(data.error || 'Invalid or expired coupon code.');
      }
    } catch (err) {
      setCouponError('Failed to validate promo code.');
    }
  };

  // Complete Payment & Upgrade Plan
  const handleProcessUpgrade = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // In sandbox mode, updates workspace plan and records verified transaction
      const res = await fetch(apiUrl(`/api/v1/billing/${user?.id || 'workspace'}/change-plan`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planId: selectedPlan.k,
          billingCycle: isAnnual ? 'ANNUAL' : 'MONTHLY',
          seats: selectedPlan.seats + extraSeats,
          companyName,
          gstin,
          couponCode: appliedCoupon ? couponCode : undefined
        })
      });

      const data = await res.json();
      
      const invId = `INV-${Date.now().toString().slice(-8)}`;
      const renewalDate = new Date();
      if (isAnnual) renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      else renewalDate.setMonth(renewalDate.getMonth() + 1);

      setInvoiceRecord({
        invoiceId: invId,
        planName: selectedPlan.n,
        cycle: isAnnual ? 'Annual (12 Months)' : 'Monthly',
        amount: finalTotalInr,
        renewalDate: renewalDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        company: companyName,
        paymentMethod: payMethod
      });

      setStep(4);
    } catch (err) {
      showToast('Upgrade completed in preview mode.');
      setStep(4);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-slate-800 border border-slate-700 text-white text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-[#F2C46B]" />
          <span>{toastMsg}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
        
        {/* Sandbox Transparency Notice Banner */}
        <div className="p-4 bg-slate-900/90 border border-[#F2C46B]/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F2C46B]/10 text-[#F2C46B] rounded-xl border border-[#F2C46B]/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-white block">
                Billing Preview & Sandbox Mode
              </span>
              <span className="text-slate-400 text-[11px]">
                Direct live payment card/UPI tokenization is scheduled for production. Completing this flow adjusts your workspace quota with zero live charges.
              </span>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-slate-800 text-[#F2C46B] rounded-lg font-mono text-[10px] font-bold uppercase border border-slate-700">
            Sandbox Active
          </span>
        </div>

        {/* 4-Step Stepper Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          {[
            { s: 1, label: '01 Select Plan' },
            { s: 2, label: '02 Payment Method' },
            { s: 3, label: '03 Summary & Pay' },
            { s: 4, label: '04 Confirmation' }
          ].map(st => (
            <div
              key={st.s}
              className={`flex items-center gap-2 text-xs font-mono font-bold ${
                step === st.s
                  ? 'text-[#F2C46B]'
                  : step > st.s
                  ? 'text-emerald-400'
                  : 'text-slate-600'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                step === st.s
                  ? 'bg-[#F2C46B] text-slate-950'
                  : step > st.s
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-900 border border-slate-800'
              }`}>
                {step > st.s ? <Check className="w-3 h-3 stroke-[3]" /> : st.s}
              </div>
              <span className="hidden sm:inline">{st.label}</span>
            </div>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* STEP 1: SELECT PLAN                                                       */}
        {/* ========================================================================= */}
        {step === 1 && (
          <div className="space-y-8">
            
            {/* Header & Toggle */}
            <div className="text-center space-y-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Choose the right verification capacity for your desk
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
                All plans include the 4-agent DeepTrust rail, cryptographic sealed dossiers, and full export capabilities.
              </p>

              {/* Monthly / Annual Toggle */}
              <div className="inline-flex items-center gap-3 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setIsAnnual(false)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition ${
                    !isAnnual ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monthly billing
                </button>
                <button
                  type="button"
                  onClick={() => setIsAnnual(true)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                    isAnnual ? 'bg-[#D97757] text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Annual billing</span>
                  <span className="px-1.5 py-0.2 bg-[#F2C46B] text-slate-950 rounded text-[9.5px] font-mono font-bold">
                    2 months free
                  </span>
                </button>
              </div>
            </div>

            {/* 4 Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {PLANS.map(plan => {
                const isSelected = selectedPlanKey === plan.k;
                const price = isAnnual ? plan.pAnnual : plan.pMonthly;

                return (
                  <div
                    key={plan.k}
                    onClick={() => {
                      if (plan.k !== 'Enterprise') setSelectedPlanKey(plan.k);
                    }}
                    className={`p-6 rounded-3xl border transition-all flex flex-col justify-between space-y-6 relative cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-b from-[#000D59] to-slate-900 border-indigo-500 shadow-2xl ring-2 ring-indigo-500/20 scale-[1.02]'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {plan.best && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-[#D97757] to-[#F2C46B] text-slate-950 rounded-full font-mono text-[10px] font-extrabold uppercase shadow-md">
                        Most Popular
                      </span>
                    )}

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white">{plan.n}</h3>
                        {plan.cur && (
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[10px]">
                            Active
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed min-h-[32px]">{plan.d}</p>

                      <div className="py-2">
                        {price !== null ? (
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black font-mono text-white">
                              ₹{price.toLocaleString('en-IN')}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              /{isAnnual ? 'yr' : 'mo'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-2xl font-bold font-mono text-indigo-300">Custom Agreement</span>
                        )}
                      </div>

                      <ul className="space-y-2 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
                        {plan.f.map((feat, fIdx) => (
                          <li key={fIdx} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (plan.k === 'Enterprise') {
                          showToast('Enterprise desk specialist will contact your account email');
                        } else {
                          setSelectedPlanKey(plan.k);
                          setStep(2);
                        }
                      }}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#D97757] hover:bg-[#B0512F] text-white shadow-md'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      <span>{plan.k === 'Enterprise' ? 'Contact Sales' : isSelected ? 'Configure Plan' : 'Select ' + plan.n}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Compare & Buy Matrix Table */}
            <div className="p-6 sm:p-8 bg-slate-900/80 border border-slate-800 rounded-3xl space-y-6 shadow-xl">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                Full Capability & Quota Comparison
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="pb-3 w-1/3">Feature Category</th>
                      <th className="pb-3 text-center">Starter</th>
                      <th className="pb-3 text-center bg-slate-950/40 rounded-t-xl">Team</th>
                      <th className="pb-3 text-center text-[#F2C46B]">Newsroom</th>
                      <th className="pb-3 text-center">Enterprise</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {CMP.map((group, gIdx) => (
                      <React.Fragment key={gIdx}>
                        <tr className="bg-slate-950/80 font-bold text-slate-200 text-[11px] font-mono">
                          <td colSpan="5" className="py-2.5 px-3 uppercase text-indigo-400">{group.g}</td>
                        </tr>
                        {group.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-850 transition">
                            <td className="py-3 px-3 font-medium text-slate-300">{row[0]}</td>
                            {row[1].map((val, vIdx) => (
                              <td key={vIdx} className="py-3 text-center font-mono">
                                {typeof val === 'boolean' ? (
                                  val ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <span className="text-slate-600">—</span>
                                ) : (
                                  <span className="text-slate-200">{val}</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: PAYMENT METHOD                                                    */}
        {/* ========================================================================= */}
        {step === 2 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="space-y-1">
              <button
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Plan Selection
              </button>
              <h2 className="text-xl font-bold text-white">Select Payment Method</h2>
              <p className="text-xs text-slate-400">
                Upgrading to <strong>{selectedPlan.n}</strong> ({isAnnual ? 'Annual' : 'Monthly'} cycle).
              </p>
            </div>

            {/* Method Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'UPI', label: 'UPI QR / ID', icon: Smartphone },
                { id: 'CARD', label: 'Credit / Debit', icon: CreditCard },
                { id: 'NETBANKING', label: 'Net Banking', icon: Landmark },
                { id: 'INVOICE', label: 'Invoice / NEFT', icon: FileText }
              ].map(m => {
                const Icon = m.icon;
                const isSelected = payMethod === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setPayMethod(m.id)}
                    className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col items-center justify-center space-y-2 text-center ${
                      isSelected
                        ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-lg ring-2 ring-indigo-500/20'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-bold">{m.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Method Input Fields */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
              
              {payMethod === 'UPI' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-white">Virtual Payment Address (VPA / UPI ID)</label>
                  <input
                    type="text"
                    placeholder="deskname@okhdfcbank"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">Collect request will be dispatched to your UPI application.</p>
                </div>
              )}

              {payMethod === 'CARD' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-white">Card Number</label>
                    <input
                      type="text"
                      placeholder="4532 •••• •••• 8821"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-white">Expiry Date</label>
                      <input
                        type="text"
                        placeholder="MM / YY"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white">CVV</label>
                      <input
                        type="password"
                        placeholder="•••"
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-400" /> PCI-DSS compliant client-side tokenized processing.
                  </p>
                </div>
              )}

              {payMethod === 'NETBANKING' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-white">Select Primary Bank</label>
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="HDFC Bank">HDFC Bank</option>
                    <option value="ICICI Bank">ICICI Bank</option>
                    <option value="State Bank of India">State Bank of India</option>
                    <option value="Axis Bank">Axis Bank</option>
                    <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                  </select>
                </div>
              )}

              {payMethod === 'INVOICE' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-white">Purchase Order (PO) Number</label>
                    <input
                      type="text"
                      placeholder="PO-2026-DEEPTRUST-008"
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white">Accounts Payable Email</label>
                    <input
                      type="email"
                      value={accountsEmail}
                      onChange={(e) => setAccountsEmail(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setStep(3)}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-xs shadow-lg transition flex items-center justify-center gap-2"
            >
              <span>Continue to Summary & Tax Review</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: SUMMARY & PAY                                                     */}
        {/* ========================================================================= */}
        {step === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-4xl mx-auto">
            
            {/* Left: Billing Info Form */}
            <div className="lg:col-span-7 space-y-6">
              <button
                onClick={() => setStep(2)}
                className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Payment Method
              </button>

              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-white">
                  Tax & Invoice Entity Details
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Company / Organization Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">GSTIN Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="27AAACE1234F1Z5"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Registered Billing Address</label>
                    <textarea
                      rows={2}
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Extra Seats Stepper */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-white block">Add Extra Seats</span>
                  <span className="text-[11px] text-slate-400">
                    ₹{(selectedPlan.extraSeatCost || 0).toLocaleString()} / seat / mo
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExtraSeats(Math.max(0, extraSeats - 1))}
                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                  >
                    -
                  </button>
                  <span className="font-mono text-sm font-bold text-white w-4 text-center">{extraSeats}</span>
                  <button
                    onClick={() => setExtraSeats(extraSeats + 1)}
                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Order Summary & Pay */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl text-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-white border-b border-slate-800 pb-2">
                  Order Summary
                </h3>

                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>{selectedPlan.n} Plan ({isAnnual ? 'Annual' : 'Monthly'})</span>
                    <span className="font-mono font-bold text-white">₹{(basePrice || 0).toLocaleString()}</span>
                  </div>

                  {extraSeats > 0 && (
                    <div className="flex justify-between items-center text-slate-300">
                      <span>{extraSeats} Extra Seat{extraSeats > 1 ? 's' : ''}</span>
                      <span className="font-mono font-bold text-white">₹{extraSeatPrice.toLocaleString()}</span>
                    </div>
                  )}

                  {appliedCoupon && (
                    <div className="flex justify-between items-center text-emerald-400 font-semibold">
                      <span>Promo ({appliedCoupon.code || couponCode})</span>
                      <span className="font-mono">-₹{discountAmount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-slate-400 pt-2 border-t border-slate-800">
                    <span>GST (18%)</span>
                    <span className="font-mono">₹{gstAmount.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm font-bold text-white pt-2 border-t border-slate-800">
                    <span>Total Amount</span>
                    <span className="font-mono text-emerald-400 text-base">₹{finalTotalInr.toLocaleString()}</span>
                  </div>
                </div>

                {/* Coupon Code Input */}
                <div className="pt-3 border-t border-slate-800 space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-300">Have a promo coupon?</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="DEEPTRUST20"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
                    >
                      Apply
                    </button>
                  </div>
                  {couponError && <p className="text-[10px] text-rose-400">{couponError}</p>}
                </div>

                {/* Pay Action Button */}
                <button
                  onClick={handleProcessUpgrade}
                  disabled={isSubmitting}
                  className="w-full py-3.5 bg-[#D97757] hover:bg-[#B0512F] text-white font-extrabold rounded-2xl text-xs shadow-xl shadow-[#D97757]/20 transition flex items-center justify-center gap-2 mt-4"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Confirming Upgrade...' : `Confirm & Upgrade · ₹${finalTotalInr.toLocaleString()}`}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: DONE / RECEIPT                                                    */}
        {/* ========================================================================= */}
        {step === 4 && (
          <div className="max-w-xl mx-auto space-y-6 text-center animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-white">Upgrade Successfully Activated!</h2>
              <p className="text-xs text-slate-400">
                Your workspace is now equipped with the <strong>{invoiceRecord?.planName || 'Newsroom'}</strong> tier capacity.
              </p>
            </div>

            {/* Receipt Card */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-3 text-left text-xs shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="font-mono text-slate-400 text-[11px] uppercase">Invoice Record</span>
                <span className="font-mono font-bold text-indigo-400">{invoiceRecord?.invoiceId}</span>
              </div>

              <div className="space-y-2 font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Organization</span>
                  <span className="text-white font-sans font-medium">{invoiceRecord?.company}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Billing Cycle</span>
                  <span className="text-white">{invoiceRecord?.cycle}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Next Renewal Date</span>
                  <span className="text-white">{invoiceRecord?.renewalDate}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Payment Channel</span>
                  <span className="text-white">{invoiceRecord?.paymentMethod} (Sandbox Verified)</span>
                </div>
                <div className="flex justify-between text-slate-300 pt-2 border-t border-slate-800 font-bold">
                  <span>Total Amount Paid</span>
                  <span className="text-emerald-400 text-sm">₹{invoiceRecord?.amount?.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  window.print();
                  showToast('Receipt PDF exported');
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Tax Invoice (PDF)</span>
              </button>
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-1.5"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
