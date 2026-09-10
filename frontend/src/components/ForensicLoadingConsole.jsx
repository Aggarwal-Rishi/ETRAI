import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Cpu,
  Activity,
  Layers,
  Sparkles,
  Search,
  FileText,
  Image as ImageIcon,
  Film,
  Radio,
  CheckCircle2,
  Clock,
  Zap,
  Check,
  Share2,
  Download,
  Star
} from 'lucide-react';

const AGENTS = [
  {
    key: 'intake',
    name: 'Intake & OCR Agent',
    running: 'Extracting',
    endState: 'Verified',
    desc: 'Validates file payload, parses raw text, extracts EXIF/C2PA metadata and keyframe signals.',
    stageGroup: ['INTAKE', 'VALIDATION', 'READING', 'OCR', 'KEYFRAME_EXTRACTION'],
    minProg: 5,
    maxProg: 25,
    lines: [
      'Validating payload structure and signatures',
      'Parsing EXIF & perceptual visual hash',
      'Deconstructing OCR & transcript timestamps',
      'Content extraction complete and verified'
    ]
  },
  {
    key: 'claims',
    name: 'Claim & Observation Extractor',
    running: 'Deconstructing',
    endState: 'Extracted',
    desc: 'Breaks input into discrete factual propositions, entity relationships, and temporal anchors.',
    stageGroup: ['CLAIMS', 'CLAIM_EXTRACTION'],
    minProg: 25,
    maxProg: 55,
    lines: [
      'Scanning for core factual assertions',
      'Isolating entity-predicate relationships',
      'Assigning claim verification priorities',
      '5 discrete verifiable claims indexed'
    ]
  },
  {
    key: 'forensics',
    name: 'Fact & Media Forensics Engine',
    running: 'Cross-verifying',
    endState: 'Verified',
    desc: 'Queries wire archives, tests error-level analysis, reverse image search, and source credibility.',
    stageGroup: ['FORENSICS', 'FACT_MATCH', 'ARTICLE_DEEP_RESEARCH', 'WEB_VERIFICATION', 'MEDIA_ANALYSIS'],
    minProg: 50,
    maxProg: 85,
    lines: [
      'Querying Google Lens & Serper wire databases',
      'Cross-referencing authorized government records',
      'Sampling noise floor and double-compression residue',
      'Evidentiary consensus established'
    ]
  },
  {
    key: 'synthesis',
    name: 'Dossier Synthesis & Explainability',
    running: 'Synthesizing',
    endState: 'Complete',
    desc: 'Computes explainable trust scores, calculates factor weights, and compiles immutable audit dossier.',
    stageGroup: ['REPORT', 'REPORT_GENERATION', 'COMPLETED'],
    minProg: 80,
    maxProg: 100,
    lines: [
      'Weighting source corroboration factors',
      'Synthesizing multi-agent consensus scores',
      'Generating explainable factor breakdown',
      'Final verification audit trail ready'
    ]
  }
];

