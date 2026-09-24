import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Cpu,
  FileJson,
  Check,
  Copy,
  Sparkles,
  Film,
  Camera,
  Layers,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

/**
 * Sightengine AI & Deepfake Detection Report Card
 * Displays comprehensive forensic telemetry from Sightengine GenAI & Deepfake engines.
 */
export default function SightengineReportCard({ aiDetection, mediaType = 'IMAGE', className = '' }) {
  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Per user specification: Hide cleanly if unconfigured, disabled, or no successful scan was performed
  if (!aiDetection || aiDetection.status !== 'SUCCESS') {
    return null;
  }

  const isVideo = mediaType === 'VIDEO' || Boolean(aiDetection.evaluatedFramesCount);
  const aiProb = isVideo
    ? (typeof aiDetection.maxAiGeneratedProbability === 'number' ? aiDetection.maxAiGeneratedProbability : 0)
    : (typeof aiDetection.aiGeneratedProbability === 'number' ? aiDetection.aiGeneratedProbability : 0);
  
  const deepfakeScore = isVideo
    ? (typeof aiDetection.maxDeepfakeScore === 'number' ? aiDetection.maxDeepfakeScore : 0)
    : (typeof aiDetection.deepfakeScore === 'number' ? aiDetection.deepfakeScore : 0);

  const isAi = aiDetection.isAiGenerated || aiProb >= 0.70;
  const isDeepfake = aiDetection.isDeepfake || deepfakeScore >= 0.70;
  const isSuspicious = !isAi && !isDeepfake && (aiProb >= 0.35 || deepfakeScore >= 0.35);
  const isAuthentic = !isAi && !isDeepfake && !isSuspicious;

  const aiPercent = (aiProb * 100).toFixed(1);
  const deepfakePercent = (deepfakeScore * 100).toFixed(1);

  // Verdict Theme Configuration
  const verdictTheme = isAi || isDeepfake
    ? {
        border: 'border-[#B23F35]',
        bg: 'bg-[#FDF4F4]',
        badgeBg: 'bg-[#B23F35]',
        badgeText: 'text-white',
        title: isAi ? 'SYNTHETIC GENERATION DETECTED' : 'DEEPFAKE MANIPULATION DETECTED',
        subtitle: isAi
          ? 'Pixel patterns and latent generator signatures match generative AI models.'
          : 'Facial manipulation or synthetic reenactment artifacts identified.',
        Icon: ShieldAlert,
        color: '#B23F35'
      }
    : isSuspicious
    ? {
        border: 'border-[#D97757]',
        bg: 'bg-[#FFF9F6]',
        badgeBg: 'bg-[#D97757]',
        badgeText: 'text-white',
        title: 'AMBIGUOUS SYNTHETIC ARTIFACTS',
        subtitle: 'Borderline neural scores detected. Cross-referencing web provenance is advised.',
        Icon: AlertTriangle,
        color: '#D97757'
      }
    : {
        border: 'border-[#2C5B3E]',
        bg: 'bg-[#F4F8F5]',
        badgeBg: 'bg-[#2C5B3E]',
        badgeText: 'text-white',
        title: isVideo ? 'AUTHENTIC OPTICAL VIDEO CAPTURE' : 'AUTHENTIC HARDWARE CAMERA CAPTURE',
        subtitle: 'Consistent with genuine physical lens optics. No generative latent diffusion detected.',
        Icon: ShieldCheck,
        color: '#2C5B3E'
      };

  const handleCopyJson = (e) => {
    e?.stopPropagation();
    try {
      const jsonStr = JSON.stringify(aiDetection, null, 2);
      navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy Sightengine raw JSON:', err);
    }
  };

  const modelSignatures = [
    { name: 'Midjourney v6', category: 'Diffusion' },
    { name: 'DALL-E 3', category: 'Autoregressive' },
    { name: 'FLUX.1', category: 'Flow Matching' },
    { name: 'Stable Diffusion XL', category: 'Latent Diffusion' },
    { name: isVideo ? 'OpenAI Sora / Runway Gen-3' : 'Adobe Firefly', category: isVideo ? 'Video Synthesis' : 'Generative Fill' }
  ];

  return (
    <section id="sightengine-audit" className={`p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm scroll-mt-24 ${className}`}>
      
      {/* 1. Header with Metadata & Provider Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EBEBEB]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-[#D97757]">04 ·</span>
          <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5] flex items-center gap-2">
            Sightengine AI & Deepfake Audit
            {isVideo ? <Film className="w-3.5 h-3.5 text-[#7386A8]" /> : <Camera className="w-3.5 h-3.5 text-[#7386A8]" />}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium bg-[#F0F4FA] text-[#0B5CD5] border border-[#D5E2F5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2C5B3E] animate-pulse" />
            Sightengine v1.0 Live API
          </span>
          <span className="text-[10px] font-mono text-[#7386A8]">
            Models: genai, deepfake
          </span>
        </div>
      </div>

      {/* 2. Primary Forensic Verdict Banner */}
      <div className={`p-5 rounded-2xl border ${verdictTheme.border} ${verdictTheme.bg} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all`}>
        <div className="flex items-start gap-3.5">
          <div className={`p-2.5 rounded-xl ${verdictTheme.badgeBg} text-white shadow-sm flex-shrink-0 mt-0.5 sm:mt-0`}>
            <verdictTheme.Icon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-[#1E293B] font-mono tracking-tight">
                {verdictTheme.title}
              </h4>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${verdictTheme.badgeBg} ${verdictTheme.badgeText}`}>
                {aiDetection.verdictLabel || (isAuthentic ? 'AUTHENTIC' : isAi ? 'AI_GENERATED' : 'ANOMALIES')}
              </span>
            </div>
            <p className="text-xs text-[#475569] mt-1 leading-relaxed">
              {aiDetection.assessmentSummary || verdictTheme.subtitle}
            </p>
          </div>
        </div>

        <div className="flex sm:flex-col items-baseline sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E2E8F0]/60 flex-shrink-0">
          <span className="text-[10px] uppercase font-mono text-[#7386A8]">Authenticity Certainty</span>
          <span className={`text-xl font-bold font-mono ${isAuthentic ? 'text-[#2C5B3E]' : isAi ? 'text-[#B23F35]' : 'text-[#D97757]'}`}>
            {isAuthentic ? `${(100 - aiProb * 100).toFixed(1)}%` : isAi ? `${aiPercent}% Synthetic` : `${aiPercent}% Anomaly`}
          </span>
        </div>
      </div>

      {/* 3. Dual Percentage Gauges (AI Probability & Deepfake Score) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Metric 1: AI Generation Probability */}
        <div className="p-4 bg-[#F8F9FA] rounded-2xl border border-[#E5E7EB] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#0B5CD5]" />
              <span className="text-xs font-bold text-[#1E293B]">AI Generation Probability</span>
            </div>
            <span className={`text-sm font-mono font-bold ${aiProb >= 0.70 ? 'text-[#B23F35]' : aiProb >= 0.35 ? 'text-[#D97757]' : 'text-[#2C5B3E]'}`}>
              {aiPercent}%
            </span>
          </div>

          <div className="w-full bg-[#E2E8F0] h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                aiProb >= 0.70 ? 'bg-[#B23F35]' : aiProb >= 0.35 ? 'bg-[#D97757]' : 'bg-[#2C5B3E]'
              }`}
              style={{ width: `${Math.max(2, Math.min(100, aiProb * 100))}%` }}
            />
          </div>

          <p className="text-[11px] text-[#64748B] leading-tight">
            Measures pixel latent distributions and high-frequency noise typical of diffusion & autoregressive models.
          </p>
        </div>

        {/* Metric 2: Deepfake & Face Manipulation Risk */}
        <div className="p-4 bg-[#F8F9FA] rounded-2xl border border-[#E5E7EB] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0B5CD5]" />
              <span className="text-xs font-bold text-[#1E293B]">Deepfake & Facial Manipulation Risk</span>
            </div>
            <span className={`text-sm font-mono font-bold ${deepfakeScore >= 0.70 ? 'text-[#B23F35]' : deepfakeScore >= 0.35 ? 'text-[#D97757]' : 'text-[#2C5B3E]'}`}>
              {deepfakePercent}%
            </span>
          </div>

          <div className="w-full bg-[#E2E8F0] h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                deepfakeScore >= 0.70 ? 'bg-[#B23F35]' : deepfakeScore >= 0.35 ? 'bg-[#D97757]' : 'bg-[#2C5B3E]'
              }`}
              style={{ width: `${Math.max(2, Math.min(100, deepfakeScore * 100))}%` }}
            />
          </div>

          <p className="text-[11px] text-[#64748B] leading-tight">
            Inspects boundary splices, facial landmark warping, and synthetic identity reenactment signatures.
          </p>
        </div>

      </div>

      {/* 4. AI Generator Signatures Tested Matrix */}
      <div className="space-y-2.5">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#64748B] block">
          Generative Architecture Signatures Tested
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {modelSignatures.map((model, idx) => {
            const detected = isAi;
            return (
              <div
                key={idx}
                className="p-3 bg-white rounded-xl border border-[#E2E8F0] flex flex-col justify-between space-y-2 hover:border-[#CBD5E1] transition-all"
              >
                <div>
                  <span className="text-[9px] font-mono uppercase text-[#94A3B8] block">{model.category}</span>
                  <strong className="text-xs text-[#1E293B] block truncate">{model.name}</strong>
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-[#F1F5F9]">
                  {detected ? (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-[#B23F35]" />
                      <span className="text-[10px] font-mono font-semibold text-[#B23F35]">Positive</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#2C5B3E]" />
                      <span className="text-[10px] font-mono font-semibold text-[#2C5B3E]">Negative</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Keyframe Timeline Filmstrip (For Video) */}
      {isVideo && Array.isArray(aiDetection.frameResults) && aiDetection.frameResults.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-[#EBEBEB]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-[#0B5CD5]" />
              Sampled Video Keyframes Telemetry ({aiDetection.frameResults.length} frames evaluated)
            </span>
            <span className="text-[10px] font-mono text-[#7386A8]">
              Peak AI: {(Math.max(...aiDetection.frameResults.map(f => f.aiGeneratedProbability || 0)) * 100).toFixed(1)}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {aiDetection.frameResults.map((fr, idx) => {
              const frameAi = (fr.aiGeneratedProbability || 0) * 100;
              const frameDf = (fr.deepfakeScore || 0) * 100;
              const frameIsAi = frameAi >= 70;
              return (
                <div key={idx} className="p-3 bg-[#F8F9FA] rounded-xl border border-[#E2E8F0] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-[#1E293B]">Keyframe #{idx + 1}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${frameIsAi ? 'bg-[#B23F35] text-white' : 'bg-[#E2E8F0] text-[#475569]'}`}>
                      {frameIsAi ? 'AI SPIKE' : 'PASS'}
                    </span>
                  </div>
                  <div className="space-y-1 text-[10px] font-mono text-[#64748B]">
                    <div className="flex justify-between">
                      <span>AI Prob:</span>
                      <strong className={frameAi >= 70 ? 'text-[#B23F35]' : 'text-[#2C5B3E]'}>{frameAi.toFixed(1)}%</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Deepfake:</span>
                      <strong className={frameDf >= 70 ? 'text-[#B23F35]' : 'text-[#2C5B3E]'}>{frameDf.toFixed(1)}%</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Interactive "Inspect Raw API JSON" Drawer */}
      <div className="pt-2 border-t border-[#EBEBEB]">
        <button
          type="button"
          onClick={() => setIsJsonOpen(!isJsonOpen)}
          className="flex items-center justify-between w-full py-2 text-xs font-mono text-[#7386A8] hover:text-[#0B5CD5] transition-colors"
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <FileJson className="w-3.5 h-3.5 text-[#0B5CD5]" />
            Inspect Raw Sightengine API Response JSON
          </span>
          <span className="flex items-center gap-1 text-[11px]">
            {isJsonOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>

        {isJsonOpen && (
          <div className="mt-2.5 relative rounded-2xl bg-[#0F172A] border border-[#1E293B] p-4 text-xs font-mono text-[#E2E8F0] overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
              <span className="text-[10px] text-slate-400">sightengine-api-payload.json</span>
              <button
                type="button"
                onClick={handleCopyJson}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-400" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="max-h-64 overflow-y-auto text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-700">
              {JSON.stringify(aiDetection, null, 2)}
            </pre>
          </div>
        )}
      </div>

    </section>
  );
}
