import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import VerdictBadge from '../components/VerdictBadge';
import { apiUrl } from '../utils/api';
import {
  Radio,
  FileText,
  Image as ImageIcon,
  Film,
  Globe,
  Upload,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Search,
  Layers,
  Zap,
  Info,
  Check,
  X
} from 'lucide-react';

const SAMPLE_PRESETS = [
  {
    type: 'TEXT',
    label: 'Currency Circular Claim',
    tag: 'Policy',
    text: 'GOVERNMENT NOTICE: In what may be the biggest currency decision in a decade, all ₹500 banknotes will stop being legal tender from 1 October 2026, according to internal circular DCM/1284/2026. Account holders must deposit all notes before 30 September.'
  },
  {
    type: 'TEXT',
    label: 'Monsoon Deficit Report',
    tag: 'Agriculture',
    text: 'The meteorological department has revised the cumulative seasonal monsoon deficit to 8% below the long-period average, shortening the remaining kharif sowing window across central agricultural belts.'
  },
  {
    type: 'TEXT',
    label: 'Metro Phase-4 Tender',
    tag: 'Infrastructure',
    text: 'The urban transit authority has formally awarded the civil infrastructure contract for Metro Phase-4 to the lowest bidding consortium, following multi-agency regulatory clearance.'
  }
];

