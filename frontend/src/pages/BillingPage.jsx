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
  Landmark
} from 'lucide-react';

const PLANS = [
  {
    k: 'starter',
    n: 'Starter',
    p: 4000,
    ver: 100,
    seats: 1,
    extra: 1200,
    d: 'One person checking a handful of items a day.',
    f: ['100 verifications a month', '1 seat included', 'Image forensics + PDF export', '6-month report retention', 'Email support']
  },
  {
    k: 'team',
    n: 'Team',
    p: 24000,
    ver: 500,
    seats: 5,
    extra: 2400,
    cur: true,
    d: 'A small desk sharing one source list and workspace.',
    f: ['500 verifications a month', '5 seats included', 'Full video & audio forensics', 'Custom source rankings', 'Custom scoring weights', 'Read API']
  },
  {
    k: 'newsroom',
    n: 'Newsroom',
    p: 68000,
    ver: 2000,
    seats: 20,
    extra: 2000,
    best: true,
    d: 'A full newsroom with several beats running at once.',
    f: ['2,000 verifications a month', '20 seats included', '10 live news beats', 'Per-desk scoring weights', 'Read + write API, webhooks', 'Priority support · 4 hours']
  },
  {
    k: 'ent',
    n: 'Enterprise',
    p: null,
    ver: 'Unlimited',
    seats: 'Unlimited',
    extra: 0,
    d: 'Group-wide deployment with your own policy and cloud region.',
    f: ['Unlimited verifications', 'Unlimited seats', 'SSO & complete audit logs', 'Choice of Neon data region', 'Named engineer + SLA', 'Custom retention policy']
  }
];

const CMP = [
  {
    g: 'Volume and Seats',
    rows: [
      ['Verifications a month', ['100', '500', '2,000', 'Unlimited']],
      ['Seats included', ['1', '5', '20', 'Unlimited']],
      ['Extra seat, per month', ['₹1,200', '₹2,400', '₹2,000', 'Custom SLA']],
      ['Runs in parallel', ['1', '3', '10', 'Unmetered']]
    ]
  },
  {
    g: 'Forensics & Media Engines',
    rows: [
      ['Image forensics with original recovery', [true, true, true, true]],
      ['Video and audio forensics', ['Clip only', 'Full', 'Full + Frame Export', 'Full + Frame Export']],
      ['Deepfake & voice-clone checks', [false, true, true, true]],
      ['PDF and document verification', ['Text layer', 'Full · Seal + Template', 'Full · Seal + Template', 'Full · Seal + Template']],
      ['Deep archive search', [false, false, true, true]]
    ]
  },
  {
    g: 'Workflow & Integration',
    rows: [
      ['Custom source rankings', [false, true, true, true]],
      ['Custom scoring weights', [false, 'One Set', 'Per Desk', 'Per Desk']],
      ['Live news beats', ['—', '1', '10', 'Unlimited']],
      ['Shared fake-news desk', [false, true, true, true]],
      ['API & webhooks', ['—', 'Read Only', 'Read + Write', 'Read + Write']],
      ['PDF report export', [true, true, true, true]]
    ]
  },
  {
    g: 'Security & Enterprise SLA',
    rows: [
      ['Report retention', ['6 months', '24 months', '36 months', 'Custom Policy']],
      ['Support SLA', ['Email', 'Email · 1 day', 'Priority · 4h', 'Dedicated Engineer']],
      ['SSO & audit logs', [false, false, false, true]],
      ['Choice of data region', [false, false, false, true]]
    ]
  }
];

const METHODS = [
  { k: 'upi', n: 'UPI', ic: Smartphone, d: 'Pay instantly via any UPI app — GPay, PhonePe, Paytm, CRED' },
  { k: 'card', n: 'Credit or Debit Card', ic: CreditCard, d: 'Visa, Mastercard, RuPay, Amex · Tokenized for renewal' },
  { k: 'bank', n: 'Net Banking', ic: Landmark, d: 'All major Indian banks · Instant redirect' },
  { k: 'inv', n: 'Invoice & Bank Transfer (NEFT / RTGS)', ic: FileText, d: '15-day payment terms against PO (Annual cycle only)' }
];

