const { processInputContent } = require('./inputReader');
const { extractClaims } = require('./claimExtractor');
const { verifyClaims } = require('./factVerifier');
const { generateReport } = require('./reportGenerator');
const { emitProgress } = require('./sseManager');
const { dbService, prisma } = require('../utils/prisma');

/**
 * Orchestrates the full 4-agent verification pipeline
 */
async function runVerificationPipeline({ jobId, userId, inputType, text, url, file, selectedTypes }) {
  const inputSourceStr = inputType === 'URL' ? url : inputType === 'FILE' ? (file ? file.originalname : 'Uploaded file') : text ? text.substring(0, 150) : 'Input Source';
  const sourceTitle = inputType === 'URL' ? `URL: ${url}` : inputType === 'FILE' ? `File: ${file ? file.originalname : 'Document'}` : 'Pasted Text Analysis';

  try {
    // ----------------------------------------------------
    // Step 1: Content Reader (Agent 1)
    // ----------------------------------------------------
    emitProgress(jobId, {
      status: 'PROCESSING',
      progress: 20,
      step: 'Agent 1: Reading and extracting document content...',
      stage: 'READING'
    });

    const contentRes = await processInputContent({ inputType, text, url, file });

    // ----------------------------------------------------
    // Step 2: Claim Extractor (Agent 2)
    // ----------------------------------------------------
    emitProgress(jobId, {
      status: 'PROCESSING',
      progress: 45,
      step: `Agent 2: Extracting factual claims (word count: ${contentRes.wordCount})...`,
      stage: 'CLAIM_EXTRACTION'
    });

    const claims = await extractClaims(contentRes.extractedText);

    // ----------------------------------------------------
    // Step 3: Fact Verification Agent (Agent 3)
    // ----------------------------------------------------
    emitProgress(jobId, {
      status: 'PROCESSING',
      progress: 75,
      step: `Agent 3: Verifying ${claims.length} extracted claims via web search...`,
      stage: 'VERIFICATION'
    });

    const verifiedClaims = await verifyClaims(claims);

    // ----------------------------------------------------
    // Step 4: Report Generator (Agent 4)
    // ----------------------------------------------------
    emitProgress(jobId, {
      status: 'PROCESSING',
      progress: 90,
      step: 'Agent 4: Generating per-category scores & executive summary...',
      stage: 'REPORT_GENERATION'
    });

    const reportData = await generateReport({
      sourceTitle: contentRes.sourceTitle || sourceTitle,
      extractedText: contentRes.extractedText,
      verifiedClaims,
      selectedTypes,
      truncated: contentRes.truncated
    });

    // ----------------------------------------------------
    // Step 5: Save Full Analysis Record to Database
    // ----------------------------------------------------
    let savedRecord = null;

    if (process.env.DATABASE_URL && prisma) {
      try {
        savedRecord = await prisma.analysis.create({
          data: {
            id: jobId,
            userId,
            title: contentRes.sourceTitle || sourceTitle,
            inputType,
            inputSource: inputSourceStr,
            selectedTypes,
            status: 'COMPLETED',
            summary: reportData.summary,
            overallMetrics: reportData.scores,
            reportData,
            truncated: contentRes.truncated
          }
        });
      } catch (dbErr) {
        // Fallthrough to memory store if Postgres is offline
      }
    }

    if (!savedRecord) {
      savedRecord = {
        id: jobId,
        userId,
        title: contentRes.sourceTitle || sourceTitle,
        inputType,
        inputSource: inputSourceStr,
        selectedTypes,
        status: 'COMPLETED',
        summary: reportData.summary,
        overallMetrics: reportData.scores,
        reportData,
        truncated: contentRes.truncated,
        createdAt: new Date().toISOString()
      };
      dbService.saveAnalysisFallback(savedRecord);
    }

    emitProgress(jobId, {
      status: 'COMPLETED',
      progress: 100,
      step: 'Verification completed successfully!',
      stage: 'DONE',
      reportId: jobId,
      reportData
    });

    return reportData;
  } catch (error) {
    console.error(`[Pipeline Job Error ${jobId}]:`, error.message);
    
    // Save FAILED analysis record to database history
    const failedRecord = {
      id: jobId,
      userId,
      title: sourceTitle,
      inputType,
      inputSource: inputSourceStr,
      selectedTypes,
      status: 'FAILED',
      errorMessage: error.message,
      createdAt: new Date().toISOString()
    };

    if (process.env.DATABASE_URL && prisma) {
      try {
        await prisma.analysis.create({
          data: {
            id: jobId,
            userId,
            title: sourceTitle,
            inputType,
            inputSource: inputSourceStr,
            selectedTypes,
            status: 'FAILED',
            errorMessage: error.message
          }
        });
      } catch (e) {}
    }

    dbService.saveAnalysisFallback(failedRecord);

    emitProgress(jobId, {
      status: 'FAILED',
      progress: 100,
      step: `Verification failed: ${error.message}`,
      stage: 'ERROR',
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runVerificationPipeline
};
