import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { Link2, Upload, AlignLeft, CheckSquare, ShieldCheck, ArrowRight, Info, AlertTriangle } from 'lucide-react';

export default function NewAnalysisPage() {
  const [activeTab, setActiveTab] = useState('URL'); // 'URL' | 'FILE' | 'TEXT'
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Selected analysis types multi-select state
  const [types, setTypes] = useState({
    FACT_CHECKING: true,
    FAKE_NEWS_DETECTION: false,
    BUSINESS_REPORT: false,
  });

  const navigate = useNavigate();

  const toggleType = (key) => {
    setTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStartAnalysis = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const selectedTypesArray = Object.keys(types).filter((k) => types[k]);
    if (selectedTypesArray.length === 0) {
      setErrorMsg('Please select at least one analysis type to proceed.');
      return;
    }

    // Input Validation
    if (activeTab === 'URL' && !urlInput.trim()) {
      setErrorMsg('Please enter a valid webpage or article URL.');
      return;
    }

    if (activeTab === 'FILE' && !selectedFile) {
      setErrorMsg('Please select a PDF, DOCX, or TXT file to upload.');
      return;
    }

    if (activeTab === 'TEXT') {
      const words = textInput.trim().split(/\s+/).filter(Boolean);
      if (words.length < 35) {
        setErrorMsg('Pasted text is too short. A minimum of 35 words is required for accurate fact-checking.');
        return;
      }
    }

    setLoading(true);

    try {
      let body;
      let headers = {};

      if (activeTab === 'FILE') {
        const formData = new FormData();
        formData.append('inputType', 'FILE');
        formData.append('file', selectedFile);
        formData.append('selectedTypes', JSON.stringify(selectedTypesArray));
        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          inputType: activeTab,
          url: activeTab === 'URL' ? urlInput.trim() : undefined,
          text: activeTab === 'TEXT' ? textInput.trim() : undefined,
          selectedTypes: selectedTypesArray,
        });
      }

      const res = await fetch('/api/v1/verify/analyze', {
        method: 'POST',
        headers,
        body,
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start analysis job.');
      }

      // Redirect to live SSE results view
      navigate(`/results/${data.jobId}`);
    } catch (err) {
      console.error('[Start Analysis Error]:', err);
      setErrorMsg(err.message || 'An error occurred while initiating verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slateDark-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Submit Content for Verification
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Choose your input source and select the analysis types to execute across our 4 AI Agents.
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Input Mode Tabs */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-6">
          <div className="flex border-b border-slate-800 overflow-x-auto">
            <button
              onClick={() => { setActiveTab('URL'); setErrorMsg(''); }}
              className={`flex items-center gap-2 px-5 py-3 font-medium text-sm border-b-2 transition-colors shrink-0 ${
                activeTab === 'URL'
                  ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Link2 className="w-4 h-4" /> URL Link
            </button>

            <button
              onClick={() => { setActiveTab('FILE'); setErrorMsg(''); }}
              className={`flex items-center gap-2 px-5 py-3 font-medium text-sm border-b-2 transition-colors shrink-0 ${
                activeTab === 'FILE'
                  ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-4 h-4" /> File Upload (PDF / DOCX / TXT)
            </button>

            <button
              onClick={() => { setActiveTab('TEXT'); setErrorMsg(''); }}
              className={`flex items-center gap-2 px-5 py-3 font-medium text-sm border-b-2 transition-colors shrink-0 ${
                activeTab === 'TEXT'
                  ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlignLeft className="w-4 h-4" /> Pasted Text
            </button>
          </div>

          {/* Tab Content Panels */}
          {activeTab === 'URL' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Article or Webpage URL
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/news/article-to-verify"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Agent 1 will extract clean HTML text (with paywall/blocked fallback).
              </p>
            </div>
          )}

          {activeTab === 'FILE' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Upload Document (PDF, DOCX, TXT)
              </label>
              <label htmlFor="file-upload-input" className="block border-2 border-dashed border-slate-800 hover:border-brand-500/50 rounded-xl p-8 text-center bg-slate-900/40 transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-brand-400 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-200">
                  {selectedFile ? selectedFile.name : 'Click or drop document here'}
                </div>
                <div className="text-xs text-slate-500 mt-1">Supports PDF, DOCX, TXT up to 15MB</div>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  id="file-upload-input"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                />
              </label>
            </div>
          )}

          {activeTab === 'TEXT' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Paste Content Text (Minimum 35 words)
              </label>
              <textarea
                rows={6}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste the statement, press release, or document text here..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-y"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>Word count: {textInput.trim() ? textInput.trim().split(/\s+/).filter(Boolean).length : 0} words</span>
                <span>Minimum required: 35 words</span>
              </div>
            </div>
          )}
        </div>

        {/* Analysis Type Selection (Multi-select) */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-bold text-white">Select Analysis Types (1–3)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Fact Checking */}
            <div
              onClick={() => toggleType('FACT_CHECKING')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                types.FACT_CHECKING
                  ? 'bg-brand-600/15 border-brand-500 text-white'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm">Fact Checking</span>
                <input
                  type="checkbox"
                  checked={types.FACT_CHECKING}
                  readOnly
                  className="rounded border-slate-700 text-brand-600 focus:ring-brand-500"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Extract top claims & cross-reference against trusted web sources via Serper API.
              </p>
            </div>

            {/* Fake News Detection */}
            <div
              onClick={() => toggleType('FAKE_NEWS_DETECTION')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                types.FAKE_NEWS_DETECTION
                  ? 'bg-brand-600/15 border-brand-500 text-white'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm">Fake News Detection</span>
                <input
                  type="checkbox"
                  checked={types.FAKE_NEWS_DETECTION}
                  readOnly
                  className="rounded border-slate-700 text-brand-600 focus:ring-brand-500"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Detect clickbait, emotional loading, manipulation patterns & source credibility.
              </p>
            </div>

            {/* Business Report Verification */}
            <div
              onClick={() => toggleType('BUSINESS_REPORT')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                types.BUSINESS_REPORT
                  ? 'bg-brand-600/15 border-brand-500 text-white'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm">Business Verification</span>
                <input
                  type="checkbox"
                  checked={types.BUSINESS_REPORT}
                  readOnly
                  className="rounded border-slate-700 text-brand-600 focus:ring-brand-500"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Audit numbers, financial metrics, figures & official filing consistency.
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={handleStartAnalysis}
            disabled={loading}
            className="w-full py-4 px-6 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-brand-600/30 flex items-center justify-center gap-2 transition-all group"
          >
            <ShieldCheck className="w-5 h-5" />
            <span>{loading ? 'Initiating Agent Pipeline...' : 'Run Multi-Agent Verification'}</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </main>
    </div>
  );
}