export default function NewAnalysisPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Selected input card: 'NEWS_URL' | 'IMAGE' | 'VIDEO' | 'PDF' | 'TEXT' | 'MIXED_URL'
  const [selectedCard, setSelectedCard] = useState('TEXT');
  
  // Inputs
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState(location.state?.initialText || SAMPLE_PRESETS[0].text);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Pipeline Toggles
  const [optReverseSearch, setOptReverseSearch] = useState(true);
  const [optTraceProvenance, setOptTraceProvenance] = useState(true);
  const [optDetectEntities, setOptDetectEntities] = useState(true);
  const [optDeepArchive, setOptDeepArchive] = useState(false); // Coming soon

  // Pipeline Execution State (Runner)
  const [isRunning, setIsRunning] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Connecting to DeepTrust 4-Agent Verification Rail...');
  const [currentStage, setCurrentStage] = useState('INTAKE');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);

  const timerRef = useRef(null);

  // Timer effect
  useEffect(() => {
    if (isRunning) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Handle Form Submission
  const handleLaunchVerification = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    // Validation
    if ((selectedCard === 'NEWS_URL' || selectedCard === 'MIXED_URL') && !urlInput.trim()) {
      setErrorMessage('Please enter a valid webpage or article URL.');
      return;
    }
    if ((selectedCard === 'IMAGE' || selectedCard === 'PDF' || selectedCard === 'VIDEO') && !uploadedFile && !urlInput.trim() && !textInput.trim()) {
      setErrorMessage('Please upload a file or provide a source URL / claim text.');
      return;
    }
    if (selectedCard === 'TEXT' && textInput.trim().split(/\s+/).length < 8) {
      setErrorMessage('Please enter at least 8 words of claim text for verification.');
      return;
    }

    setIsRunning(true);
    setProgress(10);
    setCurrentStep('Initializing Multi-Agent Verification Rail...');
    setCurrentStage('INTAKE');

    try {
      const token = localStorage.getItem('etrai_token');
      let headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let inputType = 'TEXT';
      if (selectedCard === 'NEWS_URL' || selectedCard === 'MIXED_URL') inputType = 'URL';
      else if (selectedCard === 'IMAGE') inputType = 'PHOTO';
      else if (selectedCard === 'VIDEO') inputType = 'VIDEO';
      else if (selectedCard === 'PDF') inputType = 'FILE';

      let body;
      if (uploadedFile) {
        const formData = new FormData();
        formData.append('inputType', inputType);
        formData.append('file', uploadedFile);
        if (textInput.trim()) formData.append('text', textInput.trim());
        if (urlInput.trim()) formData.append('url', urlInput.trim());
        formData.append('selectedTypes', JSON.stringify(['FACT_CHECKING', 'FAKE_NEWS_DETECTION']));
        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          inputType,
          url: urlInput.trim() || undefined,
          text: textInput.trim() || undefined,
          selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION']
        });
      }

      const res = await fetch(apiUrl('/api/v1/verify'), {
        method: 'POST',
        headers,
        credentials: 'include',
        body
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start verification pipeline.');
      }

      const activeJobId = data.jobId;
      setJobId(activeJobId);

      // Connect to SSE Stream
      const sseUrl = token 
        ? apiUrl(`/api/v1/verify/stream/${activeJobId}?token=${encodeURIComponent(token)}`)
        : apiUrl(`/api/v1/verify/stream/${activeJobId}`);
      const eventSource = new EventSource(sseUrl, {
        withCredentials: true
      });

      eventSource.onmessage = (event) => {
        try {
          const streamData = JSON.parse(event.data);
          if (streamData.progress !== undefined) setProgress(streamData.progress);
          if (streamData.step) setCurrentStep(streamData.step);
          if (streamData.stage) setCurrentStage(streamData.stage);

          if (streamData.status === 'COMPLETED') {
            eventSource.close();
            navigate(`/results/${activeJobId}`);
          } else if (streamData.status === 'FAILED') {
            eventSource.close();
            setIsRunning(false);
            setErrorMessage(streamData.error || 'Verification pipeline encountered a failure.');
          }
        } catch (parseErr) {
          console.error('[SSE Parse Error]:', parseErr);
        }
      };

      eventSource.onerror = () => {
        // Retry polling if stream disconnects
        setTimeout(async () => {
          try {
            const pollRes = await fetch(apiUrl(`/api/v1/reports/${activeJobId}`), { headers, credentials: 'include' });
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.report) {
                eventSource.close();
                navigate(`/results/${activeJobId}`);
              }
            }
          } catch (e) {}
        }, 3000);
      };

    } catch (err) {
      setIsRunning(false);
      setErrorMessage(err.message || 'Pipeline initialization failed.');
    }
  };

  // Pipeline Stages Definition
  const PIPELINE_STAGES = [
    { id: 'INTAKE', label: 'Intake & Parsing', desc: 'Validates input magic-bytes, extracts OCR/text, cleans payload' },
    { id: 'PROVENANCE', label: 'Provenance & Source Authority', desc: 'Queries ranked sources, checks registrar WHOIS and wire archives' },
    { id: 'CLAIMS', label: 'Claim Extraction Engine', desc: 'Decomposes narrative into atomic, verifiable assertions' },
    { id: 'FACT_MATCH', label: 'Cross-Source Fact Match', desc: 'Queries primary web indices and evaluates corroboration signals' },
    { id: 'FORENSICS', label: 'Media & Forensics Rails', desc: 'ELA pixel analysis, keyframe splice detection, spectral match' },
    { id: 'SYNTHESIS', label: 'Dossier Sealing & Derivation', desc: 'Calculates signature trust score and cryptographically seals report' }
  ];

  const getStageStatus = (stageId, index) => {
    const stageOrder = ['INTAKE', 'PROVENANCE', 'CLAIMS', 'FACT_MATCH', 'FORENSICS', 'SYNTHESIS'];
    let currentIndex = 0;
    if (progress < 25) currentIndex = 0;
    else if (progress < 45) currentIndex = 1;
    else if (progress < 65) currentIndex = 2;
    else if (progress < 80) currentIndex = 3;
    else if (progress < 95) currentIndex = 4;
    else currentIndex = 5;

    if (index < currentIndex) return 'COMPLETED';
    if (index === currentIndex) return 'ACTIVE';
    return 'PENDING';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
        
        {/* ========================================================================= */}
        {/* MODE 1: INTAKE STUDIO (FORM VIEW)                                         */}
        {/* ========================================================================= */}
        {!isRunning ? (
          <div className="space-y-8">
            
            {/* Header */}
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#E88F6B]/20 text-[#E88F6B] border border-[#E88F6B]/30 text-[11px] font-mono font-bold uppercase tracking-wider mb-2">
                <Sparkles className="w-3 h-3" /> Intake Studio v2.4
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                DeepTrust Verification Studio
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Select your source asset type to launch the multi-agent evidentiary verification pipeline.
              </p>
            </div>

            {errorMessage && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 6 Input Type Selector Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { id: 'NEWS_URL', label: 'News link', icon: Radio, sub: 'Web article' },
                { id: 'IMAGE', label: 'Image asset', icon: ImageIcon, sub: 'Photo / ELA' },
                {
                  id: 'VIDEO',
                  label: 'Video clip',
                  icon: Film,
                  sub: 'Upload file',
                  badge: 'Upload only'
                },
                { id: 'PDF', label: 'PDF document', icon: FileText, sub: 'Notices / Briefs' },
                { id: 'TEXT', label: 'Claim text', icon: Layers, sub: 'Raw statements' },
                { id: 'MIXED_URL', label: 'All in a URL', icon: Globe, sub: 'Deep scrape' }
              ].map(card => {
                const Icon = card.icon;
                const isSelected = selectedCard === card.id;
                return (
                  <div
                    key={card.id}
                    onClick={() => {
                      setSelectedCard(card.id);
                      setErrorMessage(null);
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 relative ${
                      isSelected
                        ? 'bg-gradient-to-b from-[#000D59] to-slate-900 border-indigo-500 shadow-xl ring-2 ring-indigo-500/20 scale-[1.02]'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {card.badge && (
                      <span className="absolute -top-2 right-2 px-1.5 py-0.2 bg-[#B0512F] text-white rounded text-[9px] font-mono font-bold">
                        {card.badge}
                      </span>
                    )}

                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-xl ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-indigo-500 bg-indigo-600' : 'border-slate-700'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>

                    <div>
                      <span className="font-bold text-xs text-white block truncate">{card.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono block truncate">{card.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Video Limitation Honest Notice */}
            {selectedCard === 'VIDEO' && (
              <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl text-xs text-slate-300 flex items-center gap-3">
                <Info className="w-4 h-4 text-[#E88F6B] flex-shrink-0" />
                <span>
                  <strong>Supported Input:</strong> Direct MP4/WebM video file uploads and transcripts are fully processed for splice and voice-clone checks. Direct social URL scraping (YouTube/X) is scheduled for Phase 2.
                </span>
              </div>
            )}

            {/* Conditional Input Field Box */}
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
              
              {/* URL Input */}
              {(selectedCard === 'NEWS_URL' || selectedCard === 'MIXED_URL') && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-white">Article / Source Webpage URL</label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      placeholder="https://news-outlet.com/article/2026/08/policy-notice"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono placeholder-slate-500"
                    />
                  </div>
                </div>
              )}

              {/* Text Area */}
              {selectedCard === 'TEXT' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold text-white">Claim Statement / Article Text</label>
                    <span className="text-[11px] font-mono text-slate-400">
                      {textInput.trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste the statement, press note, or forwarded message here..."
                    className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed placeholder-slate-500"
                  />
                </div>
              )}

              {/* File Drop Zone (Image / PDF / Video) */}
              {(selectedCard === 'IMAGE' || selectedCard === 'PDF' || selectedCard === 'VIDEO') && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-white">
                    Upload {selectedCard === 'IMAGE' ? 'Image File (PNG/JPG/WEBP)' : selectedCard === 'PDF' ? 'PDF / DOCX Notice' : 'Video Clip (MP4/MOV)'}
                  </label>
                  
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        setUploadedFile(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`p-8 border-2 border-dashed rounded-2xl text-center space-y-3 transition-colors ${
                      isDragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                    }`}
                  >
                    <Upload className="w-8 h-8 text-[#E88F6B] mx-auto" />
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {uploadedFile ? uploadedFile.name : 'Drag and drop file here, or click to browse'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {uploadedFile ? `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Max 50MB · Forensic metadata preserved'}
                      </p>
                    </div>

                    <input
                      type="file"
                      id="studio-file-input"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setUploadedFile(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="studio-file-input"
                      className="inline-block px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer transition"
                    >
                      {uploadedFile ? 'Replace File' : 'Browse Local Disk'}
                    </label>
                  </div>
                </div>
              )}

              {/* "Try One" Real Preset Buttons */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                  1-Click Real Presets:
                </span>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedCard('TEXT');
                        setTextInput(preset.text);
                        setErrorMessage(null);
                      }}
                      className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs text-slate-300 hover:text-white transition flex items-center gap-2"
                    >
                      <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded text-[9.5px] font-mono">
                        {preset.tag}
                      </span>
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pipeline Configuration Options */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-3xl space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                Verification Pipeline Modules
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                
                {/* Module 1: Reverse Search */}
                <label className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-start gap-3 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={optReverseSearch}
                    onChange={(e) => setOptReverseSearch(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-white block">Reverse-search media assets</span>
                    <span className="text-slate-400 text-[11px]">Recovers first original frame from wire archives</span>
                  </div>
                </label>

                {/* Module 2: Provenance */}
                <label className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-start gap-3 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={optTraceProvenance}
                    onChange={(e) => setOptTraceProvenance(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-white block">Trace first appearance</span>
                    <span className="text-slate-400 text-[11px]">Maps earliest telegram/web propagation timeline</span>
                  </div>
                </label>

                {/* Module 3: Detect Public Figures */}
                <label className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-start gap-3 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={optDetectEntities}
                    onChange={(e) => setOptDetectEntities(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-white block">Detect public figures & entities</span>
                    <span className="text-slate-400 text-[11px]">NER extraction and official statement reconciliation</span>
                  </div>
                </label>

                {/* Module 4: Deep Archive (Coming Soon) */}
                <label className="p-3.5 bg-slate-950/40 border border-slate-800/60 rounded-2xl flex items-start gap-3 opacity-60 cursor-not-allowed">
                  <input
                    type="checkbox"
                    disabled
                    checked={optDeepArchive}
                    className="mt-0.5 rounded border-slate-800 bg-slate-900 text-slate-600"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-300">Deep historical archive search</span>
                      <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded text-[9px] font-mono">Phase 2</span>
                    </div>
                    <span className="text-slate-500 text-[11px]">Indexed gazette & registrar repositories (2000–2020)</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Launch CTA */}
            <button
              onClick={handleLaunchVerification}
              className="w-full py-4 bg-gradient-to-r from-[#D97757] via-indigo-600 to-[#B0512F] hover:from-[#B0512F] hover:to-[#D97757] text-white font-extrabold rounded-2xl text-sm shadow-xl shadow-[#D97757]/20 transition flex items-center justify-center gap-2 group"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Launch 4-Agent DeepTrust Verification</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        ) : (
          
          /* ========================================================================= */
          /* MODE 2: AGENT PIPELINE RUNNER (LIVE SSE STREAM)                            */
          /* ========================================================================= */
          <div className="space-y-6 animate-fadeIn">
            
            {/* Top Running Banner */}
            <div className="p-6 sm:p-8 bg-[#000D59] border border-slate-800 rounded-3xl space-y-4 shadow-2xl relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#E88F6B]">
                      Running Multi-Agent Rail
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">
                    Verifying Subject Matter...
                  </h2>
                  <p className="text-xs text-slate-300 font-mono max-w-xl truncate">
                    {currentStep}
                  </p>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 self-end sm:self-center">
                  <div className="text-right font-mono">
                    <span className="text-2xl font-bold text-white block">{elapsedSeconds}s</span>
                    <span className="text-[10px] text-slate-400 uppercase">Execution Time</span>
                  </div>
                  <div className="w-14 h-14 relative flex items-center justify-center">
                    <div className="w-full h-full rounded-full border-4 border-indigo-500/20 border-t-[#D97757] animate-spin" />
                    <span className="absolute font-mono font-bold text-xs text-white">{progress}%</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden relative z-10">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-[#D97757] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Vertical Timeline of Stages */}
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-6 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                Pipeline Stage Execution
              </h3>

              <div className="space-y-4">
                {PIPELINE_STAGES.map((stage, idx) => {
                  const status = getStageStatus(stage.id, idx);
                  return (
                    <div
                      key={stage.id}
                      className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                        status === 'ACTIVE'
                          ? 'bg-[#000D59]/60 border-indigo-500 shadow-md ring-1 ring-indigo-500/20'
                          : status === 'COMPLETED'
                          ? 'bg-slate-950/80 border-slate-800'
                          : 'bg-slate-950/30 border-slate-850 opacity-40'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold font-mono flex-shrink-0 mt-0.5 ${
                          status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          status === 'ACTIVE' ? 'bg-[#D97757] text-white animate-pulse' :
                          'bg-slate-800 text-slate-500'
                        }`}>
                          {status === 'COMPLETED' ? <Check className="w-4 h-4 stroke-[3]" /> : `0${idx + 1}`}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-white">{stage.label}</h4>
                            {status === 'ACTIVE' && (
                              <span className="px-2 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-mono text-[9px] font-bold uppercase">
                                In Progress
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{stage.desc}</p>
                        </div>
                      </div>

                      <div className="flex-shrink-0 font-mono text-[11px]">
                        {status === 'COMPLETED' && <span className="text-emerald-400 font-bold">Passed</span>}
                        {status === 'ACTIVE' && <span className="text-[#E88F6B] font-bold">Executing...</span>}
                        {status === 'PENDING' && <span className="text-slate-600">Pending</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
