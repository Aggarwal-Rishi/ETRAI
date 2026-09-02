import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers,
  Eye,
  EyeOff,
  Sliders,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Maximize2,
  Minimize2,
  ExternalLink,
  Split,
  Camera,
  X,
  Check,
  RefreshCw,
  Search
} from 'lucide-react';
import { apiUrl } from '../utils/api';

export default function ImageForensicsCompare({ images = [], reportData = {}, providedImage, originalImage, differences = [] }) {
  // If reportData has images array or imageForensics, extract the image item
  const imageList = Array.isArray(images) && images.length > 0
    ? images
    : (reportData?.images && reportData.images.length > 0
        ? reportData.images
        : (reportData?.mediaAnalysis?.images && reportData.mediaAnalysis.images.length > 0
            ? reportData.mediaAnalysis.images
            : (reportData?.mediaAnalysis?.imageForensics?.reportItem
                ? [reportData.mediaAnalysis.imageForensics.reportItem]
                : [])));

  // Fallback item if empty
  const primaryItem = imageList.length > 0 ? imageList[0] : {
    filename: reportData?.sourceTitle?.replace(/^Photo:\s*/, '') || 'uploaded_photo.jpg',
    dimensions: '1600 × 1000',
    fileSize: '2.4 MB',
    formatQuality: 'JPEG q78',
    originalFound: 'Reverse search unavailable or inconclusive',
    originalFoundStatus: 'UNVERIFIED',
    originalFoundColor: 'ochre',
    exifStatus: 'Stripped · no content credential',
    exifState: 'STRIPPED',
    changes: ['No detected edits'],
    changesCount: 0,
    manipulationLikelihood: '0.12',
    manipulationRisk: 'LOW',
    chipVerdict: 'v-unv',
    chipText: 'No manipulation signal found',
    uploadedImageDataUrl: null,
    providedImageUrl: null,
    originalImageUrl: null,
    diffs: []
  };

  const [selectedAsset, setSelectedAsset] = useState(primaryItem);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sliderPos, setSliderPos] = useState(50); // percentage (0 to 100)
  const [showBoxes, setShowBoxes] = useState(true);
  const [activeDiff, setActiveDiff] = useState(null);

  const [leftLoading, setLeftLoading] = useState(true);
  const [rightLoading, setRightLoading] = useState(true);
  const [leftError, setLeftError] = useState(false);
  const [rightError, setRightError] = useState(false);
  const [manualOriginalSrc, setManualOriginalSrc] = useState(null);

  const containerRef = useRef(null);
  const isDragging = useRef(false);

  // Sync selected asset if primary item changes
  useEffect(() => {
    if (imageList.length > 0) {
      setSelectedAsset(imageList[0]);
    }
  }, [imageList]);

  // Lock body scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (!isModalOpen) return undefined;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

  const diffList = (selectedAsset.diffs && selectedAsset.diffs.length > 0)
    ? selectedAsset.diffs
    : (differences.length > 0 ? differences : selectedAsset.diffs || []);

  const hasOriginal = ['FOUND', 'CANDIDATE'].includes(selectedAsset.originalFoundStatus) && Boolean(
    selectedAsset.originalImageUrl || selectedAsset.originalUrl || originalImage
  );

  // Determine Real Image Sources
  const providedSrc = selectedAsset.uploadedImageDataUrl ||
    selectedAsset.providedImageUrl ||
    reportData?.mediaAnalysis?.file?.url ||
    providedImage ||
    null;

  const rawOriginalUrl = selectedAsset.originalImageUrl ||
    selectedAsset.originalUrl ||
    originalImage ||
    null;

  const originalSrc = manualOriginalSrc || (rawOriginalUrl
    ? (rawOriginalUrl.startsWith('data:')
        ? rawOriginalUrl
        : apiUrl(`/api/v1/verify/proxy-image?url=${encodeURIComponent(rawOriginalUrl)}`))
    : null);

  const sourceComparison = selectedAsset?.sourceContextComparison ||
    reportData?.mediaAnalysis?.imageSourceContextComparison ||
    reportData?.imageSourceContextComparison ||
    null;

  const comparisonTone = sourceComparison?.status === 'MATCHED'
    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
    : sourceComparison?.status === 'CONTRADICTED'
      ? 'border-rose-500/30 bg-rose-500/5 text-rose-300'
      : 'border-amber-500/30 bg-amber-500/5 text-amber-300';

  const updateSlider = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const x = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, Math.round(x))));
  };

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

  useEffect(() => {
    const handleGlobalUp = () => { isDragging.current = false; };
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, []);

  // Keyboard navigation on slider handle
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSliderPos(prev => Math.max(0, prev - 4));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSliderPos(prev => Math.min(100, prev + 4));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSliderPos(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSliderPos(100);
    }
  };

  // Thumbnail Preview: Uses real uploaded image if available, else SVG fallback
  const renderThumbnail = (asset) => {
    const realImgSrc = asset.uploadedImageDataUrl || asset.providedImageUrl || providedImage;
    if (realImgSrc) {
      return (
        <img
          src={realImgSrc}
          alt={asset.filename}
          className="w-full h-full object-cover"
        />
      );
    }

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 p-2">
        <ImageIcon className="w-8 h-8 mb-1 opacity-60 text-slate-400" />
        <span className="text-[10px] font-mono uppercase tracking-wider">{asset.formatQuality || 'Image'}</span>
      </div>
    );
  };

  return (
    <section id="image-forensics" className="space-y-6 scroll-mt-24">
      {/* 1. ASSET LISTING (Matching deepTrust Reference Design) */}
      <div className="card pad p-6 bg-white border border-[#CECECE] rounded-3xl space-y-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#CECECE] pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#D97757]">04 ·</span>
            <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-[#0B5CD5] flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#D97757]" />
              Image: Provided vs. Original Forensics
            </h2>
          </div>
          <span className="text-xs text-[#7386A8] font-mono">
            {hasOriginal
              ? `${selectedAsset.originalFoundStatus === 'CANDIDATE' ? 'Comparison candidate' : 'Original recovered'}: ${selectedAsset.originalFound}`
              : 'Reverse search index & metadata'}
          </span>
        </div>

        <div>
          <div className="rounded-2xl border border-[#CECECE] bg-[#F8F8F6] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#B98520]">
              <Search className="w-4 h-4" /> Reverse-image evidence
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="block text-[10px] uppercase text-[#7386A8]">Provider</span><strong className="text-[#0B5CD5]">{primaryItem.reverseSearchProvider || 'Unavailable'}</strong></div>
              <div><span className="block text-[10px] uppercase text-[#7386A8]">Status</span><strong className="text-[#0B5CD5]">{primaryItem.originalFoundStatus || 'UNVERIFIED'}</strong></div>
            </div>
            {primaryItem.reverseSearchQuery && <div><span className="block text-[10px] uppercase text-[#7386A8]">Search based on</span><p className="text-xs text-[#2C4E86] mt-1">{primaryItem.reverseSearchQuery}</p></div>}
            <p className="text-[11px] text-[#7386A8] leading-relaxed">Only a downloadable image that was compared locally can appear as an original or candidate. Ordinary keyword-result pages are excluded.</p>
          </div>
        </div>

        {sourceComparison && sourceComparison.status !== 'UNAVAILABLE' && (
          <div className={`rounded-2xl border border-[#CECECE] p-4 space-y-4 bg-[#F8F8F6]`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#0B5CD5]">
                  {sourceComparison.status === 'MATCHED'
                    ? <ShieldCheck className="w-4 h-4 text-[#3E7A55]" />
                    : sourceComparison.status === 'CONTRADICTED'
                      ? <ShieldAlert className="w-4 h-4 text-[#B23F35]" />
                      : <AlertTriangle className="w-4 h-4 text-[#B98520]" />}
                  Source context vs. AI visual summary
                </div>
                <p className="mt-1 text-[11px] text-[#7386A8]">
                  Context verdict: <strong className="text-[#0B5CD5]">{sourceComparison.contextualVerdict || sourceComparison.status}</strong>
                  {Number.isFinite(sourceComparison.confidence) ? ` · ${sourceComparison.confidence}% confidence` : ''}
                </p>
              </div>
              <span className="rounded-full border border-[#CECECE] bg-white px-2.5 py-1 text-[10px] font-mono font-bold uppercase text-[#0B5CD5]">
                {sourceComparison.status}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-[#CECECE] bg-white p-3">
                <span className="block text-[10px] uppercase tracking-wider text-[#7386A8]">AI visual summary</span>
                <p className="mt-1.5 leading-relaxed text-[#2C4E86]">{sourceComparison.visualSummary || 'No visual summary was generated.'}</p>
              </div>
              <div className="rounded-xl border border-[#CECECE] bg-white p-3">
                <span className="block text-[10px] uppercase tracking-wider text-[#7386A8]">What the matched source says</span>
                <p className="mt-1.5 leading-relaxed text-[#2C4E86]">{sourceComparison.sourceSummary || sourceComparison.source?.description || 'The page did not expose enough readable context.'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#CECECE] bg-white p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <strong className="text-xs text-[#0B5CD5]">{sourceComparison.source?.title || sourceComparison.source?.domain || 'Matched source page'}</strong>
                {sourceComparison.source?.publishedAt && <span className="text-[10px] font-mono text-[#7386A8]">{new Date(sourceComparison.source.publishedAt).toLocaleDateString()}</span>}
                {sourceComparison.source?.url && (
                  <a href={sourceComparison.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#D97757] hover:text-[#B0512F]">
                    Open source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-[#7386A8]">{sourceComparison.rationale}</p>
              {Array.isArray(sourceComparison.matchingDetails) && sourceComparison.matchingDetails.length > 0 && (
                <ul className="space-y-1 text-[11px] text-[#3E7A55]">
                  {sourceComparison.matchingDetails.slice(0, 4).map((detail, index) => <li key={`match-${index}`}>✓ {detail}</li>)}
                </ul>
              )}
              {Array.isArray(sourceComparison.contradictions) && sourceComparison.contradictions.length > 0 && (
                <ul className="space-y-1 text-[11px] text-[#B23F35]">
                  {sourceComparison.contradictions.slice(0, 4).map((detail, index) => <li key={`contradiction-${index}`}>× {detail}</li>)}
                </ul>
              )}
            </div>

            {!sourceComparison.decisive && (
              <p className="text-[10px] leading-relaxed text-[#7386A8]">This result cannot change the dossier verdict because the visual match or page context is not strong enough.</p>
            )}
          </div>
        )}

        {/* Assets Container (.asset) */}
        <div className="divide-y divide-[#CECECE]">
          {(imageList.length > 0 ? imageList : [primaryItem]).map((asset, idx) => {
            const isFake = asset.chipVerdict === 'v-fake' || (parseFloat(asset.manipulationLikelihood) >= 0.70);
            const isSusp = asset.chipVerdict === 'v-susp' || (parseFloat(asset.manipulationLikelihood) >= 0.40 && !isFake);
            const originalFoundText = asset.originalFound || 'Reverse search unavailable or inconclusive';
            const isFound = ['FOUND', 'CANDIDATE'].includes(asset.originalFoundStatus) && Boolean(asset.originalImageUrl || asset.originalUrl || originalImage);
            const isCandidate = asset.originalFoundStatus === 'CANDIDATE';
            const hasProvided = Boolean(asset.uploadedImageDataUrl || asset.providedImageUrl || providedImage);

            return (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-6 py-5 items-start">
                {/* Left side: .asset-th (Thumbnail Preview) */}
                <div className="w-full md:w-40 h-28 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl overflow-hidden shadow-inner flex-shrink-0">
                  {renderThumbnail(asset)}
                </div>

                {/* Right side: .asset metadata container */}
                <div className="space-y-2.5 min-w-0">
                  {/* Top row (.between wrap) */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <b className="text-sm font-bold text-[#0B5CD5] font-mono truncate">{asset.filename}</b>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold border flex items-center gap-1.5 ${
                      isFake
                        ? 'bg-[#F7E3E0] text-[#B23F35] border-[#EBC7C2]'
                        : isSusp
                        ? 'bg-[#F7EEDA] text-[#B98520] border-[#E8D4B0]'
                        : 'bg-[#E4EFE7] text-[#2C5B3E] border-[#C5DEC9]'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {asset.chipText || (isFake ? `${asset.changesCount || 3} edited regions` : 'No manipulation signal found')}
                    </span>
                  </div>

                  {/* Key-Value rows (.kv) */}
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between gap-4 py-1 border-b border-dashed border-[#CECECE]">
                      <span className="text-[#7386A8]">Dimensions · size</span>
                      <b className="text-[#2C4E86] font-semibold text-right">{asset.dimensions} · {asset.fileSize} · {asset.formatQuality}</b>
                    </div>

                    <div className="flex justify-between gap-4 py-1 border-b border-dashed border-[#CECECE]">
                      <span className="text-[#7386A8]">{isCandidate ? 'Closest indexed candidate' : asset.originalFoundStatus === 'FOUND' ? 'Original found' : 'Reverse-image result'}</span>
                      <b className={`font-semibold text-right ${asset.originalFoundStatus === 'FOUND' ? 'text-[#2C5B3E]' : isFound ? 'text-[#B98520]' : 'text-[#B23F35]'}`}>
                        {originalFoundText}
                      </b>
                    </div>

                    <div className="flex justify-between gap-4 py-1 border-b border-dashed border-[#CECECE]">
                      <span className="text-[#7386A8]">EXIF / C2PA</span>
                      <b className={`font-semibold text-right ${asset.exifState === 'VALID' ? 'text-[#2C5B3E]' : asset.exifState === 'EDITED' ? 'text-[#B98520]' : 'text-[#B23F35]'}`}>
                        {asset.exifStatus}
                      </b>
                    </div>

                    <div className="flex justify-between gap-4 py-1 border-b border-dashed border-[#CECECE]">
                      <span className="text-[#7386A8]">Changes</span>
                      <b className="text-[#2C4E86] font-semibold text-right">
                        {Array.isArray(asset.changes) ? asset.changes.join(', ') : (asset.changes || 'None')}
                      </b>
                    </div>

                    {asset.manipulationLikelihood && (
                      <div className="flex justify-between gap-4 py-1 border-b border-dashed border-[#CECECE]">
                        <span className="text-[#7386A8]">Manipulation likelihood</span>
                        <b className={`font-semibold text-right ${
                          parseFloat(asset.manipulationLikelihood) >= 0.70
                            ? 'text-[#B23F35]'
                            : parseFloat(asset.manipulationLikelihood) >= 0.40
                            ? 'text-[#B98520]'
                            : 'text-[#2C5B3E]'
                        }`}>
                          {asset.manipulationLikelihood}
                        </b>
                      </div>
                    )}
                  </div>

                  {/* CTA Button: Open side-by-side compare */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={!hasProvided}
                      onClick={() => {
                        setSelectedAsset(asset);
                        setManualOriginalSrc(null);
                        setLeftLoading(true);
                        setRightLoading(true);
                        setLeftError(false);
                        setRightError(false);
                        setIsModalOpen(true);
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono border transition flex items-center gap-2 ${
                        hasProvided
                          ? 'bg-[#EFEEE9] hover:bg-[#CECECE] text-[#0B5CD5] border-[#CECECE] hover:border-[#AAAAAA] shadow-xs cursor-pointer'
                          : 'bg-[#F8F8F6] text-[#7386A8] border-[#CECECE] cursor-not-allowed opacity-60'
                      }`}
                    >
                      <Split className="w-3.5 h-3.5 text-[#D97757]" />
                      <span>{isCandidate ? 'Compare closest indexed candidate' : isFound ? 'Open the side-by-side compare' : 'Open compare & add original'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. FULL-PAGE / MODAL SIDE-BY-SIDE INTERACTIVE COMPARISON VIEW */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div
            className="bg-white border border-[#CECECE] rounded-3xl max-w-5xl w-full p-4 sm:p-6 space-y-6 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col relative z-10 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#CECECE] pb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-[#D97757]">04 ·</span>
                <div>
                  <h3 className="text-base font-bold text-[#0B5CD5] font-mono">
                    {selectedAsset.originalFoundStatus === 'CANDIDATE'
                      ? 'Image: Provided vs. Indexed Candidate'
                      : 'Image: Provided vs. Original Compare'}
                  </h3>
                  <p className="text-xs text-[#7386A8] mt-0.5">
                    {originalSrc
                      ? <>{selectedAsset.originalFoundStatus === 'CANDIDATE' ? 'Comparison candidate from' : 'Original recovered from'}: <strong className="text-[#0B5CD5]">{manualOriginalSrc ? 'manually supplied file' : (selectedAsset.originalFound || 'indexed source')}</strong></>
                      : <>No indexed original was recovered. Add a known original below to compare it locally.</>}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-[#EFEEE9] hover:bg-[#CECECE] text-[#7386A8] hover:text-[#0B5CD5] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto pr-1">
              {/* Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs flex-shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  {diffList.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowBoxes(!showBoxes)}
                      className={`px-3 py-1.5 rounded-xl border font-medium font-mono text-[11px] transition flex items-center gap-1.5 ${
                        showBoxes
                          ? 'bg-[#F7E3E0] border-[#EBC7C2] text-[#B23F35]'
                          : 'bg-[#EFEEE9] border-[#CECECE] text-[#7386A8] hover:text-[#0B5CD5]'
                      }`}
                    >
                      {showBoxes ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{showBoxes ? 'Hide Change Markers' : 'Show Change Markers'}</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl border border-[#CECECE] bg-[#F8F8F6] text-[#7386A8] font-mono text-[11px]">
                      No verified edit markers
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setSliderPos(50)}
                    className="px-3 py-1.5 rounded-xl bg-[#EFEEE9] hover:bg-[#CECECE] border border-[#CECECE] text-[#0B5CD5] font-mono text-[11px] transition font-semibold"
                  >
                    Center Split
                  </button>

                  <button
                    type="button"
                    onClick={() => setSliderPos(100)}
                    className="px-3 py-1.5 rounded-xl bg-[#EFEEE9] hover:bg-[#CECECE] border border-[#CECECE] text-[#0B5CD5] font-mono text-[11px] transition font-semibold"
                  >
                    Show Provided
                  </button>

                  <button
                    type="button"
                    onClick={() => setSliderPos(0)}
                    disabled={!originalSrc}
                    className="px-3 py-1.5 rounded-xl bg-[#EFEEE9] hover:bg-[#CECECE] border border-[#CECECE] text-[#0B5CD5] font-mono text-[11px] transition font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {selectedAsset.originalFoundStatus === 'CANDIDATE' ? 'Show Candidate' : 'Show Original'}
                  </button>
                </div>

                <span className="text-[11px] font-mono text-[#7386A8]">Drag the handle to compare</span>
              </div>

              {!originalSrc && (
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-[#D97757] bg-[#F6E7DF]/30 px-4 py-3 cursor-pointer hover:bg-[#F6E7DF]/50 transition">
                  <span>
                    <strong className="block text-xs text-[#0B5CD5] font-mono">Add the known original image</strong>
                    <span className="block text-[11px] text-[#7386A8] mt-0.5">The file stays in this browser and is used only for this comparison view.</span>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-[#D97757] text-white text-xs font-bold whitespace-nowrap shadow-xs">Choose image</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setRightError(false);
                        setRightLoading(true);
                        setManualOriginalSrc(String(reader.result));
                        setSliderPos(50);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}

              {/* Draggable Image Comparison Viewport (.compare) */}
              <div
                ref={containerRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                className="relative w-full aspect-[16/10] bg-black rounded-2xl overflow-hidden border border-[#CECECE] select-none cursor-ew-resize shadow-2xl group flex items-center justify-center"
              >
                {/* Base Layer: PROVIDED (Left/Bottom) */}
                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/90">
                  {providedSrc ? (
                    <img
                      src={providedSrc}
                      alt="Provided - As Circulated"
                      className="w-full h-full object-contain pointer-events-none"
                      onLoad={() => setLeftLoading(false)}
                      onError={() => {
                        setLeftLoading(false);
                        setLeftError(true);
                      }}
                    />
                  ) : (
                    <div className="p-6 text-center text-slate-400 font-mono text-xs">
                      <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                      Uploaded image data unavailable
                    </div>
                  )}
                  {leftError && (
                    <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-4 text-center">
                      <XCircle className="w-8 h-8 text-rose-500 mb-2" />
                      <span className="text-xs font-mono text-rose-300 font-semibold">Failed to load uploaded image</span>
                    </div>
                  )}
                </div>

                {/* Over Layer: ORIGINAL SOURCE (Right/Top, Clipped by sliderPos) */}
                {originalSrc && (
                  <div
                    className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/90 overflow-hidden pointer-events-none"
                    style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                  >
                    <img
                      src={originalSrc}
                      alt="Reverse-search source candidate"
                      className="w-full h-full object-contain pointer-events-none"
                      onLoad={() => setRightLoading(false)}
                      onError={() => {
                        setRightLoading(false);
                        setRightError(true);
                      }}
                    />
                  {rightError && (
                    <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-4 text-center">
                      <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                      <span className="text-xs font-mono text-amber-300 font-semibold">Source candidate image stream unavailable</span>
                    </div>
                  )}
                  </div>
                )}

                {!originalSrc && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-2 rounded-xl bg-amber-950/90 border border-amber-500/30 text-[11px] text-amber-200 font-mono pointer-events-none">
                    No locally comparable original image was recovered
                  </div>
                )}

                {/* Tags */}
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono text-slate-200 uppercase font-bold tracking-wider z-10 shadow-lg border border-slate-700/50">
                  Provided · as circulated
                </span>
                <span className={`absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono uppercase font-bold tracking-wider z-10 shadow-lg border border-slate-700/50 ${originalSrc ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {!originalSrc ? 'Original · unavailable' : manualOriginalSrc ? 'Original · manually supplied' : selectedAsset.originalFoundStatus === 'CANDIDATE' ? 'Candidate · indexed source' : 'Original · verified match'}
                </span>

                {/* Change Markers (A, B, C, D) Superimposed */}
                {showBoxes && diffList.map((d) => {
                  const isActive = activeDiff === d.id.toLowerCase() || activeDiff === d.id;
                  const b = d.box || { left: '20%', top: '20%', width: '30%', height: '20%' };

                  return (
                    <div
                      key={d.id}
                      style={{
                        left: b.left || `${b.x}%`,
                        top: b.top || `${b.y}%`,
                        width: b.width || `${b.w}%`,
                        height: b.height || `${b.h}%`
                      }}
                      className={`absolute rounded border-2 transition-all cursor-pointer z-20 flex items-start justify-start p-1 ${
                        isActive
                          ? 'border-white bg-rose-500/30 shadow-[0_0_15px_rgba(232,143,107,0.8)] scale-[1.02]'
                          : 'border-[#D97757] bg-[#D97757]/15 hover:border-white hover:bg-rose-500/25'
                      }`}
                      onMouseEnter={() => setActiveDiff(d.id.toLowerCase())}
                      onMouseLeave={() => setActiveDiff(null)}
                    >
                      <b className="px-1.5 py-0.5 rounded bg-[#D97757] text-white font-mono text-[9px] font-bold -translate-y-3 -translate-x-1 shadow">
                        {d.id} · {d.title}
                      </b>
                    </div>
                  );
                })}

                {/* Handle Divider ⟺ */}
                <div
                  style={{ left: `${sliderPos}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] z-30 pointer-events-none"
                >
                  <div
                    tabIndex={0}
                    role="slider"
                    aria-valuenow={sliderPos}
                    aria-label="Compare images"
                    onKeyDown={handleKeyDown}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-slate-900 shadow-2xl flex items-center justify-center font-bold text-sm pointer-events-auto cursor-ew-resize hover:scale-110 transition-transform select-none"
                  >
                    ⟺
                  </div>
                </div>
              </div>

              {/* Diffs List (.diffs) */}
              {diffList.length > 0 && (
                <div className="divide-y divide-[#CECECE] bg-[#F8F8F6] rounded-2xl border border-[#CECECE] p-4">
                  {diffList.map((d) => {
                    const isActive = activeDiff === d.id.toLowerCase() || activeDiff === d.id;

                    return (
                      <div
                        key={d.id}
                        onMouseEnter={() => setActiveDiff(d.id.toLowerCase())}
                        onMouseLeave={() => setActiveDiff(null)}
                        className={`flex items-start gap-3 py-3 px-2 rounded-xl transition ${
                          isActive ? 'bg-white text-[#0B5CD5] shadow-xs' : 'hover:bg-white/60 text-[#2C4E86]'
                        }`}
                      >
                        <span className="w-5 h-5 rounded bg-[#D97757] text-white font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {d.id}
                        </span>
                        <div className="space-y-1 text-xs">
                          <p className="text-[#0B5CD5] leading-relaxed font-bold">
                            {d.desc || d.title}
                          </p>
                          <span className="text-[11px] text-[#7386A8] font-mono block">
                            {d.detail || d.meta}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 3-Card Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-1 font-mono text-xs">
                  <span className="text-[10px] text-[#7386A8] uppercase tracking-wider block">
                    {selectedAsset.originalFoundStatus === 'CANDIDATE' ? 'Closest indexed candidate' : 'Reverse-search first seen'}
                  </span>
                  <div className="text-[#0B5CD5] font-bold">{selectedAsset.originalFound}</div>
                </div>

                <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-1 font-mono text-xs">
                  <span className="text-[10px] text-[#7386A8] uppercase tracking-wider block">EXIF / C2PA</span>
                  <div className="text-[#0B5CD5] font-bold">{selectedAsset.exifStatus}</div>
                </div>

                <div className="p-4 bg-[#F8F8F6] border border-[#CECECE] rounded-2xl space-y-1 font-mono text-xs">
                  <span className="text-[10px] text-[#7386A8] uppercase tracking-wider block">Manipulation likelihood</span>
                  <div className={`font-bold ${
                    parseFloat(selectedAsset.manipulationLikelihood) >= 0.70 ? 'text-[#B23F35]' :
                    parseFloat(selectedAsset.manipulationLikelihood) >= 0.40 ? 'text-[#B98520]' : 'text-[#3E7A55]'
                  }`}>
                    {selectedAsset.manipulationLikelihood} · {parseFloat(selectedAsset.manipulationLikelihood) >= 0.40 ? 'edited' : 'unaltered'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
