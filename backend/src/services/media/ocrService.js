/**
 * Optical Character Recognition (OCR) Service
 * Extracts embedded text separately from visual scene descriptions.
 * Labels vision-extracted text as model-extracted text.
 */
async function extractOcrText(fileInfo, buffer = null, options = {}) {
  // Option A: Native OCR engine (Tesseract/Vision OCR) if provided
  const ocrProvider = options.ocrProvider || null;

  if (ocrProvider && typeof ocrProvider.recognize === 'function') {
    try {
      const result = await ocrProvider.recognize(buffer);
      const text = (result?.text || result || '').trim();
      return {
        status: text ? 'AVAILABLE' : 'NO_TEXT_DETECTED',
        ocrText: text,
        source: 'native_ocr',
        confidence: result?.confidence || (text ? 85 : 0),
        limitations: text ? [] : ['No readable embedded text detected in media image']
      };
    } catch (e) {
      return {
        status: 'ERROR',
        ocrText: '',
        source: 'native_ocr',
        confidence: 0,
        limitations: [`OCR engine execution failed: ${e.message}`]
      };
    }
  }

  // Option B: If vision model extracted visible text, label it as model-extracted text
  if (options.visionExtractedText && typeof options.visionExtractedText === 'string' && options.visionExtractedText.trim()) {
    const text = options.visionExtractedText.trim();
    return {
      status: 'AVAILABLE',
      ocrText: `[model-extracted text]: ${text}`,
      rawOcrText: text,
      source: 'model_vision_ocr',
      confidence: 80,
      limitations: ['Text extracted via multimodal vision model (labeled as model-extracted text)']
    };
  }

  // Option C: Native OCR engine unavailable in environment
  return {
    status: 'UNAVAILABLE',
    ocrText: '',
    source: 'none',
    confidence: 0,
    limitations: ['Native OCR engine (Tesseract/Vision API) unavailable in runtime environment']
  };
}

module.exports = {
  extractOcrText
};
