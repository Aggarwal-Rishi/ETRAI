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
  ArrowUpRight,
  Shield,
  Tag,
  Loader2
} from 'lucide-react';

export default function BillingPage() {
  const { user } = useAuth();
  const [billingData, setBillingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('MONTHLY'); // MONTHLY | ANNUAL
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [gstin, setGstin] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [processingUpgrade, setProcessingUpgrade] = useState(false);

  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const token = localStorage.getItem('etrai_token');

  const fetchBilling = async () => {
    try {
      setLoading(true);
      // Fetch user's workspaces first
      const resWs = await fetch(apiUrl('/api/v1/workspaces'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const dataWs = await resWs.json();
      if (dataWs && dataWs.workspaces && dataWs.workspaces.length > 0) {
        const wsId = dataWs.workspaces[0].id;
        const res = await fetch(apiUrl(`/api/v1/billing/${wsId}`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data && data.success) {
          setBillingData(data);
          if (data.subscription?.cycle) {
            setBillingCycle(data.subscription.cycle);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch billing summary:', err);
      setErrorMsg('Could not load billing data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, []);

  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setErrorMsg(null);
    try {
      const res = await fetch(apiUrl('/api/v1/billing/validate-coupon'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: promoCode, plan: selectedPlan?.id || billingData?.plan })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid coupon.');
      setAppliedPromo(data.promo);
      setSuccessMsg(`Coupon '${data.promo.code}' applied: ${data.promo.discountPercent}% discount.`);
    } catch (err) {
      setErrorMsg(err.message);
      setAppliedPromo(null);
    }
  };

  const handleUpgradePlan = async (planId) => {
    if (!billingData?.workspaceId) return;
    setProcessingUpgrade(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(apiUrl(`/api/v1/billing/${billingData.workspaceId}/change-plan`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: planId,
          cycle: billingCycle,
          promoCode: appliedPromo?.code,
          gstin,
          billingAddress
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upgrade plan.');

      setSuccessMsg(data.message || 'Plan upgraded successfully.');
      setSelectedPlan(null);
      fetchBilling();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setProcessingUpgrade(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription at the end of the billing period?')) return;
    try {
      const res = await fetch(apiUrl(`/api/v1/billing/${billingData.workspaceId}/cancel`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel subscription.');
      setSuccessMsg(data.message);
      fetchBilling();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      const res = await fetch(apiUrl(`/api/v1/billing/${billingData.workspaceId}/reactivate`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reactivate subscription.');
      setSuccessMsg(data.message);
      fetchBilling();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const isAnnual = billingCycle === 'ANNUAL';

  return (
    <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col font-sans selection:bg-brand-500 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="border-b border-slateDark-800 pb-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-400 uppercase tracking-widest mb-1">
              <CreditCard className="w-3.5 h-3.5" /> Subscription & Billing Architecture
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Plans & Quota Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Manage multi-tenant seat allocations, verification quotas, compute telemetry, and tax invoices.
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="flex items-center bg-slateDark-900 border border-slateDark-800 p-1 rounded-xl self-start md:self-auto">
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                !isAnnual ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle('ANNUAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                isAnnual ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Annual Billing
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 font-bold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Global Feedback */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Quota & Usage Overview */}
        {billingData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {/* Verification Quota Card */}
            <div className="bg-slateDark-900 border border-slateDark-800 p-5 rounded-2xl shadow-xl">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Monthly Verification Quota</span>
                <span className="font-bold text-white">
                  {billingData.quota.verificationsUsed} / {billingData.quota.verificationsLimit}
                </span>
              </div>
              <div className="text-2xl font-extrabold text-white">
                {billingData.quota.verificationsRemaining} <span className="text-xs font-normal text-slate-400">runs left</span>
              </div>
              <div className="w-full bg-slateDark-800 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-brand-500 h-full rounded-full transition-all"
                  style={{ width: `${billingData.quota.percentUsed}%` }}
                />
              </div>
            </div>

            {/* Seat Allocation Card */}
            <div className="bg-slateDark-900 border border-slateDark-800 p-5 rounded-2xl shadow-xl">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                <span>Workspace Seats</span>
                <span className="font-bold text-white">
                  {billingData.subscription.seatsOccupied} / {billingData.subscription.seatsAllocated}
                </span>
              </div>
              <div className="text-2xl font-extrabold text-white">
                {billingData.subscription.seatsAvailable} <span className="text-xs font-normal text-slate-400">seats open</span>
              </div>
              <div className="w-full bg-slateDark-800 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (billingData.subscription.seatsOccupied / billingData.subscription.seatsAllocated) * 100
                    )}%`
                  }}
                />
              </div>
            </div>

            {/* Telemetry & Compute Cost */}
            <div className="bg-slateDark-900 border border-slateDark-800 p-5 rounded-2xl shadow-xl">
              <div className="text-xs text-slate-400 font-medium mb-1">AI Tokens & Compute Cost</div>
              <div className="text-2xl font-extrabold text-white">
                ₹{billingData.telemetry.totalCostInr}{' '}
                <span className="text-xs font-normal text-slate-400">(${billingData.telemetry.totalCostUsd})</span>
              </div>
              <div className="text-xs text-slate-400 mt-2">
                {billingData.telemetry.totalTokensConsumed.toLocaleString()} Tokens • {billingData.telemetry.totalUsageEvents} Analysis Runs
              </div>
            </div>
          </div>
        )}

        {/* Plan Selection Grid */}
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-brand-400" /> Available Subscription Plans
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {billingData?.availablePlans?.map((plan) => {
            const isCurrent = billingData?.plan === plan.id;
            const price = isAnnual ? plan.priceAnnualInr : plan.priceMonthlyInr;

            return (
              <div
                key={plan.id}
                className={`bg-slateDark-900 border rounded-2xl p-6 flex flex-col justify-between transition-all ${
                  isCurrent
                    ? 'border-brand-500 ring-1 ring-brand-500/50 shadow-2xl shadow-brand-500/10'
                    : 'border-slateDark-800 hover:border-slateDark-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-extrabold text-white">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                        Current Plan
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-4 min-h-[32px]">{plan.tagline}</p>

                  <div className="mb-6">
                    <div className="text-3xl font-extrabold text-white">
                      ₹{price.toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-400">/ {isAnnual ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      +18% GST • {plan.seats} Seat{plan.seats > 1 ? 's' : ''} • {plan.verificationLimit} Verifications/mo
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  {isCurrent ? (
                    billingData?.subscription?.cancelAtPeriodEnd ? (
                      <button
                        onClick={handleReactivateSubscription}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl transition-colors"
                      >
                        Reactivate Auto-Renewal
                      </button>
                    ) : (
                      <button
                        onClick={handleCancelSubscription}
                        className="w-full bg-slateDark-800 hover:bg-slateDark-700 text-slate-300 text-xs font-semibold py-2.5 rounded-xl transition-colors border border-slateDark-700"
                      >
                        Cancel at Period End
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => handleUpgradePlan(plan.id)}
                      disabled={processingUpgrade}
                      className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition-colors shadow-lg shadow-brand-500/20 flex items-center justify-center gap-1.5"
                    >
                      {processingUpgrade ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Switch to {plan.name}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Promo Code & Invoices Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Coupon & Billing Information */}
          <div className="space-y-6">
            <div className="bg-slateDark-900 border border-slateDark-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                <Tag className="w-4 h-4 text-brand-400" /> Promotional Coupon
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Enter promotional code for verified newsrooms and academic research desks.
              </p>

              <form onSubmit={handleApplyCoupon} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ETRAI20 or NEWSROOM50"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="flex-1 bg-slateDark-800 border border-slateDark-700 rounded-xl px-3 py-2 text-xs text-white uppercase tracking-wider outline-none focus:border-brand-500"
                  />
                  <button
                    type="submit"
                    className="bg-slateDark-800 hover:bg-slateDark-700 text-white text-xs font-bold px-3 py-2 rounded-xl border border-slateDark-700"
                  >
                    Apply
                  </button>
                </div>
                {appliedPromo && (
                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {appliedPromo.discountPercent}% Discount Applied
                  </div>
                )}
              </form>
            </div>

            {/* Payment Gateway Status */}
            <div className="bg-slateDark-900 border border-slateDark-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-400" /> Gateway & Tax Compliance
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                {billingData?.gateway?.message || 'Standard 18% GST tax invoice billing active.'}
              </p>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment Mode:</span>
                  <span className="font-semibold text-white">Direct Tax Invoice (UPI / NetBanking)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tax Category:</span>
                  <span className="font-semibold text-white">18% GST (SAC 998314)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="lg:col-span-2 bg-slateDark-900 border border-slateDark-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-400" /> Invoice History ({billingData?.invoices?.length || 0})
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              RFC compliant tax invoices with GST itemization and payment receipts.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slateDark-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="pb-3 px-3">Invoice #</th>
                    <th className="pb-3 px-3">Period</th>
                    <th className="pb-3 px-3">Amount</th>
                    <th className="pb-3 px-3">GST</th>
                    <th className="pb-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slateDark-800/60">
                  {billingData?.invoices?.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slateDark-800/30 transition-colors">
                      <td className="py-3 px-3 font-mono text-brand-300 font-semibold">{inv.invoiceNumber}</td>
                      <td className="py-3 px-3 text-slate-300">
                        {new Date(inv.periodStart).toLocaleDateString()} - {new Date(inv.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 font-bold text-white">₹{inv.amount.toLocaleString()}</td>
                      <td className="py-3 px-3 text-slate-400">₹{inv.taxAmount.toLocaleString()}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
