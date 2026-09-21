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
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [previewCandidateModal, setPreviewCandidateModal] = useState(null);
  const [showCandidatesTray, setShowCandidatesTray] = useState(true);

  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const [customBoxPositions, setCustomBoxPositions] = useState({});
  const isDraggingBox = useRef(null);

  // Sync selected asset if primary item changes
  useEffect(() => {
    if (imageList.length > 0) {
      setSelectedAsset(imageList[0]);
    }
  }, [imageList]);

  // Reset candidate selection when selected asset changes
  useEffect(() => {
    setSelectedCandidate(null);
    setPreviewCandidateModal(null);
  }, [selectedAsset]);

  // Lock body scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (!isModalOpen && !previewCandidateModal) return undefined;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (previewCandidateModal) setPreviewCandidateModal(null);
        else setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, previewCandidateModal]);

  const diffList = (selectedAsset.diffs && selectedAsset.diffs.length > 0)
    ? selectedAsset.diffs
    : (differences.length > 0 ? differences : selectedAsset.diffs || []);

  const extractCandidates = (asset) => {
    if (!asset) return [];
    const sourceList = Array.isArray(asset.candidateImages) && asset.candidateImages.length > 0
      ? asset.candidateImages
      : (Array.isArray(asset.forensics?.reverseSearch?.candidateMatches) && asset.forensics.reverseSearch.candidateMatches.length > 0
          ? asset.forensics.reverseSearch.candidateMatches
          : (Array.isArray(asset.forensics?.reverseSearch?.matches) && asset.originalFoundStatus !== 'FOUND'
              ? asset.forensics.reverseSearch.matches
              : (asset.candidateImageUrl
                  ? [{ imageUrl: asset.candidateImageUrl, domain: asset.domain || 'web index', title: 'Closest indexed candidate' }]
                  : [])));

    return sourceList.map((c, idx) => {
      const rawUrl = c.imageUrl || c.originalImageUrl || c.thumbnailUrl || null;
      let domain = c.domain;
      if (!domain && c.sourceUrl) {
        try { domain = new URL(c.sourceUrl).hostname.replace(/^www\./, ''); } catch (_) { domain = 'web index'; }
      }
      return {
        id: c.id || `cand-${idx}`,
        imageUrl: rawUrl,
        thumbnailUrl: c.thumbnailUrl || rawUrl,
        domain: domain || 'web index',
        title: c.title || 'Indexed candidate image',
        sourceUrl: c.sourceUrl || c.link || null,
        publishedDate: c.publishedDate || c.publishedAt || null,
        similarity: Number.isFinite(c.similarity) ? c.similarity : null
      };
    }).filter(c => Boolean(c.imageUrl || c.thumbnailUrl));
  };

  const candidateImages = extractCandidates(selectedAsset);

  const isVerifiedOriginal = selectedAsset.originalFoundStatus === 'FOUND';

  const rawOriginalUrl = isVerifiedOriginal
    ? (selectedAsset.originalImageUrl || selectedAsset.originalUrl || (selectedAsset.originalFoundStatus === 'FOUND' ? originalImage : null) || null)
    : null;

  const originalSrc = manualOriginalSrc || (rawOriginalUrl
    ? (rawOriginalUrl.startsWith('data:')
        ? rawOriginalUrl
        : apiUrl(`/api/v1/verify/proxy-image?url=${encodeURIComponent(rawOriginalUrl)}`))
    : null);

  const candidateProxyUrl = selectedCandidate?.imageUrl
    ? (selectedCandidate.imageUrl.startsWith('data:')
        ? selectedCandidate.imageUrl
        : apiUrl(`/api/v1/verify/proxy-image?url=${encodeURIComponent(selectedCandidate.imageUrl)}`))
    : null;

  const effectiveRightSrc = originalSrc || candidateProxyUrl || null;
  const isComparingCandidate = Boolean(!originalSrc && selectedCandidate && candidateProxyUrl);

  const hasOriginal = Boolean(originalSrc) || (isVerifiedOriginal && Boolean(rawOriginalUrl));

  // Determine Real Image Sources
  const providedSrc = selectedAsset.uploadedImageDataUrl ||
    selectedAsset.providedImageUrl ||
    reportData?.mediaAnalysis?.file?.url ||
    providedImage ||
    null;

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

  // Interactive repositioning of difference bounding boxes
  const handleBoxMouseDown = (e, diffId, currentBox) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const curLeftPct = parseFloat(currentBox.left || currentBox.x || 20);
    const curTopPct = parseFloat(currentBox.top || currentBox.y || 20);
    const widthPct = parseFloat(currentBox.width || currentBox.w || 30);
    const heightPct = parseFloat(currentBox.height || currentBox.h || 20);

    const boxLeftPx = (curLeftPct / 100) * rect.width;
    const boxTopPx = (curTopPct / 100) * rect.height;
    const offsetX = (e.clientX - rect.left) - boxLeftPx;
    const offsetY = (e.clientY - rect.top) - boxTopPx;

    isDraggingBox.current = { diffId, offsetX, offsetY, widthPct, heightPct };

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingBox.current || !containerRef.current) return;
      const cRect = containerRef.current.getBoundingClientRect();
      const rawLeftPx = (moveEvent.clientX - cRect.left) - isDraggingBox.current.offsetX;
      const rawTopPx = (moveEvent.clientY - cRect.top) - isDraggingBox.current.offsetY;

      const newLeftPct = Math.max(0, Math.min(100 - isDraggingBox.current.widthPct, (rawLeftPx / cRect.width) * 100));
      const newTopPct = Math.max(0, Math.min(100 - isDraggingBox.current.heightPct, (rawTopPx / cRect.height) * 100));

      setCustomBoxPositions(prev => ({
        ...prev,
        [diffId]: {
          left: `${Math.round(newLeftPct * 10) / 10}%`,
          top: `${Math.round(newTopPct * 10) / 10}%`,
          width: `${isDraggingBox.current.widthPct}%`,
          height: `${isDraggingBox.current.heightPct}%`,
          x: Math.round(newLeftPct * 10) / 10,
          y: Math.round(newTopPct * 10) / 10,
          w: isDraggingBox.current.widthPct,
          h: isDraggingBox.current.heightPct
        }
      }));
    };

    const handleMouseUp = () => {
      isDraggingBox.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
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
            const isFound = asset.originalFoundStatus === 'FOUND' && Boolean(asset.originalImageUrl || asset.originalUrl || originalImage);
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

                  {/* CTA Buttons: Open side-by-side compare & view candidates */}
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!hasProvided}
                      onClick={() => {
                        setSelectedAsset(asset);
                        setSelectedCandidate(null);
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
                      <span>{isFound ? 'Open the side-by-side compare' : 'Open compare & add original'}</span>
                    </button>

                    {extractCandidates(asset).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAsset(asset);
                          setSelectedCandidate(null);
                          setShowCandidatesTray(true);
                          setLeftLoading(true);
                          setRightLoading(true);
                          setLeftError(false);
                          setRightError(false);
                          setIsModalOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold font-mono border transition flex items-center gap-1.5 bg-[#F6E7DF]/50 hover:bg-[#F6E7DF] text-[#D97757] border-[#D97757]/40 shadow-xs cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#D97757]" />
                        <span>View {extractCandidates(asset).length} candidate image{extractCandidates(asset).length > 1 ? 's' : ''}</span>
                      </button>
                    )}
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
                    Image: Provided vs. {isComparingCandidate ? 'Candidate (Unverified)' : 'Original Compare'}
                  </h3>
                  <p className="text-xs text-[#7386A8] mt-0.5">
                    {effectiveRightSrc
                      ? (isComparingCandidate
                          ? <>Comparing with unverified candidate from: <strong className="text-amber-700">{selectedCandidate.domain}</strong>{selectedCandidate.similarity ? ` (${selectedCandidate.similarity}% match)` : ''}</>
                          : <>Original source: <strong className="text-[#0B5CD5]">{manualOriginalSrc ? 'manually supplied file' : (selectedAsset.originalFound || 'verified archive')}</strong></>)
                      : <>No verified original was found in public archives. Add a known original or choose a candidate below.</>}
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

                  {Object.keys(customBoxPositions).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCustomBoxPositions({})}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-mono text-[11px] transition font-semibold flex items-center gap-1 shadow-xs"
                      title="Reset box positions to AI default"
                    >
                      <span>Reset Box Positions</span>
                    </button>
                  )}

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
                    disabled={!effectiveRightSrc}
                    className="px-3 py-1.5 rounded-xl bg-[#EFEEE9] hover:bg-[#CECECE] border border-[#CECECE] text-[#0B5CD5] font-mono text-[11px] transition font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isComparingCandidate ? 'Show Candidate' : 'Show Original'}
                  </button>
                </div>

                <span className="text-[11px] font-mono text-[#7386A8]">Drag the handle to compare</span>
              </div>

              {/* Active candidate comparison notice */}
              {isComparingCandidate && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Comparing with unverified candidate from <strong className="text-[#0B5CD5]">{selectedCandidate.domain}</strong>
                      {selectedCandidate.similarity ? ` (${selectedCandidate.similarity}% similarity)` : ''}.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCandidate(null)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#CECECE] hover:bg-slate-50 text-slate-700 text-[11px] font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Unload candidate
                  </button>
                </div>
              )}

              {selectedAsset.originalFoundStatus === 'CANDIDATE' && !manualOriginalSrc && !isComparingCandidate && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs font-mono">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-amber-900 font-semibold">
                      Potential visual candidate indexed, but unverified as the true original
                    </p>
                    <p className="text-[#7386A8] text-[11px]">
                      Search engines returned candidates from <span className="font-bold text-[#0B5CD5]">{selectedAsset.domain || 'web index'}</span>, but local perceptual comparison did not reach the verified match threshold (&ge;78%). Candidate images are available in the candidate tray below to preview or load into the slider.
                    </p>
                    {selectedAsset.originalPageUrl && (
                      <a
                        href={selectedAsset.originalPageUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[#0B5CD5] underline hover:text-[#094bb0] text-[11px] font-bold mt-1"
                      >
                        Inspect candidate source page <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {!originalSrc && !selectedCandidate && (
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
                        setSelectedCandidate(null);
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

                {/* Over Layer: ORIGINAL OR CANDIDATE SOURCE (Right/Top, Clipped by sliderPos) */}
                {effectiveRightSrc ? (
                  <div
                    className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/90 overflow-hidden pointer-events-none"
                    style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                  >
                    <img
                      src={effectiveRightSrc}
                      alt={isComparingCandidate ? 'Unverified visual candidate' : 'Verified original image'}
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
                        <span className="text-xs font-mono text-amber-300 font-semibold">Image stream unavailable</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-slate-900/95 border-l border-white/20 text-center p-6 select-none pointer-events-none"
                    style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                  >
                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                    <strong className="text-xs font-mono text-amber-200">No Verified Original Available</strong>
                    <p className="text-[11px] text-slate-300 mt-1 max-w-sm">
                      Reverse search did not find a verified visual match (&ge;78% similarity). An unverified candidate is never shown as the real original.
                    </p>
                    {candidateImages.length > 0 ? (
                      <div className="mt-3 pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCandidatesTray(true);
                            const el = document.getElementById('candidate-images-tray');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold transition shadow-md flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View {candidateImages.length} unverified candidate image{candidateImages.length > 1 ? 's' : ''}</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-300/80 mt-1">
                        Upload a known original photo above to compare locally.
                      </p>
                    )}
                  </div>
                )}

                {/* Tags */}
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono text-slate-200 uppercase font-bold tracking-wider z-10 shadow-lg border border-slate-700/50">
                  Provided · as circulated
                </span>
                <span className={`absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-mono uppercase font-bold tracking-wider z-10 shadow-lg border border-slate-700/50 ${effectiveRightSrc ? (isComparingCandidate ? 'text-amber-300 border-amber-500/50' : 'text-emerald-300') : 'text-amber-300'}`}>
                  {!effectiveRightSrc
                    ? 'Original · unavailable'
                    : manualOriginalSrc
                    ? 'Original · manually supplied'
                    : isComparingCandidate
                    ? `Candidate · ${selectedCandidate.domain} (unverified)`
                    : 'Original · verified match'}
                </span>

                {/* Change Markers (A, B, C, D) Superimposed */}
                {showBoxes && diffList.map((d) => {
                  const isActive = activeDiff === d.id.toLowerCase() || activeDiff === d.id;
                  const b = customBoxPositions[d.id] || d.box || { left: '20%', top: '20%', width: '30%', height: '20%' };

                  return (
                    <div
                      key={d.id}
                      style={{
                        left: b.left || `${b.x}%`,
                        top: b.top || `${b.y}%`,
                        width: b.width || `${b.w}%`,
                        height: b.height || `${b.h}%`
                      }}
                      className={`absolute rounded border-2 transition-shadow cursor-move z-20 flex flex-col items-start justify-start p-1 select-none ${
                        isActive
                          ? 'border-white bg-rose-500/35 shadow-[0_0_15px_rgba(232,143,107,0.8)] scale-[1.01]'
                          : 'border-[#D97757] bg-[#D97757]/20 hover:border-white hover:bg-rose-500/30'
                      }`}
                      onMouseDown={(e) => handleBoxMouseDown(e, d.id, b)}
                      onMouseEnter={() => setActiveDiff(d.id.toLowerCase())}
                      onMouseLeave={() => setActiveDiff(null)}
                      title="Click and drag to reposition this edit region"
                    >
                      <div className="flex items-center gap-1.5 -translate-y-3 -translate-x-1 shadow pointer-events-none">
                        <b className="px-1.5 py-0.5 rounded bg-[#D97757] text-white font-mono text-[9px] font-bold">
                          {d.id} · {d.title}
                        </b>
                        <span className="px-1 py-0.5 rounded bg-black/75 text-slate-200 text-[8px] font-mono hidden sm:inline">
                          ⠿ drag
                        </span>
                      </div>
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

              {/* Candidate Images Tray */}
              {candidateImages.length > 0 && (
                <div id="candidate-images-tray" className="rounded-2xl border border-[#CECECE] bg-[#F8F8F6] p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#0B5CD5]">
                        Candidate Images from Search Index ({candidateImages.length})
                      </h4>
                      <span className="text-[10px] font-mono text-[#7386A8]">
                        Unverified web matches
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCandidatesTray(!showCandidatesTray)}
                      className="text-[11px] font-mono text-[#0B5CD5] hover:underline font-semibold cursor-pointer"
                    >
                      {showCandidatesTray ? 'Collapse' : 'Expand'}
                    </button>
                  </div>

                  <p className="text-[11px] text-[#7386A8] leading-relaxed">
                    These images were returned by visual and reverse search queries but did not reach the verified match threshold (&ge;78%). You can inspect them or click <strong>Compare in slider</strong> to view how any candidate compares against the circulated photo.
                  </p>

                  {showCandidatesTray && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                      {candidateImages.map((cand) => {
                        const isCurrentInSlider = selectedCandidate?.imageUrl === cand.imageUrl;
                        const candProxySrc = cand.imageUrl.startsWith('data:')
                          ? cand.imageUrl
                          : apiUrl(`/api/v1/verify/proxy-image?url=${encodeURIComponent(cand.imageUrl)}`);

                        return (
                          <div
                            key={cand.id}
                            className={`rounded-xl border p-2.5 transition flex flex-col justify-between space-y-2.5 bg-white ${
                              isCurrentInSlider
                                ? 'border-amber-500 shadow-md ring-2 ring-amber-400/20'
                                : 'border-[#CECECE] hover:border-slate-400'
                            }`}
                          >
                            <div className="space-y-2">
                              {/* Thumbnail Preview */}
                              <div
                                className="relative aspect-video w-full rounded-lg bg-black/90 overflow-hidden cursor-pointer group flex items-center justify-center"
                                onClick={() => setPreviewCandidateModal(cand)}
                              >
                                <img
                                  src={candProxySrc}
                                  alt={cand.title}
                                  className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                                  loading="lazy"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-[11px] font-mono font-semibold">
                                  <Maximize2 className="w-3.5 h-3.5" /> Enlarge
                                </div>
                                {cand.similarity && (
                                  <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-mono font-bold text-amber-300">
                                    {cand.similarity}% match
                                  </span>
                                )}
                              </div>

                              {/* Candidate Info */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-mono">
                                  <span className="font-bold text-[#0B5CD5] truncate max-w-[140px]">{cand.domain}</span>
                                  {cand.publishedDate && (
                                    <span className="text-[10px] text-[#7386A8] truncate">{cand.publishedDate}</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#2C4E86] line-clamp-2 leading-tight font-medium" title={cand.title}>
                                  {cand.title}
                                </p>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                              {cand.sourceUrl ? (
                                <a
                                  href={cand.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center gap-1 text-[10px] font-mono text-[#7386A8] hover:text-[#0B5CD5]"
                                >
                                  Source <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : <span />}

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setPreviewCandidateModal(cand)}
                                  className="px-2 py-1 rounded-lg text-[10px] font-mono text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
                                >
                                  Preview
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isCurrentInSlider) {
                                      setSelectedCandidate(null);
                                    } else {
                                      setManualOriginalSrc(null);
                                      setSelectedCandidate(cand);
                                      setSliderPos(50);
                                      const compareEl = containerRef.current;
                                      if (compareEl) compareEl.scrollIntoView({ behavior: 'smooth' });
                                    }
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition flex items-center gap-1 cursor-pointer ${
                                    isCurrentInSlider
                                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-xs'
                                      : 'bg-[#0B5CD5] text-white hover:bg-[#094bb0] shadow-xs'
                                  }`}
                                >
                                  {isCurrentInSlider ? (
                                    <>
                                      <Check className="w-3 h-3" /> In Slider
                                    </>
                                  ) : (
                                    <>
                                      <Split className="w-3 h-3" /> Compare in Slider
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

      {/* Candidate High-Resolution Preview Modal */}
      {previewCandidateModal && createPortal(
        <div
          className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setPreviewCandidateModal(null)}
        >
          <div
            className="bg-white border border-[#CECECE] rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#CECECE] pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  Unverified Candidate
                </span>
                <h4 className="text-sm font-bold text-[#0B5CD5] font-mono truncate max-w-sm">
                  {previewCandidateModal.domain}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewCandidateModal(null)}
                className="p-1.5 rounded-xl bg-[#EFEEE9] hover:bg-[#CECECE] text-[#7386A8] hover:text-[#0B5CD5] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-[16/10] bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200">
              <img
                src={previewCandidateModal.imageUrl.startsWith('data:')
                  ? previewCandidateModal.imageUrl
                  : apiUrl(`/api/v1/verify/proxy-image?url=${encodeURIComponent(previewCandidateModal.imageUrl)}`)}
                alt={previewCandidateModal.title}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="space-y-2 text-xs font-mono">
              <p className="text-[#2C4E86] font-semibold">{previewCandidateModal.title}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[#7386A8] text-[11px] pt-1 border-t border-slate-100">
                <span>Source: <strong className="text-[#0B5CD5]">{previewCandidateModal.domain}</strong></span>
                {previewCandidateModal.similarity && (
                  <span>Perceptual match: <strong className="text-amber-600">{previewCandidateModal.similarity}%</strong></span>
                )}
                {previewCandidateModal.sourceUrl && (
                  <a
                    href={previewCandidateModal.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[#0B5CD5] underline hover:text-[#094bb0] font-bold"
                  >
                    Open source page <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#CECECE]">
              <button
                type="button"
                onClick={() => setPreviewCandidateModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-mono font-semibold bg-[#EFEEE9] hover:bg-[#CECECE] text-slate-700 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualOriginalSrc(null);
                  setSelectedCandidate(previewCandidateModal);
                  setSliderPos(50);
                  setPreviewCandidateModal(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#0B5CD5] hover:bg-[#094bb0] text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Split className="w-3.5 h-3.5" /> Compare in Slider
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
