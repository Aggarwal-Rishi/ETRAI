/**
 * Remove duplicate inline image bytes while preserving the canonical image
 * consumed by the report comparison UI. Compatibility aliases must not turn
 * one upload into a many-times-larger stored dossier.
 *
 * This mutates the supplied report object and returns it.
 */
function compactReportMediaPayload(report = {}) {
  if (!report || typeof report !== 'object') return report;

  const media = report.mediaAnalysis;
  const mediaType = String(report.inputType || media?.mediaType || '').toUpperCase();
  if (mediaType !== 'IMAGE' && mediaType !== 'PHOTO') return report;

  const nestedItem = media?.imageForensics?.reportItem || media?.forensics?.reportItem || media?.images?.[0];
  const topItem = Array.isArray(report.images) ? report.images[0] : null;
  const canonicalItem = topItem || nestedItem;

  if (canonicalItem) {
    const canonicalImage = canonicalItem.uploadedImageDataUrl || canonicalItem.providedImageUrl || null;
    canonicalItem.uploadedImageDataUrl = canonicalImage;
    delete canonicalItem.providedImageUrl;
    report.images = [canonicalItem];
  }

  if (media) {
    // Compatibility aliases of imageForensics/report.images.
    delete media.images;
    if (media.forensics === media.imageForensics || media.forensics?.reportItem) {
      delete media.forensics;
    }

    const nestedReportItem = media.imageForensics?.reportItem;
    if (nestedReportItem && nestedReportItem !== canonicalItem) {
      delete nestedReportItem.uploadedImageDataUrl;
      delete nestedReportItem.providedImageUrl;
    } else if (nestedReportItem) {
      delete media.imageForensics.reportItem;
    }
  }

  return report;
}

module.exports = { compactReportMediaPayload };