const INR = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

export default function BillingPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(1); // 1: Select | 2: Method | 3: Summary | 4: Receipt
  const [cycle, setCycle] = useState('month'); // 'month' | 'year'
  const [selectedPlanKey, setSelectedPlanKey] = useState('newsroom');
  const [seatCount, setSeatCount] = useState(20);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  
  // Payment Form States
  const [upiId, setUpiId] = useState('gajenn@okhdfcbank');
  const [cardNumber, setCardNumber] = useState('4218 •••• •••• 9032');
  const [cardExpiry, setCardExpiry] = useState('09 / 28');
  const [cardCvv, setCardCvv] = useState('123');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [poNumber, setPoNumber] = useState('PO-2026-0142');
  
  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const currentPlan = PLANS.find(p => p.k === selectedPlanKey) || PLANS[2];
  const mul = cycle === 'year' ? 10 : 1; // 2 months free on annual
  const includedSeats = typeof currentPlan.seats === 'number' ? currentPlan.seats : 0;
  const extraSeats = Math.max(0, seatCount - includedSeats);
  const basePrice = currentPlan.p ? currentPlan.p * mul : 0;
  const extraSeatPrice = extraSeats * currentPlan.extra * mul;
  const creditUnused = 8400; // Credit from previous unused Team subscription
  const subtotal = Math.max(0, basePrice + extraSeatPrice - creditUnused - discount);
  const gst = subtotal * 0.18; // 18% GST in India
  const totalDue = subtotal + gst;

  useEffect(() => {
    if (typeof currentPlan.seats === 'number') {
      setSeatCount(currentPlan.seats);
    }
  }, [selectedPlanKey]);

  const handleApplyCoupon = () => {
    const code = couponCode.trim().toUpperCase();
    if (code === 'NEWSROOM10') {
      const disc = Math.round(basePrice * 0.1);
      setDiscount(disc);
      showToast('Coupon NEWSROOM10 applied · 10% discount');
    } else if (code) {
      setDiscount(0);
      showToast('Coupon code is invalid or expired');
    }
  };

  const handleSeatChange = (delta) => {
    const minSeats = typeof currentPlan.seats === 'number' ? currentPlan.seats : 1;
    const newSeats = Math.max(minSeats, Math.min(200, seatCount + delta));
    setSeatCount(newSeats);
  };

  const handlePayNow = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setReceipt({
        invoiceId: `DT-INV-2026-0${Math.floor(Math.random() * 800 + 200)}`,
        plan: currentPlan.n,
        cycle: cycle === 'year' ? 'Annual (12 Months)' : 'Monthly',
        seats: seatCount,
        method: METHODS.find(m => m.k === paymentMethod)?.n || 'UPI',
        total: totalDue,
        nextDate: cycle === 'year' ? '1 Aug 2027' : '1 Sep 2026'
      });
      setStep(4);
      showToast(`Upgrade to ${currentPlan.n} completed successfully!`);
    }, 1600);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-slate-800 border border-slate-700 text-white text-xs rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1 animate-fadeIn">
        {/* Stepper Header */}
        <div className="max-w-2xl mx-auto flex items-center justify-between relative">
          {[
            { s: 1, label: 'Select Plan' },
            { s: 2, label: 'Payment Method' },
            { s: 3, label: 'Review & Pay' },
            { s: 4, label: 'Active Plan' }
          ].map((st, i) => (
            <div key={st.s} className="flex flex-col items-center gap-1.5 z-10">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-all ${
                step === st.s ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20' :
                step > st.s ? 'bg-emerald-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-500'
              }`}>
                {step > st.s ? <Check className="w-4 h-4" /> : `0${st.s}`}
              </div>
              <span className={`text-xs font-medium ${step === st.s ? 'text-white' : 'text-slate-500'}`}>
                {st.label}
              </span>
            </div>
          ))}
          <div className="absolute top-4 left-10 right-10 h-0.5 bg-slate-800 -z-0" />
        </div>

        {/* STEP 1: SELECT PLAN */}
        {step === 1 && (
          <div className="space-y-8 animate-fadeIn">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <h1 className="text-3xl font-bold text-white">Choose the Plan That Fits Your News Desk</h1>
              <p className="text-xs text-slate-400">
                You are currently on <strong className="text-indigo-400">Team Plan</strong> (310 / 500 verifications used). Upgrades take effect immediately with pro-rated credit for unused days.
              </p>
              {/* Billing Cycle Switch */}
              <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-full">
                <button
                  onClick={() => setCycle('month')}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
                    cycle === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  onClick={() => setCycle('year')}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
                    cycle === 'year' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Annual Billing
                  <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded text-[9px] font-mono font-bold">
                    2 MONTHS FREE
                  </span>
                </button>
              </div>
            </div>

            {/* Plan Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLANS.map(plan => {
                const isSelected = selectedPlanKey === plan.k;
                return (
                  <div
                    key={plan.k}
                    onClick={() => setSelectedPlanKey(plan.k)}
                    className={`p-6 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-gradient-to-b from-indigo-950/40 via-slate-900 to-slate-950 border-indigo-500 shadow-2xl shadow-indigo-500/10 ring-2 ring-indigo-500/20 scale-[1.02]'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {plan.best && (
                      <span className="absolute -top-2.5 left-6 px-2.5 py-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-full text-[10px] font-mono font-bold uppercase shadow-sm">
                        Most Chosen
                      </span>
                    )}
                    {plan.cur && (
                      <span className="absolute -top-2.5 left-6 px-2.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-full text-[10px] font-mono font-bold uppercase">
                        Current Plan
                      </span>
                    )}

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white">{plan.n}</h3>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-indigo-500 bg-indigo-600' : 'border-slate-700'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 min-h-[32px]">{plan.d}</p>
                      <div className="pt-2">
                        <span className="text-2xl font-bold font-mono text-white">
                          {plan.p === null ? 'Custom SLA' : INR(plan.p * mul)}
                        </span>
                        <span className="text-slate-500 text-xs font-mono block">
                          {plan.p === null ? 'Tailored Contract' : cycle === 'year' ? 'per year (billed once)' : 'per month'}
                        </span>
                      </div>

                      <div className="pt-4 border-t border-slate-800/80 space-y-2">
                        {plan.f.map((feat, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                            <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlanKey(plan.k);
                        setStep(2);
                      }}
                      className={`w-full mt-6 py-2 rounded-xl text-xs font-semibold transition ${
                        isSelected
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {plan.p === null ? 'Request Enterprise Quote' : `Select ${plan.n}`}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Compare & Buy Feature Matrix Table */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-3xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">Comprehensive Feature Matrix</h3>
                  <p className="text-xs text-slate-400">Detailed line-by-line capability comparison.</p>
                </div>
                <span className="text-xs font-mono text-indigo-400">All plans include 18% GST compliance & PDF export</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                      <th className="py-3 px-4 w-1/3">Feature Capability</th>
                      {PLANS.map(p => (
                        <th 
                          key={p.k} 
                          className={`py-3 px-4 text-center ${selectedPlanKey === p.k ? 'text-indigo-400 font-bold bg-indigo-950/20' : ''}`}
                        >
                          {p.n}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {CMP.map(grp => (
                      <React.Fragment key={grp.g}>
                        <tr className="bg-slate-950/60 font-semibold text-slate-400 text-[11px]">
                          <td colSpan={5} className="py-2.5 px-4 font-mono">{grp.g}</td>
                        </tr>
                        {grp.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-850">
                            <td className="py-2.5 px-4 font-medium text-slate-200">{row[0]}</td>
                            {row[1].map((val, cIdx) => (
                              <td 
                                key={cIdx} 
                                className={`py-2.5 px-4 text-center ${selectedPlanKey === PLANS[cIdx].k ? 'bg-indigo-950/10 font-semibold' : ''}`}
                              >
                                {typeof val === 'boolean' ? (
                                  val ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <span className="text-slate-600">—</span>
                                ) : (
                                  <span>{val}</span>
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

        {/* STEP 2: PAYMENT METHOD */}
        {step === 2 && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <div className="text-center space-y-1.5">
              <h2 className="text-2xl font-bold text-white">Select Payment Method</h2>
              <p className="text-xs text-slate-400">Choose how you would like to handle subscriptions and renewals.</p>
            </div>

            <div className="space-y-3">
              {METHODS.map(m => {
                const Icon = m.ic;
                const isSelected = paymentMethod === m.k;
                return (
                  <div
                    key={m.k}
                    onClick={() => setPaymentMethod(m.k)}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                      isSelected ? 'bg-indigo-950/30 border-indigo-500 shadow-md ring-1 ring-indigo-500/20' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white text-sm">{m.n}</h4>
                          <p className="text-xs text-slate-400">{m.d}</p>
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-indigo-500 bg-indigo-600' : 'border-slate-700'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>

                    {/* Method Form Inputs */}
                    {isSelected && (
                      <div className="pt-4 mt-3 border-t border-slate-800/80 text-xs space-y-3">
                        {m.k === 'upi' && (
                          <div>
                            <label className="block text-slate-400 mb-1">Your UPI ID (VPA)</label>
                            <input
                              type="text"
                              value={upiId}
                              onChange={(e) => setUpiId(e.target.value)}
                              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                              placeholder="e.g. yourname@okhdfcbank"
                            />
                          </div>
                        )}
                        {m.k === 'card' && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-slate-400 mb-1">Card Number</label>
                              <input
                                type="text"
                                value={cardNumber}
                                onChange={(e) => setCardNumber(e.target.value)}
                                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-slate-400 mb-1">Expiry</label>
                                <input
                                  type="text"
                                  value={cardExpiry}
                                  onChange={(e) => setCardExpiry(e.target.value)}
                                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-400 mb-1">CVV</label>
                                <input
                                  type="password"
                                  value={cardCvv}
                                  onChange={(e) => setCardCvv(e.target.value)}
                                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        {m.k === 'bank' && (
                          <div>
                            <label className="block text-slate-400 mb-1">Select Bank</label>
                            <select
                              value={selectedBank}
                              onChange={(e) => setSelectedBank(e.target.value)}
                              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                            >
                              <option>HDFC Bank</option>
                              <option>ICICI Bank</option>
                              <option>State Bank of India</option>
                              <option>Axis Bank</option>
                              <option>Kotak Mahindra Bank</option>
                            </select>
                          </div>
                        )}
                        {m.k === 'inv' && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-slate-400 mb-1">Purchase Order (PO) Number</label>
                              <input
                                type="text"
                                value={poNumber}
                                onChange={(e) => setPoNumber(e.target.value)}
                                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Access opens immediately upon PO record. Official tax invoice sent to billing email with 15-day payment window.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-4">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Plans
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition flex items-center gap-1.5"
              >
                Review Order <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & SUMMARY */}
        {step === 3 && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
            <div className="text-center space-y-1.5">
              <h2 className="text-2xl font-bold text-white">Review Order & Complete Payment</h2>
              <p className="text-xs text-slate-400">Verify your seat count and billing details before confirming.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Order Breakdown */}
              <div className="md:col-span-2 space-y-4">
                {/* Seats Configurator */}
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 text-xs">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                    <div>
                      <h4 className="font-semibold text-white text-sm">{currentPlan.n} Plan ({cycle === 'year' ? '12 Months' : 'Monthly'})</h4>
                      <p className="text-slate-400">{includedSeats} seats included with plan</p>
                    </div>
                    <span className="font-mono text-base font-bold text-white">{INR(basePrice)}</span>
                  </div>

                  {/* Seat Stepper */}
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium text-slate-200 block">Workspace Team Seats</span>
                      <span className="text-slate-400">{INR(currentPlan.extra * mul)} per extra seat</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSeatChange(-1)}
                        className="w-7 h-7 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 font-bold flex items-center justify-center transition"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-sm w-6 text-center">{seatCount}</span>
                      <button
                        onClick={() => handleSeatChange(1)}
                        className="w-7 h-7 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 font-bold flex items-center justify-center transition"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Billing Address Form */}
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs">
                  <h4 className="font-semibold text-white text-sm">Tax & GST Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Company Legal Name</label>
                      <input
                        type="text"
                        defaultValue="Caasaa AI Innovations Pvt. Ltd."
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">GSTIN (Optional for 18% ITC)</label>
                      <input
                        type="text"
                        placeholder="e.g. 09AAACX1234X1ZX"
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Price Calculation Side Card */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 text-xs flex flex-col justify-between">
                <div className="space-y-3">
                  <h4 className="font-semibold text-white text-sm pb-2 border-b border-slate-800">Order Summary</h4>
                  <div className="flex justify-between text-slate-300">
                    <span>Base Subscription</span>
                    <span className="font-mono">{INR(basePrice)}</span>
                  </div>
                  {extraSeats > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>{extraSeats} Extra Seats</span>
                      <span className="font-mono">+{INR(extraSeatPrice)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-400">
                    <span>Unused Team Credit</span>
                    <span className="font-mono">-{INR(creditUnused)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Coupon (NEWSROOM10)</span>
                      <span className="font-mono">-{INR(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800">
                    <span>Subtotal</span>
                    <span className="font-mono text-slate-200">{INR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>GST (18% Mandatory)</span>
                    <span className="font-mono text-slate-200">{INR(gst)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-white pt-2 border-t-2 border-slate-800">
                    <span>Total Due Today</span>
                    <span className="font-mono text-emerald-400">{INR(totalDue)}</span>
                  </div>
                </div>

                {/* Coupon Code Input */}
                <div className="space-y-2 pt-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Coupon Code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 uppercase font-mono text-xs"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition"
                    >
                      Apply
                    </button>
                  </div>

                  <button
                    onClick={handlePayNow}
                    disabled={isProcessing}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    {isProcessing ? 'Authorizing Payment...' : `Pay ${INR(totalDue)}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: RECEIPT / SUCCESS */}
        {step === 4 && receipt && (
          <div className="max-w-xl mx-auto p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-6 animate-scaleUp">
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-xl">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-white">You're Now on {receipt.plan} Plan!</h2>
              <p className="text-xs text-slate-400">
                Payment received. Your new 2,000 monthly quota and {receipt.seats} seats are active immediately.
              </p>
            </div>

            {/* Receipt Details Card */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs space-y-2.5 text-left">
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Invoice ID</span>
                <span className="font-mono text-indigo-400 font-bold">{receipt.invoiceId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Billing Cycle</span>
                <span className="font-semibold text-white">{receipt.cycle}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Team Seats Active</span>
                <span className="font-mono text-white">{receipt.seats} Seats</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Paid Via</span>
                <span className="font-semibold text-white">{receipt.method}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Amount Charged</span>
                <span className="font-mono text-emerald-400 font-bold">{INR(receipt.total)} (incl. 18% GST)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Next Renewal</span>
                <span className="font-mono text-white">{receipt.nextDate}</span>
              </div>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => showToast('Tax Invoice PDF downloaded')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download Tax Invoice
              </button>
              <button
                onClick={() => setStep(1)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
