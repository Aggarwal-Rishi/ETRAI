import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import VerdictBadge from '../components/VerdictBadge';
import { apiUrl } from '../utils/api';
import { isDebugEnabled, setDebugEnabled } from '../utils/featureFlags';
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
  X,
  Clipboard,
  ClipboardPaste,
  Trash2,
  Camera,
  Link2,
  Terminal,
  Activity,
  Pause,
  Play,
  ChevronDown,
  ChevronUp,
  Copy,
  ShieldAlert,
  Cpu
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
  // Presets are opt-in. Pre-filling one contaminated image/video reports with
  // an unrelated sample claim when users switched input modes.
  const [textInput, setTextInput] = useState(location.state?.initialText || '');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Pipeline Toggles
  const [optReverseSearch, setOptReverseSearch] = useState(true);
  const [optExternalVisualSearch, setOptExternalVisualSearch] = useState(true);
  const [optExternalTranscriptSearch, setOptExternalTranscriptSearch] = useState(false);
  const [optTraceProvenance, setOptTraceProvenance] = useState(true);
  const [optDetectEntities, setOptDetectEntities] = useState(true);
  const [optDetectAi, setOptDetectAi] = useState(true);
  const [optDeepArchive, setOptDeepArchive] = useState(false); // Coming soon

  // Pipeline Execution State (Runner)
  const [isRunning, setIsRunning] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Connecting to DeepTrust 4-Agent Verification Rail...');
  const [currentStage, setCurrentStage] = useState('INTAKE');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);

  const [debugEvents, setDebugEvents] = useState([]);
  const [activeDelay, setActiveDelay] = useState(null);
  const [showDebugConsole, setShowDebugConsole] = useState(true);
  const [debugFilter, setDebugFilter] = useState('ALL'); // 'ALL' | 'AGENT_1' | 'AGENT_2' | 'AGENT_3' | 'AGENT_4' | 'DEEP_RESEARCH'
  const [autoScrollDebug, setAutoScrollDebug] = useState(true);
  const [copiedDebugLogs, setCopiedDebugLogs] = useState(false);
  const [isDebug, setIsDebug] = useState(() => isDebugEnabled());

  useEffect(() => {
    const handleDebugChange = () => setIsDebug(isDebugEnabled());
    window.addEventListener('etrai_debug_change', handleDebugChange);

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        const next = !isDebugEnabled();
        setDebugEnabled(next);
        setIsDebug(next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('etrai_debug_change', handleDebugChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const timerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const pollTimerRef = useRef(null);
  const debugLogsEndRef = useRef(null);

  const stopJobListeners = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Generate and cleanup object URL for image and video previews
  useEffect(() => {
    if (uploadedFile && uploadedFile.type && uploadedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(uploadedFile);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImagePreviewUrl(null);
    }
  }, [uploadedFile]);

  useEffect(() => {
    if (uploadedFile && uploadedFile.type && uploadedFile.type.startsWith('video/')) {
      const url = URL.createObjectURL(uploadedFile);
      setVideoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoPreviewUrl(null);
    }
  }, [uploadedFile]);

  // Global Clipboard Paste Listener (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      // Don't intercept text pastes when user is actively typing in text input/textarea
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputActive = activeTag === 'textarea' || (activeTag === 'input' && document.activeElement.type === 'text');

      if (e.clipboardData && e.clipboardData.items) {
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            const blob = item.getAsFile();
            if (blob) {
              const ext = blob.type.split('/')[1] || 'png';
              const file = new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: blob.type });
              setSelectedCard('IMAGE');
              setUploadedFile(file);
              setErrorMessage(null);
              showToast('Image pasted from clipboard!');
              return;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  // Dedicated Button: Paste from Clipboard API
  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const ext = imageType.split('/')[1] || 'png';
            const file = new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: imageType });
            setSelectedCard('IMAGE');
            setUploadedFile(file);
            setErrorMessage(null);
            showToast('Image pasted from clipboard!');
            return;
          }
        }
      }
      setErrorMessage('No image found in clipboard. Copy an image or screenshot and press Ctrl+V.');
    } catch (err) {
      console.warn('[Clipboard Read Error]:', err);
      setErrorMessage('Clipboard access blocked by browser. Please press Ctrl+V anywhere to paste your image directly.');
    }
  };

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

  useEffect(() => () => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  // Auto-scroll debug terminal
  useEffect(() => {
    if (autoScrollDebug && debugLogsEndRef.current) {
      debugLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debugEvents, autoScrollDebug]);

  const copyDebugLogs = () => {
    const text = debugEvents.map(e => `[${new Date(e.timestamp || e.receivedAt).toISOString()}] [${e.agent || 'System'}] [${e.action || e.eventType || 'EVENT'}]: ${e.detail || e.message || ''} ${e.latencyMs ? `(${e.latencyMs}ms)` : ''}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDebugLogs(true);
      setTimeout(() => setCopiedDebugLogs(false), 2000);
      showToast('Debug telemetry logs copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy logs to clipboard');
    });
  };

  const filterMatches = (e, filter) => {
    if (filter === 'ALL') return true;
    const a = (e.agent || '').toUpperCase();
    if (filter === 'AGENT_1') return a.includes('1') || a.includes('CONTENT') || a.includes('INTAKE');
    if (filter === 'AGENT_2') return a.includes('2') || a.includes('CLAIM');
    if (filter === 'AGENT_3') return a.includes('3') || a.includes('FACT') || a.includes('VERIF');
    if (filter === 'AGENT_4') return a.includes('4') || a.includes('REPORT') || a.includes('SYNTHESIS');
    if (filter === 'DEEP_RESEARCH') return a.includes('DEEP') || a.includes('RESEARCH');
    return true;
  };

  const getAgentPillStyle = (agent = '') => {
    const a = agent.toUpperCase();
    if (a.includes('1')) return 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/40';
    if (a.includes('2')) return 'bg-[#D97757]/30 text-[#E88F6B] border border-[#D97757]/50';
    if (a.includes('3')) return 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/40';
    if (a.includes('4')) return 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/40';
    if (a.includes('DEEP')) return 'bg-purple-900/60 text-purple-300 border border-purple-700/40';
    return 'bg-white/10 text-white';
  };

  // Handle Form Submission
  const handleLaunchVerification = async (e) => {
    if (e) e.preventDefault();
    stopJobListeners();
    setErrorMessage(null);

    // Validation
    if ((selectedCard === 'NEWS_URL' || selectedCard === 'MIXED_URL') && !urlInput.trim()) {
      setErrorMessage('Please enter a valid webpage or article URL.');
      return;
    }
    if (selectedCard === 'IMAGE' && !uploadedFile && !urlInput.trim()) {
      setErrorMessage('Please upload an image file or provide a direct image URL.');
      return;
    }
    if (selectedCard === 'VIDEO' && !uploadedFile) {
      setErrorMessage('Please upload a video file (MP4, WebM, MOV) for verification.');
      return;
    }
    if (selectedCard === 'PDF' && !uploadedFile) {
      setErrorMessage('Please upload a PDF, DOCX, or TXT document.');
      return;
    }
    if (selectedCard === 'TEXT' && !textInput.trim()) {
      setErrorMessage('Please enter claim text for verification.');
      return;
    }

    setIsRunning(true);
    setProgress(10);
    setCurrentStep('Initializing Multi-Agent Verification Rail...');
    setCurrentStage('INTAKE');
    setDebugEvents([]);
    setActiveDelay(null);

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
        formData.append('enableReverseSearch', String(optReverseSearch));
        formData.append('allowExternalVisualSearch', String((selectedCard === 'IMAGE' || selectedCard === 'VIDEO') && optExternalVisualSearch));
        formData.append('allowExternalTranscriptSearch', String(selectedCard === 'VIDEO' && optExternalTranscriptSearch));
        formData.append('traceProvenance', String(optTraceProvenance));
        formData.append('detectEntities', String(optDetectEntities));
        formData.append('enableAiDetection', String((selectedCard === 'IMAGE' || selectedCard === 'VIDEO') ? optDetectAi : false));
        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          inputType,
          url: urlInput.trim() || undefined,
          text: textInput.trim() || undefined,
          selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION'],
          enableReverseSearch: optReverseSearch,
          allowExternalVisualSearch: (selectedCard === 'IMAGE' || selectedCard === 'VIDEO') && optExternalVisualSearch,
          allowExternalTranscriptSearch: selectedCard === 'VIDEO' && optExternalTranscriptSearch,
          traceProvenance: optTraceProvenance,
          detectEntities: optDetectEntities,
          enableAiDetection: (selectedCard === 'IMAGE' || selectedCard === 'VIDEO') ? optDetectAi : false
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
      eventSourceRef.current = eventSource;

      const applyJobState = (state) => {
        if (state.progress !== undefined) setProgress(state.progress);
        if (state.step) setCurrentStep(state.step);
        if (state.stage) setCurrentStage(state.stage);

        // Record live debug telemetry events
        if (Array.isArray(state.debugHistory) && state.debugHistory.length > 0) {
          setDebugEvents(state.debugHistory.map(ev => ({
            ...ev,
            id: ev.id || ev.eventId,
            detail: ev.detail || ev.message || ev.action || 'Executing event',
            message: ev.detail || ev.message || ev.action || 'Executing event',
            action: ev.action || ev.eventType || 'EVENT',
            eventType: ev.action || ev.eventType || 'EVENT',
            agent: ev.agent || 'System',
            receivedAt: Date.now()
          })));
        } else if (state.debugEvent) {
          setDebugEvents(prev => {
            const ev = state.debugEvent;
            const evId = ev.id || ev.eventId;
            if (evId && prev.some(existing => (existing.id || existing.eventId) === evId)) {
              return prev;
            }
            return [...prev.slice(-300), {
              ...ev,
              id: evId,
              detail: ev.detail || ev.message || ev.action || 'Executing event',
              message: ev.detail || ev.message || ev.action || 'Executing event',
              action: ev.action || ev.eventType || 'EVENT',
              eventType: ev.action || ev.eventType || 'EVENT',
              agent: ev.agent || 'System',
              receivedAt: Date.now()
            }];
          });
        }

        // Active delay / bottleneck alert
        if (state.activeDelay !== undefined) {
          setActiveDelay(state.activeDelay);
        }

        if (state.status === 'COMPLETED') {
          stopJobListeners();
          navigate(`/results/${activeJobId}`);
          return true;
        }
        if (state.status === 'FAILED') {
          stopJobListeners();
          setIsRunning(false);
          setErrorMessage(state.error || 'Verification pipeline encountered a failure.');
          return true;
        }
        return false;
      };

      const pollJobState = async () => {
        pollTimerRef.current = null;
        try {
          const pollRes = await fetch(apiUrl(`/api/v1/verify/job/${activeJobId}`), {
            headers,
            credentials: 'include'
          });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.job && applyJobState(pollData.job)) return;
          }
        } catch (_) {
          // A temporary polling failure is retried below while the job remains active.
        }
        if (eventSourceRef.current && !pollTimerRef.current) {
          pollTimerRef.current = setTimeout(pollJobState, 5000);
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const streamData = JSON.parse(event.data);
          if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          applyJobState(streamData);
        } catch (parseErr) {
          console.error('[SSE Parse Error]:', parseErr);
        }
      };

      eventSource.onerror = () => {
        // EventSource reconnects automatically. Poll the authenticated job-state
        // endpoint as a recovery path in case a proxy keeps the stream closed.
        if (eventSourceRef.current === eventSource && !pollTimerRef.current) {
          pollTimerRef.current = setTimeout(pollJobState, 3000);
        }
      };

    } catch (err) {
      stopJobListeners();
      setIsRunning(false);
      setErrorMessage(err.message || 'Pipeline initialization failed.');
    }
  };

  // Pipeline Stages Definition (Chronological ETRAI 4-Agent Execution)
  const PIPELINE_STAGES = [
    { 
      id: 'INTAKE', 
      label: 'Agent 1: Intake & Content Parsing', 
      desc: 'Validates input magic-bytes, extracts OCR/audio transcripts, cleans text payload' 
    },
    { 
      id: 'CLAIMS', 
      label: 'Agent 2: Claim Extraction Engine', 
      desc: 'Decomposes narrative into atomic, verifiable assertions with semantic context' 
    },
    { 
      id: 'FACT_MATCH', 
      label: 'Agent 3: Cross-Source Fact Match & Provenance', 
      desc: 'Queries primary web indices, checks wire archives, and evaluates corroboration signals' 
    },
    { 
      id: 'FORENSICS', 
      label: 'Agent 4: Multi-Signal Synthesis & Forensics', 
      desc: 'Computes explainable trust score, runs ELA media forensics, and produces verified dossier' 
    }
  ];

  const getStageStatus = (stageId, index) => {
    const stageMap = {
      'INTAKE': 0,
      'MEDIA_VALIDATION': 0,
      'MEDIA_METADATA': 0,
      'VISUAL_ANALYSIS': 0,
      'KEYFRAME_EXTRACTION': 0,
      'READING': 0,
      'OCR': 0,
      'VIDEO_CONTEXT': 0,
      'CLAIM_EXTRACTION': 1,
      'ARTICLE_DEEP_RESEARCH': 2,
      'WEB_VERIFICATION': 2,
      'FACT_CHECKING': 2,
      'FACT_MATCH': 2,
      'PROVENANCE': 2,
      'DEEP_RESEARCH': 2,
      'SYNTHESIS': 3,
      'DOSSIER_SYNTHESIS': 3,
      'FORENSICS': 3
    };

    let activeIndex = 0;
    if (stageMap[currentStage] !== undefined) {
      activeIndex = stageMap[currentStage];
    } else {
      if (progress < 25) activeIndex = 0;
      else if (progress < 50) activeIndex = 1;
      else if (progress < 85) activeIndex = 2;
      else activeIndex = 3;
    }

    if (progress >= 100) return 'COMPLETED';
    if (index < activeIndex) return 'COMPLETED';
    if (index === activeIndex) return 'ACTIVE';
    return 'PENDING';
  };

  return (
    <div className="min-h-screen bg-[#FFF6E3] text-[#0B5CD5] flex flex-col font-sans">
      <Navbar />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#000D59] border border-[#D97757] text-[#EDE7DC] text-xs font-mono rounded-full shadow-2xl flex items-center gap-2 animate-slideUp">
          <Sparkles className="w-4 h-4 text-[#E88F6B]" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
        
        {/* ========================================================================= */}
        {/* MODE 1: INTAKE STUDIO (FORM VIEW)                                         */}
        {/* ========================================================================= */}
        {!isRunning ? (
          <div className="space-y-8">
            
            {/* Header */}
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#F6E7DF] text-[#B0512F] border border-[#E88F6B]/30 text-[11px] font-mono font-bold uppercase tracking-wider mb-2">
                <Sparkles className="w-3 h-3 text-[#D97757]" /> Multi-Agent Intake Rail
              </div>
              <h1 className="text-3xl font-extrabold text-[#0B5CD5] tracking-tight">
                AI Content Verification Studio
              </h1>
              <p className="text-xs sm:text-sm text-[#2C4E86] mt-1">
                Select your source asset type to launch the multi-agent evidentiary verification pipeline.
              </p>
            </div>

            {errorMessage && (
              <div className="p-4 bg-[#F7E3E0] border border-[#EBC7C2] rounded-2xl text-xs text-[#8E2F27] flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-[#B23F35] flex-shrink-0" />
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
                  sub: 'MP4 / MOV / WebM'
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
                        ? 'bg-white border-[#D97757] shadow-md ring-2 ring-[#D97757]/20 scale-[1.02]'
                        : 'bg-white border-[#CECECE] hover:border-[#D97757] shadow-xs'
                    }`}
                  >
                    {card.badge && (
                      <span className="absolute -top-2 right-2 px-1.5 py-0.2 bg-[#D97757] text-white rounded text-[9px] font-mono font-bold">
                        {card.badge}
                      </span>
                    )}

                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-xl ${isSelected ? 'bg-[#D97757] text-white' : 'bg-[#EFEEE9] text-[#2C4E86]'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-[#D97757] bg-[#D97757]' : 'border-[#CECECE]'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>

                    <div>
                      <span className="font-bold text-xs text-[#0B5CD5] block truncate">{card.label}</span>
                      <span className="text-[10px] text-[#7386A8] font-mono block truncate">{card.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Conditional Input Field Box */}
            <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 shadow-sm">
              
              {/* URL Input */}
              {(selectedCard === 'NEWS_URL' || selectedCard === 'MIXED_URL') && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#0B5CD5]">Article / Source Webpage URL</label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-[#7386A8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      placeholder="https://news-outlet.com/article/2026/08/policy-notice"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl text-xs text-[#0B5CD5] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F6E7DF] font-mono placeholder-[#7386A8]"
                    />
                  </div>
                </div>
              )}

              {/* Text Area */}
              {selectedCard === 'TEXT' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold text-[#0B5CD5]">Claim Statement / Article Text</label>
                    <span className="text-[11px] font-mono text-[#7386A8]">
                      {textInput.trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste the statement, press note, or forwarded message here..."
                    className="w-full p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl text-xs text-[#0B5CD5] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F6E7DF] leading-relaxed placeholder-[#7386A8]"
                  />
                </div>
              )}

              {/* IMAGE SECTION (Dedicated Paste Option + Preview + Dropzone) */}
              {selectedCard === 'IMAGE' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-[#0B5CD5]">
                      Image Asset Forensics (ELA, EXIF, Duplicate Match)
                    </label>
                    <span className="text-[11px] font-mono text-[#7386A8]">
                      Supports PNG, JPG, JPEG, WEBP
                    </span>
                  </div>

                  {uploadedFile && imagePreviewUrl ? (
                    /* Attached Image Preview Card */
                    <div className="p-5 bg-[#F8F8F6] border border-[#D97757]/40 rounded-2xl space-y-4 shadow-sm">
                      <div className="flex items-center justify-between border-b border-[#CECECE] pb-3">
                        <div className="flex items-center gap-2 text-[#3E7A55] font-mono text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Image Loaded for Forensic Intake</span>
                        </div>
                        <span className="px-2 py-0.5 bg-[#F6E7DF] text-[#B0512F] border border-[#E88F6B]/30 rounded text-[10px] font-mono font-bold uppercase">
                          {uploadedFile.type?.split('/')[1] || 'IMAGE'}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-5">
                        {/* Thumbnail */}
                        <div className="relative w-40 h-40 bg-white border border-[#CECECE] rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 shadow-inner">
                          <img
                            src={imagePreviewUrl}
                            alt="Uploaded preview"
                            className="w-full h-full object-contain"
                          />
                        </div>

                        {/* File Details & Actions */}
                        <div className="flex-1 space-y-3 min-w-0 text-center sm:text-left">
                          <div className="space-y-1">
                            <span className="text-sm font-bold text-[#0B5CD5] block truncate" title={uploadedFile.name}>
                              {uploadedFile.name}
                            </span>
                            <span className="text-xs text-[#7386A8] font-mono block">
                              {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB · {uploadedFile.type || 'image/png'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
                            <button
                              type="button"
                              onClick={handlePasteFromClipboard}
                              className="px-3.5 py-1.5 bg-[#F6E7DF] hover:bg-[#EFD3C6] border border-[#E88F6B]/40 text-[#B0512F] text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                            >
                              <ClipboardPaste className="w-3.5 h-3.5" />
                              <span>Paste Another (Ctrl+V)</span>
                            </button>

                            <input
                              type="file"
                              id="studio-file-input-image"
                              accept="image/*"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setUploadedFile(e.target.files[0]);
                                  setErrorMessage(null);
                                }
                              }}
                              className="hidden"
                            />
                            <label
                              htmlFor="studio-file-input-image"
                              className="px-3.5 py-1.5 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] text-xs font-semibold rounded-xl cursor-pointer transition flex items-center gap-1.5"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Replace File</span>
                            </label>

                            <button
                              type="button"
                              onClick={() => {
                                setUploadedFile(null);
                                setImagePreviewUrl(null);
                              }}
                              className="px-3.5 py-1.5 bg-[#F7E3E0] hover:bg-[#F7D2CC] border border-[#EBC7C2] text-[#8E2F27] text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Dropzone & Paste Box */
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          setUploadedFile(e.dataTransfer.files[0]);
                          setErrorMessage(null);
                        }
                      }}
                      className={`p-8 border-2 border-dashed rounded-2xl text-center space-y-4 transition-colors ${
                        isDragOver ? 'border-[#D97757] bg-[#F6E7DF]/30' : 'border-[#CECECE] bg-[#F8F8F6] hover:border-[#D97757]'
                      }`}
                    >
                      <div className="p-3 bg-[#F6E7DF] border border-[#E88F6B]/30 rounded-2xl w-14 h-14 mx-auto flex items-center justify-center text-[#D97757]">
                        <ImageIcon className="w-7 h-7" />
                      </div>

                      <div className="space-y-1 max-w-md mx-auto">
                        <p className="text-xs font-semibold text-[#0B5CD5]">
                          Paste from clipboard, drag & drop, or browse your device
                        </p>
                        <p className="text-[11px] text-[#7386A8] font-mono">
                          Max 50MB · Preserves camera EXIF, hash signatures & tamper regions
                        </p>
                      </div>

                      {/* Primary Actions: Paste & Browse */}
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={handlePasteFromClipboard}
                          className="px-4 py-2 bg-[#D97757] hover:bg-[#B0512F] text-white text-xs font-semibold rounded-xl shadow-md transition flex items-center gap-2 hover:scale-[1.02]"
                        >
                          <ClipboardPaste className="w-4 h-4" />
                          <span>Paste Image (Ctrl+V)</span>
                        </button>

                        <input
                          type="file"
                          id="studio-file-input-image"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setUploadedFile(e.target.files[0]);
                              setErrorMessage(null);
                            }
                          }}
                          className="hidden"
                        />
                        <label
                          htmlFor="studio-file-input-image"
                          className="px-4 py-2 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] text-xs font-semibold rounded-xl cursor-pointer transition flex items-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          <span>Browse Local Disk</span>
                        </label>
                      </div>

                      {/* Tip Pill */}
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EFEEE9] border border-[#CECECE] rounded-full text-[10.5px] font-mono text-[#2C4E86]">
                        <Sparkles className="w-3 h-3 text-[#D97757]" />
                        <span>Tip: Take a screenshot (Win+Shift+S or PrtScn) and press Ctrl+V directly</span>
                      </div>
                    </div>
                  )}

                  {/* Optional Image URL Input */}
                  <div className="pt-2">
                    <label className="block text-[11px] font-medium text-[#2C4E86] mb-1.5">
                      Or verify an Image by Direct Web URL
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-[#7386A8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        placeholder="https://example.com/press-photo.jpg"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl text-xs text-[#0B5CD5] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F6E7DF] font-mono placeholder-[#7386A8]"
                      />
                    </div>
                  </div>

                  {/* AI Detection Checkbox for Image */}
                  <div className="pt-1">
                    <label className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-2xl flex items-start gap-3 cursor-pointer hover:border-purple-400 transition-colors">
                      <input
                        type="checkbox"
                        checked={optDetectAi}
                        onChange={(e) => setOptDetectAi(e.target.checked)}
                        className="mt-0.5 rounded border-[#AAAAAA] bg-white text-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-purple-600" />
                          <span className="font-semibold text-[#0B5CD5] text-xs">AI-Generated &amp; Deepfake Detection (Sightengine)</span>
                          <span className="px-1.5 py-0.2 bg-purple-100 text-purple-700 font-mono text-[9px] rounded font-bold uppercase">Vision Model</span>
                        </div>
                        <span className="text-[#2C4E86] text-[11px] leading-relaxed block mt-0.5">
                          Scans pixels for generative AI markers (Midjourney, DALL-E, Sora, Flux, Stable Diffusion) and synthetic face-swapping manipulation.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* VIDEO SECTION (Direct File Dropzone + Video Preview) */}
              {selectedCard === 'VIDEO' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-[#0B5CD5]">
                      Video Forensics & Speech Analysis
                    </label>
                    <span className="text-[11px] font-mono text-[#7386A8]">
                      Direct Video File Upload
                    </span>
                  </div>

                  {/* Upload Video File or View Attached Preview */}
                  {uploadedFile && videoPreviewUrl ? (
                    <div className="p-5 bg-[#F8F8F6] border border-[#D97757]/40 rounded-2xl space-y-4 shadow-sm">
                      <div className="flex items-center justify-between border-b border-[#CECECE] pb-3">
                        <div className="flex items-center gap-2 text-[#3E7A55] font-mono text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Video Clip Loaded for Forensic Keyframe Analysis</span>
                        </div>
                        <span className="px-2 py-0.5 bg-[#F6E7DF] text-[#B0512F] border border-[#E88F6B]/30 rounded text-[10px] font-mono font-bold uppercase">
                          {uploadedFile.type?.split('/')[1] || 'VIDEO'}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-5">
                        {/* Video Player Preview */}
                        <div className="relative w-48 max-h-32 bg-black border border-[#CECECE] rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 shadow-inner">
                          <video
                            src={videoPreviewUrl}
                            controls
                            className="w-full h-full max-h-32 object-contain"
                          />
                        </div>

                        {/* Details & Actions */}
                        <div className="flex-1 space-y-3 min-w-0 text-center sm:text-left">
                          <div className="space-y-1">
                            <span className="text-sm font-bold text-[#0B5CD5] block truncate" title={uploadedFile.name}>
                              {uploadedFile.name}
                            </span>
                            <span className="text-xs text-[#7386A8] font-mono block">
                              {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB · {uploadedFile.type || 'video/mp4'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
                            <input
                              type="file"
                              id="studio-file-input-video-replace"
                              accept="video/*"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setUploadedFile(e.target.files[0]);
                                  setErrorMessage(null);
                                }
                              }}
                              className="hidden"
                            />
                            <label
                              htmlFor="studio-file-input-video-replace"
                              className="px-3.5 py-1.5 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] text-xs font-semibold rounded-xl cursor-pointer transition flex items-center gap-1.5"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Replace Video</span>
                            </label>

                            <button
                              type="button"
                              onClick={() => {
                                setUploadedFile(null);
                                setVideoPreviewUrl(null);
                              }}
                              className="px-3.5 py-1.5 bg-[#F7E3E0] hover:bg-[#F7D2CC] border border-[#EBC7C2] text-[#8E2F27] text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          setUploadedFile(e.dataTransfer.files[0]);
                          setErrorMessage(null);
                        }
                      }}
                      className={`p-7 border-2 border-dashed rounded-2xl text-center space-y-3 transition-colors ${
                        isDragOver ? 'border-[#D97757] bg-[#F6E7DF]/30' : 'border-[#CECECE] bg-[#F8F8F6] hover:border-[#D97757]'
                      }`}
                    >
                      <Film className="w-8 h-8 text-[#D97757] mx-auto" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-[#0B5CD5]">
                          Drag and drop video clip here, or click to browse
                        </p>
                        <p className="text-[11px] text-[#7386A8] font-mono">
                          Max 50MB · Supports MP4, WebM, MOV · Keyframe & Voice Splice Forensics
                        </p>
                      </div>

                      <input
                        type="file"
                        id="studio-file-input-video"
                        accept="video/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setUploadedFile(e.target.files[0]);
                            setErrorMessage(null);
                          }
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor="studio-file-input-video"
                        className="inline-block px-4 py-2 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] text-xs font-semibold rounded-xl cursor-pointer transition"
                      >
                        Browse Video File
                      </label>
                    </div>
                  )}

                  {/* Optional Transcript / Context */}
                  <div className="pt-2">
                    <label className="block text-[11px] font-medium text-[#2C4E86] mb-1.5">
                      Optional: Spoken Dialogue / Context Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Speech by official claiming tax policy change at the conference..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl text-xs text-[#0B5CD5] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F6E7DF] placeholder-[#7386A8]"
                    />
                  </div>

                  {/* AI Detection Checkbox for Video */}
                  <div className="pt-1">
                    <label className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-2xl flex items-start gap-3 cursor-pointer hover:border-purple-400 transition-colors">
                      <input
                        type="checkbox"
                        checked={optDetectAi}
                        onChange={(e) => setOptDetectAi(e.target.checked)}
                        className="mt-0.5 rounded border-[#AAAAAA] bg-white text-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-purple-600" />
                          <span className="font-semibold text-[#0B5CD5] text-xs">AI-Generated Video &amp; Deepfake Detection (Sightengine)</span>
                          <span className="px-1.5 py-0.2 bg-purple-100 text-purple-700 font-mono text-[9px] rounded font-bold uppercase">Keyframe AI</span>
                        </div>
                        <span className="text-[#2C4E86] text-[11px] leading-relaxed block mt-0.5">
                          Inspects extracted representative keyframes against Sightengine deepfake and AI synthetic video detectors to detect face-swapping, lip-sync manipulation, and Sora/Runway video generation.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* PDF Document Drop Zone */}
              {selectedCard === 'PDF' && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-[#0B5CD5]">
                    Upload PDF / DOCX Document
                  </label>
                  
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        setUploadedFile(e.dataTransfer.files[0]);
                        setErrorMessage(null);
                      }
                    }}
                    className={`p-8 border-2 border-dashed rounded-2xl text-center space-y-3 transition-colors ${
                      isDragOver ? 'border-[#D97757] bg-[#F6E7DF]/30' : 'border-[#CECECE] bg-[#F8F8F6] hover:border-[#D97757]'
                    }`}
                  >
                    <FileText className="w-8 h-8 text-[#0B5CD5] mx-auto" />
                    <div>
                      <p className="text-xs font-semibold text-[#0B5CD5]">
                        {uploadedFile ? uploadedFile.name : 'Drag and drop PDF/DOCX file here, or click to browse'}
                      </p>
                      <p className="text-[11px] text-[#7386A8] font-mono mt-0.5">
                        {uploadedFile ? `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Max 50MB · OCR and digital signature extraction'}
                      </p>
                    </div>

                    <input
                      type="file"
                      id="studio-file-input-doc"
                      accept=".pdf,.docx,.doc,.txt"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setUploadedFile(e.target.files[0]);
                          setErrorMessage(null);
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="studio-file-input-doc"
                      className="inline-block px-4 py-1.5 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] text-xs font-semibold rounded-xl cursor-pointer transition"
                    >
                      {uploadedFile ? 'Replace File' : 'Browse Local Disk'}
                    </label>
                  </div>
                </div>
              )}

              {/* "Try One" Real Preset Buttons */}
              <div className="pt-2 border-t border-[#CECECE] space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#7386A8] block">
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
                      className="px-3 py-1.5 bg-[#EFEEE9] hover:bg-[#E5E3DC] border border-[#CECECE] rounded-xl text-xs text-[#0B5CD5] transition flex items-center gap-2"
                    >
                      <span className="px-1.5 py-0.2 bg-[#F6E7DF] text-[#B0512F] rounded text-[9.5px] font-mono">
                        {preset.tag}
                      </span>
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pipeline Configuration Options */}
            <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B5CD5] font-mono">
                Verification Pipeline Modules
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                
                {/* Module 1: Reverse Search */}
                <label className="p-3.5 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl flex items-start gap-3 cursor-pointer hover:border-[#D97757]">
                  <input
                    type="checkbox"
                    checked={optReverseSearch}
                    onChange={(e) => setOptReverseSearch(e.target.checked)}
                    className="mt-0.5 rounded border-[#AAAAAA] bg-white text-[#D97757] focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-[#0B5CD5] block">Reverse-search media assets</span>
                    <span className="text-[#7386A8] text-[11px]">Recovers first original frame from wire archives</span>
                  </div>
                </label>

                {/* Explicit consent for external image/video lookup */}
                {(selectedCard === 'IMAGE' || selectedCard === 'VIDEO') && (
                  <>
                    <label className="p-3.5 bg-[#F6E7DF]/30 border border-[#E88F6B]/40 rounded-2xl flex items-start gap-3 cursor-pointer hover:border-[#D97757] sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={optExternalVisualSearch}
                        onChange={(e) => setOptExternalVisualSearch(e.target.checked)}
                        className="mt-0.5 rounded border-[#AAAAAA] bg-white text-[#D97757] focus:ring-0"
                      />
                      <div>
                        <span className="font-semibold text-[#0B5CD5] block">
                          {selectedCard === 'VIDEO' ? 'Search selected video frames externally' : 'Search this image externally'}
                        </span>
                        <span className="text-[#2C4E86] text-[11px] leading-relaxed block mt-0.5">
                          {selectedCard === 'VIDEO'
                            ? 'With your permission, DeepTrust may upload up to three selected keyframes—not the full video—and search high-confidence visible entity names using the configured providers. Frame bytes are not stored in the report.'
                            : 'With your permission, DeepTrust may submit this image and search high-confidence visible entity names using the configured Google Lens, Google Vision, SerpApi, or Serper providers. Image bytes are not stored in the report.'}
                        </span>
                      </div>
                    </label>
                    {selectedCard === 'VIDEO' && (
                      <label className="p-3.5 bg-[#E4EFE7]/30 border border-[#C6DFCF] rounded-2xl flex items-start gap-3 cursor-pointer hover:border-[#3E7A55] sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={optExternalTranscriptSearch}
                          onChange={(e) => setOptExternalTranscriptSearch(e.target.checked)}
                          className="mt-0.5 rounded border-[#AAAAAA] bg-white text-[#3E7A55] focus:ring-0"
                        />
                        <div>
                          <span className="font-semibold text-[#0B5CD5] block">Use transcript excerpts to find the original news</span>
                          <span className="text-[#2C4E86] text-[11px] leading-relaxed block mt-0.5">
                            With your permission, DeepTrust may send up to three short, distinctive spoken phrases and high-confidence public-figure names—not the full transcript, audio, or video—to the configured Serper search provider. The phrases and returned source links are recorded in the report for transparency.
                          </span>
                        </div>
                      </label>
                    )}
                  </>
                )}

                {/* Module 2: Provenance */}
                <label className="p-3.5 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl flex items-start gap-3 cursor-pointer hover:border-[#D97757]">
                  <input
                    type="checkbox"
                    checked={optTraceProvenance}
                    onChange={(e) => setOptTraceProvenance(e.target.checked)}
                    className="mt-0.5 rounded border-[#AAAAAA] bg-white text-[#D97757] focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-[#0B5CD5] block">Trace first appearance</span>
                    <span className="text-[#7386A8] text-[11px]">Maps earliest telegram/web propagation timeline</span>
                  </div>
                </label>

                {/* Module 3: Detect Public Figures */}
                <label className="p-3.5 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl flex items-start gap-3 cursor-pointer hover:border-[#D97757]">
                  <input
                    type="checkbox"
                    checked={optDetectEntities}
                    onChange={(e) => setOptDetectEntities(e.target.checked)}
                    className="mt-0.5 rounded border-[#AAAAAA] bg-white text-[#D97757] focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-[#0B5CD5] block">Detect public figures &amp; entities</span>
                    <span className="text-[#7386A8] text-[11px]">NER extraction and official statement reconciliation</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Launch CTA */}
            <button
              onClick={handleLaunchVerification}
              className="w-full py-4 bg-[#D97757] hover:bg-[#B0512F] text-white font-extrabold rounded-2xl text-sm shadow-xl shadow-[#D97757]/25 transition flex items-center justify-center gap-2 group"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Launch 4-Agent Verification Pipeline</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        ) : (
          
          /* ========================================================================= */
          /* MODE 2: AGENT PIPELINE RUNNER (LIVE SSE STREAM)                            */
          /* ========================================================================= */
          <div className="space-y-6 animate-fadeIn">
            
            {/* Top Running Banner */}
            <div className="p-6 sm:p-8 bg-[#000D59] border border-[rgba(240,237,233,0.16)] rounded-3xl space-y-4 shadow-xl relative overflow-hidden text-[#EDE7DC]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#3E7A55] animate-ping" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#E88F6B]">
                      Running Multi-Agent Rail
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#F0EDE9]">
                    Verifying Subject Matter...
                  </h2>
                  <p className="text-xs text-[#A7B0D4] font-mono max-w-xl truncate">
                    {currentStep}
                  </p>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 self-end sm:self-center">
                  <div className="text-right font-mono">
                    <span className="text-2xl font-bold text-[#F0EDE9] block">{elapsedSeconds}s</span>
                    <span className="text-[10px] text-[#A7B0D4] uppercase">Execution Time</span>
                  </div>
                  <div className="w-14 h-14 relative flex items-center justify-center">
                    <div className="w-full h-full rounded-full border-4 border-[rgba(240,237,233,0.2)] border-t-[#D97757] animate-spin" />
                    <span className="absolute font-mono font-bold text-xs text-[#F0EDE9]">{progress}%</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-[#031246] rounded-full overflow-hidden relative z-10">
                <div
                  className="h-full bg-gradient-to-r from-[#0033C4] to-[#D97757] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Vertical Timeline of Stages */}
            <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B5CD5] font-mono">
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
                          ? 'bg-[#FFF6E3] border-[#D97757] shadow-sm ring-1 ring-[#D97757]/30'
                          : status === 'COMPLETED'
                          ? 'bg-[#F8F8F6] border-[#CECECE]'
                          : 'bg-[#F8F8F6]/40 border-[#CECECE]/50 opacity-50'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold font-mono flex-shrink-0 mt-0.5 ${
                          status === 'COMPLETED' ? 'bg-[#E4EFE7] text-[#2C5B3E] border border-[#C6DFCF]' :
                          status === 'ACTIVE' ? 'bg-[#D97757] text-white animate-pulse' :
                          'bg-[#EFEEE9] text-[#7386A8]'
                        }`}>
                          {status === 'COMPLETED' ? <Check className="w-4 h-4 stroke-[3]" /> : `0${idx + 1}`}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-[#0B5CD5]">{stage.label}</h4>
                            {status === 'ACTIVE' && (
                              <span className="px-2 py-0.2 bg-[#F6E7DF] text-[#B0512F] rounded font-mono text-[9px] font-bold uppercase">
                                In Progress
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#2C4E86] mt-0.5">{stage.desc}</p>
                        </div>
                      </div>

                      <div className="flex-shrink-0 font-mono text-[11px]">
                        {status === 'COMPLETED' && <span className="text-[#3E7A55] font-bold">Passed</span>}
                        {status === 'ACTIVE' && <span className="text-[#D97757] font-bold">Executing...</span>}
                        {status === 'PENDING' && <span className="text-[#7386A8]">Pending</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Delay / Bottleneck Alert Banner */}
            {activeDelay && (
              <div className="p-5 bg-[#FFF2EE] border-2 border-[#D97757] rounded-3xl space-y-3 shadow-md animate-pulse">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-[#B0512F] font-bold text-xs uppercase font-mono">
                    <ShieldAlert className="w-4 h-4 text-[#D97757]" />
                    <span>Active Delay &amp; Bottleneck Inspector</span>
                  </div>
                  <span className="px-2.5 py-0.5 bg-[#D97757] text-white rounded-full font-mono text-[10px] font-bold tracking-wider uppercase">
                    {activeDelay.agent || 'PIPELINE'}
                  </span>
                </div>
                
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-[#0B5CD5]">
                    {activeDelay.action === 'RATE_LIMIT_BACKOFF' || activeDelay.reason === 'RATE_LIMIT_BACKOFF' 
                      ? 'Gemini Rate-Limit / Token Quota Backoff Active'
                      : (activeDelay.action === 'EXTRACTION_STARTED' || activeDelay.reason === 'LLM_WAIT' ? 'Decomposing Claims (High Token Density)...' : (activeDelay.action || activeDelay.title || 'Pipeline Latency Window Active'))}
                  </h4>
                  <p className="text-xs text-[#2C4E86] leading-relaxed">
                    {activeDelay.detail || activeDelay.message || activeDelay.reason || 'The verification rail is waiting on upstream AI/Search API responses or running exponential backoff to respect quota limits.'}
                  </p>
                </div>

                {(activeDelay.waitMs || activeDelay.delayMs) && (
                  <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-[#7386A8]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#D97757]" /> Backoff Duration: <strong className="text-[#0B5CD5]">{((activeDelay.waitMs || activeDelay.delayMs) / 1000).toFixed(1)}s</strong>
                    </span>
                    {activeDelay.attempt && (
                      <span>· Attempt {activeDelay.attempt} of {activeDelay.maxAttempts || 5}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Live Multi-Agent Telemetry & Debug Stream Console */}
            {isDebug && (
            <div className="bg-[#000D59] border border-[rgba(240,237,233,0.16)] rounded-3xl shadow-xl overflow-hidden text-[#EDE7DC]">
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-[rgba(240,237,233,0.1)] flex items-center justify-between gap-4 flex-wrap bg-[#00106A]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#0B5CD5]/30 text-[#E88F6B] border border-[#E88F6B]/30">
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#EDE7DC]">
                        Live Telemetry &amp; Agent Debug Stream
                      </h3>
                      <span className="w-2 h-2 rounded-full bg-[#3E7A55] animate-ping" />
                      <span className="px-2 py-0.2 rounded-full bg-[#0B5CD5] text-[10px] font-mono font-bold text-white">
                        {debugEvents.length} events
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A7B0D4] font-mono">
                      Real-time Serper calls, Gemini LLM prompts, token latencies &amp; stage transitions
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={copyDebugLogs}
                    className="px-3 py-1.5 bg-[#0B5CD5]/30 hover:bg-[#0B5CD5]/50 border border-[#0B5CD5]/50 text-[#EDE7DC] rounded-xl text-xs font-mono transition flex items-center gap-1.5"
                    title="Copy full telemetry log"
                  >
                    {copiedDebugLogs ? <Check className="w-3.5 h-3.5 text-[#3E7A55]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDebugLogs ? 'Copied' : 'Copy Logs'}</span>
                  </button>

                  <button
                    onClick={() => setAutoScrollDebug(!autoScrollDebug)}
                    className={`px-3 py-1.5 border rounded-xl text-xs font-mono transition flex items-center gap-1.5 ${
                      autoScrollDebug
                        ? 'bg-[#3E7A55]/20 border-[#3E7A55]/40 text-[#A7F3D0]'
                        : 'bg-[#EFEEE9]/10 border-white/20 text-[#A7B0D4]'
                    }`}
                    title="Toggle auto-scroll to bottom"
                  >
                    {autoScrollDebug ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
                    <span>Auto-scroll</span>
                  </button>

                  <button
                    onClick={() => setShowDebugConsole(!showDebugConsole)}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-[#EDE7DC] transition"
                  >
                    {showDebugConsole ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {showDebugConsole && (
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Filter Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
                    {[
                      { id: 'ALL', label: 'All Agents' },
                      { id: 'AGENT_1', label: 'Agent 1: Ingestion' },
                      { id: 'AGENT_2', label: 'Agent 2: Claims' },
                      { id: 'AGENT_3', label: 'Agent 3: Verifier' },
                      { id: 'AGENT_4', label: 'Agent 4: Synthesis' },
                      { id: 'DEEP_RESEARCH', label: 'Deep Research' }
                    ].map(filter => (
                      <button
                        key={filter.id}
                        onClick={() => setDebugFilter(filter.id)}
                        className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap text-[11px] ${
                          debugFilter === filter.id
                            ? 'bg-[#D97757] text-white font-bold shadow-xs'
                            : 'bg-white/5 hover:bg-white/10 text-[#A7B0D4]'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  {/* Terminal logs list */}
                  <div className="h-72 overflow-y-auto rounded-2xl bg-[#031246] border border-white/10 p-3.5 space-y-2 font-mono text-[11px] select-text">
                    {debugEvents.filter(e => filterMatches(e, debugFilter)).length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-[#7386A8] text-center space-y-2">
                        <Activity className="w-6 h-6 text-[#A7B0D4] animate-pulse" />
                        <p>Waiting for telemetry signals from verification pipeline...</p>
                        <p className="text-[10px] text-[#A7B0D4]/70">Events will stream here automatically as agents execute</p>
                      </div>
                    ) : (
                      debugEvents
                        .filter(e => filterMatches(e, debugFilter))
                        .map((e, idx) => {
                          const timeStr = new Date(e.timestamp || e.receivedAt).toTimeString().split(' ')[0];
                          const actionText = e.action || e.eventType || '';
                          const isDelayOrWarning = actionText.includes('BACKOFF') || actionText.includes('RETRY') || actionText.includes('RATE_LIMIT') || e.isDelayWarning || e.level === 'WARN';
                          const isError = actionText.includes('FAIL') || e.error || e.level === 'ERROR';
                          const logDetail = e.detail || e.message || actionText || 'Executing step...';

                          return (
                            <div
                              key={e.id || e.eventId || idx}
                              className={`p-2.5 rounded-xl transition flex flex-col sm:flex-row sm:items-baseline gap-2 leading-relaxed ${
                                isError ? 'bg-red-950/40 border border-red-500/30 text-red-200' :
                                isDelayOrWarning ? 'bg-amber-950/40 border border-amber-500/30 text-amber-200' :
                                'bg-white/5 hover:bg-white/10 text-[#EDE7DC]'
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[#7386A8] text-[10px] font-mono">{timeStr}</span>
                                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold uppercase font-mono ${getAgentPillStyle(e.agent)}`}>
                                  {e.agent || 'SYSTEM'}
                                </span>
                                {actionText && (
                                  <span className="text-[10px] text-[#A7B0D4] font-semibold font-mono">
                                    [{actionText}]
                                  </span>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <span className="break-words">{logDetail}</span>
                                {e.latencyMs && (
                                  <span className={`ml-2 px-1.5 py-0.2 rounded text-[9px] font-bold font-mono ${
                                    e.latencyMs < 1000 ? 'bg-emerald-950 text-emerald-300' :
                                    e.latencyMs < 4000 ? 'bg-amber-950 text-amber-300' : 'bg-orange-950 text-orange-300'
                                  }`}>
                                    +{e.latencyMs}ms
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                    <div ref={debugLogsEndRef} />
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