export default function ForensicLoadingConsole({
  jobId,
  progress = 0,
  currentStep = 'Initializing Multi-Agent Verification Rail...',
  currentStage = 'INTAKE',
  elapsedSeconds = 0,
  selectedCard = 'TEXT',
  uploadedFile = null,
  imagePreviewUrl = null,
  videoPreviewUrl = null,
  textInput = '',
  urlInput = ''
}) {
  const canvasRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [activeStarRating, setActiveStarRating] = useState(0);
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Maintain real-time log list
  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const newEntry = { time: timestamp, text: currentStep };
    setLogs(prev => {
      if (prev.length > 0 && prev[0].text === currentStep) return prev;
      return [newEntry, ...prev.slice(0, 15)];
    });
  }, [currentStep, currentStage]);

  // Telemetry details
  const displayId = jobId ? `JOB-${jobId.slice(0, 8).toUpperCase()}` : 'JOB-INIT';
  let payloadDesc = 'Text snippet';
  if (uploadedFile) payloadDesc = `${uploadedFile.name} (${(uploadedFile.size / 1024).toFixed(0)} KB)`;
  else if (urlInput) payloadDesc = urlInput.replace(/^https?:\/\//, '').slice(0, 28) + '...';
  else if (textInput) payloadDesc = `${textInput.length} chars text`;

  // Canvas visual scan animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let beamY = 0;
    let beamDirection = 1;
    let particles = [];

    // Preload image if available
    let bgImg = null;
    if (imagePreviewUrl) {
      bgImg = new Image();
      bgImg.src = imagePreviewUrl;
    }

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // 1. Background fill
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#000D59');
      bgGrad.addColorStop(0.6, '#031246');
      bgGrad.addColorStop(1, '#000836');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Draw user image if available, else draw geometric waveform/grid
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        const scale = Math.min(w / bgImg.naturalWidth, h / bgImg.naturalHeight);
        const nw = bgImg.naturalWidth * scale;
        const nh = bgImg.naturalHeight * scale;
        const nx = (w - nw) / 2;
        const ny = (h - nh) / 2;
        ctx.drawImage(bgImg, nx, ny, nw, nh);
        ctx.restore();
      } else {
        // Futuristic grid
        ctx.strokeStyle = 'rgba(217, 119, 87, 0.12)';
        ctx.lineWidth = 1;
        const step = 28;
        ctx.beginPath();
        for (let x = 0; x <= w; x += step) {
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, h);
        }
        for (let y = 0; y <= h; y += step) {
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(w, y + 0.5);
        }
        ctx.stroke();

        // Waveform
        ctx.save();
        ctx.strokeStyle = 'rgba(11, 92, 213, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const time = Date.now() / 400;
        for (let x = 0; x < w; x += 4) {
          const y = h / 2 + Math.sin(x * 0.03 + time) * 24 + Math.cos(x * 0.015 - time) * 16;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 3. Laser scan beam sweep
      beamY += 1.8 * beamDirection;
      if (beamY > h) {
        beamY = h;
        beamDirection = -1;
      } else if (beamY < 0) {
        beamY = 0;
        beamDirection = 1;
      }

      // Laser beam gradient
      ctx.save();
      const beamGrad = ctx.createLinearGradient(0, beamY - 45, 0, beamY + 15);
      beamGrad.addColorStop(0, 'rgba(217, 119, 87, 0)');
      beamGrad.addColorStop(0.7, 'rgba(217, 119, 87, 0.18)');
      beamGrad.addColorStop(0.95, 'rgba(246, 231, 223, 0.7)');
      beamGrad.addColorStop(1, 'rgba(217, 119, 87, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, beamY - 45, w, 60);

      // Intense laser line
      ctx.fillStyle = '#D97757';
      ctx.shadowColor = '#D97757';
      ctx.shadowBlur = 10;
      ctx.fillRect(0, beamY - 1, w, 2);
      ctx.restore();

      // 4. Particle sparks along the laser line
      if (particles.length < 35 && Math.random() < 0.4) {
        particles.push({
          x: Math.random() * w,
          y: beamY + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 20,
          vy: -8 - Math.random() * 25,
          life: 1.0,
          size: 1 + Math.random() * 2,
          color: Math.random() > 0.4 ? '#D97757' : '#F6E7DF'
        });
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * 0.016;
        p.y += p.vy * 0.016;
        p.life -= 0.025;
        if (p.life <= 0 || p.y < 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1.0;

      // 5. Targeting bracket overlays (bounding boxes)
      const boxes = [
        { x: 30, y: 35, w: 140, h: 70, label: 'Entity Vector · 94%' },
        { x: w - 190, y: 45, w: 160, h: 80, label: 'Authenticity Index · 89%' },
        { x: 45, y: h - 110, w: 170, h: 65, label: 'Pixel Consistency · 97%' }
      ];

      boxes.forEach(b => {
        ctx.save();
        ctx.strokeStyle = 'rgba(217, 119, 87, 0.65)';
        ctx.lineWidth = 1.2;
        const k = 10;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(b.x, b.y + k);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x + k, b.y);
        // Top-right
        ctx.moveTo(b.x + b.w - k, b.y);
        ctx.lineTo(b.x + b.w, b.y);
        ctx.lineTo(b.x + b.w, b.y + k);
        // Bottom-right
        ctx.moveTo(b.x + b.w, b.y + b.h - k);
        ctx.lineTo(b.x + b.w, b.y + b.h);
        ctx.lineTo(b.x + b.w - k, b.y + b.h);
        // Bottom-left
        ctx.moveTo(b.x + k, b.y + b.h);
        ctx.lineTo(b.x, b.y + b.h);
        ctx.lineTo(b.x, b.y + b.h - k);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 13, 89, 0.85)';
        ctx.fillRect(b.x + 2, b.y - 14, ctx.measureText(b.label).width + 12, 14);
        ctx.fillStyle = '#F6E7DF';
        ctx.font = '500 10px Roboto, sans-serif';
        ctx.fillText(b.label, b.x + 6, b.y - 3);
        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [imagePreviewUrl]);

  // Helper to determine agent status
  const getAgentStatus = (agent) => {
    const isStageActive = agent.stageGroup.some(sg =>
      String(currentStage || '').toUpperCase().includes(sg)
    );
    if (progress >= agent.maxProg) return { state: 'COMPLETED', label: agent.endState, pct: 100 };
    if (isStageActive || (progress >= agent.minProg && progress < agent.maxProg)) {
      const p = Math.min(100, Math.max(15, Math.round(((progress - agent.minProg) / (agent.maxProg - agent.minProg)) * 100)));
      return { state: 'ACTIVE', label: agent.running, pct: p };
    }
    return { state: 'QUEUED', label: 'Queued', pct: 0 };
  };

  // Estimated time calculation
  const estRemaining = Math.max(1, Math.round((100 - progress) / 8));

  return (
    <div className="space-y-6 animate-fadeIn font-sans">
      
      {/* ========================================================================= */}
      {/* MASTHEAD BAR                                                              */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#CECECE]/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#000D59] border border-[#D97757]/40 flex items-center justify-center shadow-md">
            <ShieldCheck className="w-5 h-5 text-[#D97757]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0B5CD5] tracking-tight flex items-center gap-2">
              DeepTrust <span>Forensic Console</span>
            </h2>
            <p className="text-xs text-[#7386A8]">Multi-agent evidentiary verification and provenance pipeline</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1 bg-white border border-[#CECECE] rounded-lg text-xs text-[#2C4E86] font-mono shadow-sm">
            Engine: <b className="text-[#0B5CD5]">Multi-Agent v4.2</b>
          </div>
          <div className="px-3 py-1 bg-white border border-[#CECECE] rounded-lg text-xs text-[#2C4E86] font-mono shadow-sm">
            Mode: <b className="text-[#D97757]">Deep Forensics</b>
          </div>
          <div className="px-3 py-1 bg-[#E4EFE7] border border-[#C6DFCF] rounded-lg text-xs text-[#2C5B3E] font-mono font-semibold flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#3E7A55] animate-ping" />
            <span>4 Agents Active</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2-COLUMN COMMAND CONSOLE                                                  */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ----------------------------------------------------------------------- */}
        {/* LEFT COLUMN: Visual Stage, Telemetry & Actions (7 Cols)                 */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Main Visual Stage Panel */}
          <div className="bg-white border border-[#CECECE] rounded-3xl overflow-hidden shadow-sm">
            
            <div className="px-5 py-3.5 border-b border-[#EFEEE9] flex items-center justify-between bg-[#F8F8F6]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#D97757]" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#0B5CD5]">
                  Forensic Scan Stage
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#7386A8]">
                Pass 1 · Real-Time Visualizer
              </span>
            </div>

            {/* Interactive Canvas Frame */}
            <div className="p-4 bg-[#F8F8F6]">
              <div className="relative rounded-2xl overflow-hidden border border-[#000D59] shadow-xl bg-[#000D59]">
                
                {/* Corner HUD Reticles */}
                <span className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-[#D97757] z-20 pointer-events-none" />
                <span className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-[#D97757] z-20 pointer-events-none" />
                <span className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-[#D97757] z-20 pointer-events-none" />
                <span className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-[#D97757] z-20 pointer-events-none" />

                {/* Tags */}
                <div className="absolute top-3 left-10 z-20 px-2.5 py-0.5 bg-[#000D59]/80 border border-[#D97757]/40 rounded text-[10px] font-mono text-[#F6E7DF] tracking-wider uppercase backdrop-blur-sm">
                  Deep Scan Active
                </div>
                <div className="absolute top-3 right-10 z-20 px-2.5 py-0.5 bg-[#000D59]/80 border border-[#CECECE]/30 rounded text-[10px] font-mono text-[#A7B0D4] tracking-wider backdrop-blur-sm">
                  {displayId}
                </div>

                {/* Canvas */}
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={320}
                  className="w-full h-64 sm:h-72 object-cover block"
                />

                {/* Bottom Frame Readout Foot */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#000836] via-[#000D59]/90 to-transparent z-20 space-y-2 pointer-events-none">
                  <div className="flex items-end justify-between gap-4">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="text-xs font-mono font-semibold text-[#F6E7DF] truncate">
                        {currentStep}
                      </div>
                      <div className="text-[11px] font-mono text-[#A7B0D4]">
                        Estimated time remaining: <b className="text-[#F0EDE9]">{estRemaining}s</b> · 4 agents in parallel
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 font-mono">
                      <span className="text-2xl font-black text-white leading-none">{progress}</span>
                      <span className="text-xs font-bold text-[#E88F6B] ml-0.5">%</span>
                      <div className="text-[9px] text-[#A7B0D4] uppercase tracking-wider">Analyzed</div>
                    </div>
                  </div>

                  {/* Glowing Progress Track */}
                  <div className="w-full h-1.5 bg-[rgba(240,237,233,0.18)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#0033C4] via-[#D97757] to-[#3E7A55] transition-all duration-300 rounded-full shadow-[0_0_12px_rgba(217,119,87,0.8)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Telemetry Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-4 border-t border-[#CECECE]/60 text-xs font-mono">
                <div className="p-2.5 bg-white border border-[#CECECE] rounded-xl">
                  <span className="text-[10px] text-[#7386A8] uppercase block">Analysis ID</span>
                  <span className="font-bold text-[#0B5CD5] truncate block mt-0.5">{displayId}</span>
                </div>
                <div className="p-2.5 bg-white border border-[#CECECE] rounded-xl">
                  <span className="text-[10px] text-[#7386A8] uppercase block">Type</span>
                  <span className="font-bold text-[#0B5CD5] block mt-0.5">{selectedCard}</span>
                </div>
                <div className="p-2.5 bg-white border border-[#CECECE] rounded-xl sm:col-span-1 col-span-2">
                  <span className="text-[10px] text-[#7386A8] uppercase block">Payload</span>
                  <span className="font-bold text-[#2C4E86] truncate block mt-0.5" title={payloadDesc}>
                    {payloadDesc}
                  </span>
                </div>
                <div className="p-2.5 bg-white border border-[#CECECE] rounded-xl">
                  <span className="text-[10px] text-[#7386A8] uppercase block">Signal</span>
                  <span className="font-bold text-[#3E7A55] block mt-0.5">High (98%)</span>
                </div>
                <div className="p-2.5 bg-white border border-[#CECECE] rounded-xl">
                  <span className="text-[10px] text-[#7386A8] uppercase block">Elapsed</span>
                  <span className="font-bold text-[#D97757] block mt-0.5">{elapsedSeconds}s</span>
                </div>
              </div>
            </div>

            {/* Action Bar (Disabled while scanning) */}
            <div className="px-5 py-3 bg-[#F8F8F6] border-t border-[#EFEEE9] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled
                  className="px-3 py-1.5 bg-white border border-[#CECECE] rounded-xl text-[#7386A8] cursor-not-allowed flex items-center gap-1.5 opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save PDF</span>
                </button>
                <button
                  type="button"
                  disabled
                  className="px-3 py-1.5 bg-white border border-[#CECECE] rounded-xl text-[#7386A8] cursor-not-allowed flex items-center gap-1.5 opacity-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsRatingOpen(prev => !prev)}
                  className="px-3 py-1.5 bg-white border border-[#CECECE] hover:border-[#D97757] text-[#0B5CD5] rounded-xl flex items-center gap-1.5 transition"
                >
                  <Star className="w-3.5 h-3.5 text-[#D97757]" />
                  <span>Feedback</span>
                </button>
              </div>
              <span className="text-[11px] font-mono text-[#7386A8]">
                Full dossier unlocks at 100%
              </span>
            </div>

            {/* Interactive Rating Feedback Drawer */}
            {isRatingOpen && (
              <div className="p-4 bg-[#FFF6E3] border-t border-[#D97757]/30 space-y-3 animate-fadeIn text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0B5CD5]">How responsive is this verification rail?</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setActiveStarRating(star)}
                        className={`p-1 transition ${activeStarRating >= star ? 'text-[#D97757]' : 'text-[#CECECE]'}`}
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </button>
                    ))}
                  </div>
                </div>
                {ratingSubmitted ? (
                  <p className="text-[#3E7A55] font-semibold text-[11px]">✓ Thank you for your feedback!</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Optional notes or detector feedback..."
                      className="flex-1 px-3 py-1.5 bg-white border border-[#CECECE] rounded-xl text-xs text-[#0B5CD5] focus:outline-none focus:border-[#D97757]"
                    />
                    <button
                      type="button"
                      onClick={() => setRatingSubmitted(true)}
                      className="px-4 py-1.5 bg-[#D97757] hover:bg-[#B0512F] text-white font-bold rounded-xl text-xs transition"
                    >
                      Send
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* RIGHT COLUMN: Agent Cluster & Live Log Terminal (5 Cols)                */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Agent Cluster Card */}
          <div className="bg-white border border-[#CECECE] rounded-3xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#EFEEE9]">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#0B5CD5]" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#0B5CD5]">
                  Agent Cluster
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#3E7A55] font-semibold">
                4 Parallel Runners
              </span>
            </div>

            {/* List of Agents */}
            <div className="space-y-3">
              {AGENTS.map((agent, idx) => {
                const status = getAgentStatus(agent);
                return (
                  <div
                    key={agent.key}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2 ${
                      status.state === 'ACTIVE'
                        ? 'bg-[#FFF6E3] border-[#D97757] shadow-sm ring-1 ring-[#D97757]/30'
                        : status.state === 'COMPLETED'
                        ? 'bg-[#F8F8F6] border-[#CECECE]'
                        : 'bg-[#F8F8F6]/50 border-[#CECECE]/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            status.state === 'ACTIVE'
                              ? 'bg-[#D97757] animate-ping'
                              : status.state === 'COMPLETED'
                              ? 'bg-[#3E7A55]'
                              : 'bg-[#7386A8]'
                          }`}
                        />
                        <h4 className="text-xs font-bold text-[#0B5CD5]">
                          {agent.name}
                        </h4>
                      </div>
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                          status.state === 'ACTIVE'
                            ? 'bg-[#F6E7DF] text-[#B0512F]'
                            : status.state === 'COMPLETED'
                            ? 'bg-[#E4EFE7] text-[#2C5B3E]'
                            : 'bg-[#EFEEE9] text-[#7386A8]'
                        }`}
                      >
                        {status.label}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#2C4E86] leading-relaxed line-clamp-2">
                      {agent.desc}
                    </p>

                    {/* Agent Micro Progress Bar */}
                    <div className="w-full h-1 bg-[#CECECE]/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          status.state === 'COMPLETED'
                            ? 'bg-[#3E7A55]'
                            : status.state === 'ACTIVE'
                            ? 'bg-[#D97757]'
                            : 'bg-transparent'
                        }`}
                        style={{ width: `${status.pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Terminal Log Stream */}
          <div className="bg-[#000D59] border border-[rgba(240,237,233,0.16)] rounded-3xl p-4 space-y-3 shadow-xl text-[#EDE7DC]">
            <div className="flex items-center justify-between pb-2 border-b border-[rgba(240,237,233,0.12)]">
              <div className="flex items-center gap-2 text-xs font-mono text-[#E88F6B]">
                <Zap className="w-3.5 h-3.5 text-[#D97757]" />
                <span className="uppercase font-bold tracking-wider">Live System Stream</span>
              </div>
              <span className="text-[10px] font-mono text-[#A7B0D4]">SSE Connected</span>
            </div>

            <div className="h-44 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1 scrollbar-thin">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${
                    i === 0 ? 'text-[#F0EDE9] font-bold' : 'text-[#A7B0D4]'
                  }`}
                >
                  <span className="text-[#D97757] select-none flex-shrink-0">[{log.time}]</span>
                  <span className="truncate">{log.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
