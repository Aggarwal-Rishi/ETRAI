import React, { useState, useRef, useEffect } from 'react';
import { Layers, Eye, EyeOff, Sliders, ShieldAlert, Sparkles, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

export default function ImageForensicsCompare({ providedImage, originalImage, differences = [] }) {
  const [sliderPos, setSliderPos] = useState(50); // percentage (0 to 100)
  const [showBoxes, setShowBoxes] = useState(true);
  const [activeDiff, setActiveDiff] = useState(null);
  const containerRef = useRef(null);
  const isDragging = useRef(false);

  const DEFAULT_DIFFS = [
    {
      id: 'a',
      label: 'A',
      title: 'Banner text replaced',
      desc: 'Original reads "Monetary Policy Review · August 2026"; circulated version reads "Currency Withdrawal Notice · 1 Oct 2026".',
      meta: 'Inpainting residue on 342×52 px region · JPEG quality mismatch 91 vs 78',
      box: { left: '23%', top: '21%', width: '54%', height: '14%' }
    },
    {
      id: 'b',
      label: 'B',
      title: 'Objects inserted onto podium',
      desc: 'Three bundles of currency inserted onto the podium. No matching object in any frame of the source footage.',
      meta: 'Edge halo 2.1 px · shadow direction inconsistent with scene light by 34°',
      box: { left: '43%', top: '56%', width: '15%', height: '8%' }
    },
    {
      id: 'c',
      label: 'C',
      title: 'Date-time overlay added',
      desc: 'A date-time overlay was burned in reading 01-10-2026 09:41. The frame was captured on 8 Aug 2026 at 11:26.',
      meta: "Font not present in the outlet's graphics kit · added in a second encode pass",
      box: { left: '62%', top: '80%', width: '34%', height: '18%' }
    },
    {
      id: 'd',
      label: 'D',
      title: 'Region cloned to amplify attendance',
      desc: 'The press row on the left was cloned twice to double apparent attendance. Nine heads in original, fifteen in provided version.',
      meta: 'Copy-move detection: 3 duplicate blocks, correlation 0.97',
      box: { left: '1.5%', top: '72%', width: '36%', height: '26%' }
    }
  ];

  const diffList = differences.length > 0 ? differences : DEFAULT_DIFFS;

  const handlePointerDown = (e) => {
    isDragging.current = true;
    updateSlider(e);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    updateSlider(e);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const updateSlider = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const x = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, x)));
  };

  useEffect(() => {
    const handleGlobalUp = () => { isDragging.current = false; };
    window.addEventListener('pointerup', handleGlobalUp);
    return () => window.removeEventListener('pointerup', handleGlobalUp);
  }, []);

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowBoxes(!showBoxes)}
            className={`px-3 py-1.5 rounded-lg border font-medium transition flex items-center gap-1.5 ${
              showBoxes 
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {showBoxes ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {showBoxes ? 'Hide Change Markers' : 'Show Change Markers'}
          </button>
          <button
            onClick={() => setSliderPos(50)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium transition"
          >
            Center Split
          </button>
          <button
            onClick={() => setSliderPos(0)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium transition"
          >
            Show Provided
          </button>
          <button
            onClick={() => setSliderPos(100)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium transition"
          >
            Show Original
          </button>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Drag slider or tap buttons to inspect
        </span>
      </div>

      {/* Interactive Compare Container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="relative w-full aspect-[16/10] bg-slate-950 rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl select-none cursor-ew-resize touch-none"
      >
        {/* Layer 1: Provided (Manipulated) Image Layer */}
        <div className="absolute inset-0 w-full h-full">
          {providedImage ? (
            <img src={providedImage} alt="Provided" className="w-full h-full object-cover" />
          ) : (
            /* Procedural Manipulated SVG Frame */
            <svg viewBox="0 0 640 400" className="w-full h-full bg-slate-900" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="skyP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#334155" />
                  <stop offset="1" stopColor="#1e293b" />
                </linearGradient>
              </defs>
              <rect width="640" height="240" fill="url(#skyP)" />
              <rect y="238" width="640" height="162" fill="#0f172a" />
              {/* Podium & Backdrop */}
              <rect x="52" y="42" width="536" height="198" fill="#1e293b" rx="4" />
              <rect x="150" y="86" width="342" height="52" rx="4" fill="#881337" />
              <text x="321" y="112" textAnchor="middle" fill="#ffe4e6" fontFamily="monospace" fontSize="14" fontWeight="bold">
                CURRENCY WITHDRAWAL
              </text>
              <text x="321" y="128" textAnchor="middle" fill="#f43f5e" fontFamily="monospace" fontSize="11" letterSpacing="1">
                NOTICE · 1 OCT 2026
              </text>
              {/* Figures */}
              <rect x="266" y="252" width="108" height="86" rx="3" fill="#334155" />
              <circle cx="300" cy="222" r="17" fill="#475569" />
              <circle cx="352" cy="228" r="15" fill="#475569" />
              {/* Inserted Fake Bundles */}
              <g fill="#fbbf24">
                <rect x="288" y="238" width="30" height="9" rx="1" />
                <rect x="292" y="230" width="30" height="9" rx="1" />
                <rect x="330" y="240" width="26" height="8" rx="1" />
              </g>
              {/* Crowd Audience */}
              <g fill="#1e293b">
                <circle cx="46" cy="330" r="19" />
                <circle cx="104" cy="338" r="19" />
                <circle cx="162" cy="330" r="19" />
                <circle cx="220" cy="342" r="19" />
                <circle cx="420" cy="340" r="19" />
                <circle cx="478" cy="330" r="19" />
                <circle cx="536" cy="340" r="19" />
              </g>
              {/* Date-time overlay */}
              <rect x="452" y="358" width="176" height="26" rx="3" fill="rgba(0,0,0,0.75)" />
              <text x="540" y="376" textAnchor="middle" fill="#e2e8f0" fontFamily="monospace" fontSize="12">
                01-10-2026 09:41
              </text>
            </svg>
          )}
        </div>

        {/* Layer 2: Original (Archive Wire) Image Layer with Clip Path */}
        <div 
          className="absolute inset-0 w-full h-full transition-none"
          style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
        >
          {originalImage ? (
            <img src={originalImage} alt="Original" className="w-full h-full object-cover" />
          ) : (
            /* Procedural Original SVG Frame */
            <svg viewBox="0 0 640 400" className="w-full h-full bg-slate-900" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="skyA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#1e293b" />
                  <stop offset="1" stopColor="#0f172a" />
                </linearGradient>
              </defs>
              <rect width="640" height="240" fill="url(#skyA)" />
              <rect y="238" width="640" height="162" fill="#020617" />
              {/* Podium & Backdrop */}
              <rect x="52" y="42" width="536" height="198" fill="#1e293b" rx="4" />
              <rect x="150" y="86" width="342" height="52" rx="4" fill="#0f766e" />
              <text x="321" y="112" textAnchor="middle" fill="#ccfbf1" fontFamily="monospace" fontSize="14" fontWeight="bold">
                MONETARY POLICY
              </text>
              <text x="321" y="128" textAnchor="middle" fill="#2dd4bf" fontFamily="monospace" fontSize="11" letterSpacing="1">
                REVIEW · AUGUST 2026
              </text>
              {/* Genuine Figures (No Bundles) */}
              <rect x="266" y="252" width="108" height="86" rx="3" fill="#334155" />
              <circle cx="300" cy="222" r="17" fill="#475569" />
              {/* Original smaller crowd */}
              <g fill="#1e293b">
                <circle cx="46" cy="330" r="19" />
                <circle cx="104" cy="338" r="19" />
                <circle cx="162" cy="330" r="19" />
                <circle cx="478" cy="330" r="19" />
                <circle cx="536" cy="340" r="19" />
              </g>
            </svg>
          )}
        </div>

        {/* Badges */}
        <div className="absolute top-3 left-3 px-2.5 py-1 bg-rose-950/80 border border-rose-500/40 rounded-full text-[10px] font-mono text-rose-300 backdrop-blur-md z-20 pointer-events-none">
          Provided · Circulated Copy
        </div>
        <div className="absolute top-3 right-3 px-2.5 py-1 bg-emerald-950/80 border border-emerald-500/40 rounded-full text-[10px] font-mono text-emerald-300 backdrop-blur-md z-20 pointer-events-none">
          Original · Wire Archive (8 Aug)
        </div>

        {/* Change Marker Bounding Boxes */}
        {showBoxes && diffList.map(diff => (
          <div
            key={diff.id}
            style={diff.box}
            className={`absolute rounded border-2 transition-all duration-200 z-10 ${
              activeDiff === diff.id 
                ? 'border-rose-400 bg-rose-500/20 shadow-lg shadow-rose-500/20 scale-[1.02]' 
                : 'border-rose-500/80 bg-rose-500/5'
            }`}
          >
            <span className="absolute -top-3 -left-1 px-1.5 py-0.2 bg-rose-600 text-white text-[9px] font-mono font-bold rounded">
              {diff.label}
            </span>
          </div>
        ))}

        {/* Split Handle */}
        <div
          style={{ left: `${sliderPos}%` }}
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] z-30 pointer-events-none"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center text-slate-900 font-bold text-xs select-none">
            ⟺
          </div>
        </div>
      </div>

      {/* Difference Itemized Rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        {diffList.map(diff => (
          <div
            key={diff.id}
            onMouseEnter={() => setActiveDiff(diff.id)}
            onMouseLeave={() => setActiveDiff(null)}
            className={`p-3.5 rounded-xl border transition-all text-xs cursor-pointer ${
              activeDiff === diff.id
                ? 'bg-rose-500/10 border-rose-500/40 shadow-sm'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-mono text-[10px] font-bold">
                {diff.label}
              </span>
              <span className="font-semibold text-slate-200">{diff.title}</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed mb-1.5">{diff.desc}</p>
            <p className="text-[10px] font-mono text-rose-400">{diff.meta}</p>
          </div>
        ))}
      </div>

      {/* Forensic Signal Metrics */}
      <div className="grid grid-cols-3 gap-3 pt-1">
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs">
          <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Reverse Search</span>
          <span className="text-slate-200 font-medium">8 Aug 2026 · Wire Archive</span>
        </div>
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs">
          <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">EXIF / C2PA</span>
          <span className="text-rose-400 font-medium">Stripped · No Credential</span>
        </div>
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs">
          <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Manipulation Likelihood</span>
          <span className="text-rose-400 font-bold font-mono">0.96 · Heavy Alteration</span>
        </div>
      </div>
    </div>
  );
}
