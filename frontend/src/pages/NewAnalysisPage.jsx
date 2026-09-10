import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import VerdictBadge from '../components/VerdictBadge';
import ForensicLoadingConsole from '../components/ForensicLoadingConsole';
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
  X,
  Clipboard,
  ClipboardPaste,
  Trash2,
  Camera,
  Link2
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
  const [textInput, setTextInput] = useState(location.state?.initialText || '');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Pipeline Toggles
  const [optReverseSearch, setOptReverseSearch] = useState(true);
  const [optExternalVisualSearch, setOptExternalVisualSearch] = useState(false);
  const [optExternalTranscriptSearch, setOptExternalTranscriptSearch] = useState(false);
  const [optTraceProvenance, setOptTraceProvenance] = useState(true);
  const [optDetectEntities, setOptDetectEntities] = useState(true);
  const [optDeepArchive, setOptDeepArchive] = useState(false);

  // Pipeline Execution State (Runner)
  const [isRunning, setIsRunning] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Connecting to DeepTrust 4-Agent Verification Rail...');
  const [currentStage, setCurrentStage] = useState('INTAKE');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);

  const timerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const pollTimerRef = useRef(null);

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
          detectEntities: optDetectEntities
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

      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-fadeIn ${
        isRunning ? 'max-w-[1720px]' : 'max-w-5xl'
      }`}>
        
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
                { id: 'VIDEO', label: 'Video clip', icon: Film, sub: 'MP4 / MOV / WebM' },
                { id: 'PDF', label: 'PDF document', icon: FileText, sub: 'Notices / Briefs' },
                { id: 'TEXT', label: 'Raw claim', icon: Sparkles, sub: 'Statement text' },
                { id: 'MIXED_URL', label: 'Social / Post', icon: Globe, sub: 'X / TG / Post' }
              ].map(card => {
                const Icon = card.icon;
                const isSelected = selectedCard === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      setSelectedCard(card.id);
                      setErrorMessage(null);
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden group ${
                      isSelected
                        ? 'bg-white border-[#D97757] shadow-md ring-2 ring-[#D97757]/20'
                        : 'bg-white/70 border-[#CECECE] hover:border-[#D97757]/60 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-[#D97757] text-white' : 'bg-[#EFEEE9] text-[#0B5CD5] group-hover:bg-[#F6E7DF] group-hover:text-[#B0512F]'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-[#D97757]" />
                      )}
                    </div>
                    <div className="font-bold text-xs text-[#0B5CD5] block">{card.label}</div>
                    <div className="text-[10px] text-[#7386A8] mt-0.5 font-mono">{card.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Input Zone based on selectedCard */}
            <div className="p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm">
              
              {/* RAW CLAIM TEXT AREA */}
              {selectedCard === 'TEXT' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-[#0B5CD5]">
                      Factual Claim / Statement Text
                    </label>
                    <span className="text-[11px] font-mono text-[#7386A8]">
                      {textInput.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    placeholder="Enter or paste the claim statement to verify (e.g. news headline, policy update, official claim)..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    className="w-full p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl text-xs text-[#0B5CD5] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F6E7DF] placeholder-[#7386A8]"
                  />
                </div>
              )}

              {/* URL INPUT (News URL or Mixed URL) */}
              {(selectedCard === 'NEWS_URL' || selectedCard === 'MIXED_URL') && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-[#0B5CD5]">
                    {selectedCard === 'NEWS_URL' ? 'Article / Webpage URL' : 'Social Post / Telegram / Web Link'}
                  </label>
                  <div className="relative">
                    <Link2 className="w-4 h-4 text-[#7386A8] absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      placeholder="https://example.com/news/article-slug-2026..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl text-xs text-[#0B5CD5] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F6E7DF] placeholder-[#7386A8]"
                    />
                  </div>
                  <p className="text-[11px] text-[#7386A8] font-mono">
                    DeepTrust Agent 1 will extract full article body, author bylines, publication timestamp, and embedded images.
                  </p>
                </div>
              )}

              {/* IMAGE DROP ZONE & CLIPBOARD */}
              {selectedCard === 'IMAGE' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-[#0B5CD5]">
                      Upload Image or Screenshot for Forensics
                    </label>
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F6E7DF] hover:bg-[#E88F6B]/30 text-[#B0512F] text-[11px] font-semibold rounded-lg transition"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      <span>Paste from Clipboard</span>
                    </button>
                  </div>

                  {imagePreviewUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-[#CECECE] bg-[#000D59] p-4 text-center">
                      <img
                        src={imagePreviewUrl}
                        alt="Upload Preview"
                        className="max-h-64 mx-auto rounded-xl object-contain shadow-md"
                      />
                      <div className="mt-3 flex items-center justify-center gap-3">
                        <span className="text-xs font-mono text-[#F0EDE9]">
                          {uploadedFile?.name} ({(uploadedFile?.size / 1024).toFixed(0)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFile(null);
                            setImagePreviewUrl(null);
                          }}
                          className="px-3 py-1 bg-[#8E2F27] text-white text-xs font-semibold rounded-lg hover:bg-[#B23F35] transition"
                        >
                          Remove Image
                        </button>
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
                      className={`p-8 border-2 border-dashed rounded-2xl text-center space-y-3 transition-colors ${
                        isDragOver ? 'border-[#D97757] bg-[#F6E7DF]/30' : 'border-[#CECECE] bg-[#F8F8F6] hover:border-[#D97757]'
                      }`}
                    >
                      <ImageIcon className="w-8 h-8 text-[#D97757] mx-auto" />
                      <div>
                        <p className="text-xs font-semibold text-[#0B5CD5]">
                          Drag and drop image here, or click to browse
                        </p>
                        <p className="text-[11px] text-[#7386A8] font-mono mt-0.5">
                          JPEG, PNG, WEBP · ELA Error Level, Noise Floor & Reverse Visual Search
                        </p>
                      </div>

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
                        className="inline-block px-4 py-2 bg-[#EFEEE9] hover:bg-[#CECECE] text-[#2C4E86] text-xs font-semibold rounded-xl cursor-pointer transition"
                      >
                        Browse Image File
                      </label>
                    </div>
                  )}

                  {/* Optional Claim Context */}
                  <div className="pt-2">
                    <label className="block text-[11px] font-medium text-[#2C4E86] mb-1.5">
                      Optional: Caption or Claim Associated with this Image
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Photo claimed to be taken in New Delhi yesterday showing..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl text-xs text-[#0B5CD5] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F6E7DF] placeholder-[#7386A8]"
                    />
                  </div>
                </div>
              )}

              {/* VIDEO DROP ZONE */}
              {selectedCard === 'VIDEO' && (
                <div className="space-y-4">
                  <label className="block text-xs font-semibold text-[#0B5CD5]">
                    Upload Video Clip for Forensics
                  </label>

                  {videoPreviewUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-[#CECECE] bg-[#000D59] p-4 text-center">
                      <video
                        src={videoPreviewUrl}
                        controls
                        className="max-h-64 mx-auto rounded-xl shadow-md"
                      />
                      <div className="mt-3 flex items-center justify-center gap-3">
                        <span className="text-xs font-mono text-[#F0EDE9]">
                          {uploadedFile?.name} ({(uploadedFile?.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFile(null);
                            setVideoPreviewUrl(null);
                          }}
                          className="px-3 py-1 bg-[#8E2F27] text-white text-xs font-semibold rounded-lg hover:bg-[#B23F35] transition"
                        >
                          Remove Video
                        </button>
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

              {/* 1-Click Real Presets */}
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
                            ? 'With your permission, DeepTrust may upload up to three selected keyframes—not the full video—and search high-confidence visible entity names using configured providers. Frame bytes are not stored in the report.'
                            : 'With your permission, DeepTrust may submit this image and search high-confidence visible entity names using configured Google Lens, Google Vision, SerpApi, or Serper providers.'}
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
                            With your permission, DeepTrust may send up to three short, distinctive spoken phrases to Serper search to match official coverage.
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
          /* MODE 2: FORENSIC COMMAND CONSOLE RUNNER (LIVE SSE STREAM)                 */
          /* ========================================================================= */
          <ForensicLoadingConsole
            jobId={jobId}
            progress={progress}
            currentStep={currentStep}
            currentStage={currentStage}
            elapsedSeconds={elapsedSeconds}
            selectedCard={selectedCard}
            uploadedFile={uploadedFile}
            imagePreviewUrl={imagePreviewUrl}
            videoPreviewUrl={videoPreviewUrl}
            textInput={textInput}
            urlInput={urlInput}
          />
        )}
      </main>
    </div>
  );
}
