# ETRAI: Complete Verification Pipeline & Explainable Scoring Specification
**Specification Version:** 2.4.0  
**Classification:** Technical Architecture & System Implementation Specification  
**Target Audience:** AI Models, Machine Learning Systems, and System Architects

---

## 1. Executive Summary & Core Philosophy

**ETRAI** (Explainable Trust & Real-time AI Intelligence) is a deterministic, multi-modal disinformation analysis and trust-verification framework. 

Unlike traditional "black-box" generative AI verifiers that output subjective judgments without mathematical backing, ETRAI enforces five fundamental engineering principles:

1. **Zero Hallucinated Scores (Absolute Determinism):** Given identical inputs and scoring weights, the scoring engine produces byte-identical numerical outputs with zero stochastic drift.
2. **Strict Monotonicity:** Authoritative corroborating evidence monotonically increases or maintains confidence; authoritative refuting evidence monotonically decreases confidence.
3. **Granular Mathematical Auditability:** Every single percentage point gained or deducted is traceable to an explicit weighted factor ($Score \times Weight$) or an explicit penalty deduction code from a versioned catalog.
4. **Epistemic Rigor (Absence of Evidence $\neq$ Falsity):** If no search hits or evidence can be retrieved for a claim, the system classifies it as `INSUFFICIENT_EVIDENCE` and clamps the trust score $\ge 40\%$ (`SUSPICIOUS`), strictly prohibiting the system from branding an unverified claim as `FABRICATED` without active refuting evidence.
5. **Corporate Media Independence:** Apparent consensus across multiple news sites is evaluated against corporate parent ownership and wire-syndication groups to prevent circular wire reports from artificially inflating confidence.

---

## 2. End-to-End Multi-Agent Architecture

The pipeline processes input through five orchestrated agents:

```
[User Input: Text / URL / PDF / Image / Video]
                       │
                       ▼
         ┌───────────────────────────┐
         │  AGENT 1: Ingestion &     │
         │     Canonicalization      │
         └─────────────┬─────────────┘
                       │ Normalized Text, Extracted Metadata, Media Buffers
                       ▼
         ┌───────────────────────────┐
         │  AGENT 2: Claim Extraction│
         │    & Significance Scope   │
         └─────────────┬─────────────┘
                       │ Discrete Atomic Claims + Significance (1-100) + Scope
                       ▼
         ┌───────────────────────────┐         ┌───────────────────────────┐
         │  AGENT 3: Multi-Source    │         │  AGENT 5: Deep Media &    │
         │  Retrieval & Fact Engine  │         │   Image Forensics Suite   │
         └─────────────┬─────────────┘         └─────────────┬─────────────┘
                       │ Evidence Stances & Sources          │ ELA, dHash, C2PA, EXIF
                       └───────────────┬─────────────────────┘
                                       ▼
                       ┌───────────────────────────┐
                       │  AGENT 4: Explainable     │
                       │  Scoring & Telemetry      │
                       └───────────────┬───────────┘
                                       │
                                       ▼
                     [Final Audit Report & Telemetry JSON]
```

### 2.1. Agent 1: Ingestion & Canonicalization
* **Inputs:** Raw text, article URLs, PDF/DOCX documents, image files (JPEG, PNG, WebP), or video links.
* **Operations:**
  * Strips boilerplate (HTML navigation, ads, paywalls) via Readability / Cheerio.
  * Validates file magic bytes and detects structural corruption or trailing binary payloads.
  * Computes cryptographic hashes (SHA-256) of input buffers for immutability.

### 2.2. Agent 2: Claim Extraction & Significance Engine
* **Operations:**
  * Deconstructs complex inputs into isolated, testable, atomic factual propositions.
  * Evaluates **Claim Scope:** `International` | `National` | `Regional` | `Local`.
  * Computes **Importance / Significance Score ($1-100$):** High significance claims require higher evidentiary thresholds.
  * Evaluates **Procedural Implausibility:** Flags claims defying physical, administrative, or statistical feasibility.

### 2.3. Agent 3: Multi-Source Retrieval & Stance Cross-Examination
* **Operations:**
  * Generates optimized boolean queries for Google Serper and social platform indexes (X/Twitter).
  * Executes retrieval with deduplication, temporal filtering, and multi-source cross-referencing.
  * Evaluates **Stance** for every retrieved evidence passage relative to the claim: `SUPPORTS` | `REFUTES` | `QUALIFIES` | `NEUTRAL`.
  * Evaluates **Corporate Syndication:** Maps each domain to its corporate parent (e.g., `timesofindia.indiatimes.com` $\to$ `Times Group`; `reuters.com` $\to$ `Thomson Reuters`).

### 2.4. Agent 5: Deep Media & Image Forensics Suite
* **Operations:**
  * **C2PA Content Credentials:** Checks for cryptographically signed JUMBF containers (Content Authenticity Initiative).
  * **EXIF & TIFF Metadata Extraction:** Identifies camera make, model, modification timestamps, and authoring software signatures.
  * **Error Level Analysis (ELA):** Analyzes JPEG discrete cosine transform (DCT) quantization tables for compression disparities indicating splicing.
  * **Copy-Move Pixel Forgery:** Performs spatial block matching to identify duplicated regions within the same frame.
  * **Perceptual Hashing (dHash & aHash):** 64-bit gradient difference hashing for scale- and compression-invariant reverse image matching.
  * **Reverse Visual Search:** Two-stage SerpApi Google Lens lookup with local perceptual verification.

### 2.5. Agent 4: Explainable Scoring & Telemetry Engine
* Synthesizes all outputs through the formal mathematical scoring models detailed in Sections 3, 4, 5, and 6.

---

## 3. Layer 1: Individual Claim Confidence Scoring

Every individual claim is scored deterministically using the **Global Claim Scoring Formula**.

### 3.1. Mathematical Formula
$$\text{Claim Confidence Score} = \text{Clamp}_{[0, 100]}\Big( EQ \cdot w_{eq} + SA \cdot w_{sa} + SAG \cdot w_{sag} + SI \cdot w_{si} \Big)$$

Where:
* $EQ$ = **Evidence Quality** ($0-100$)
* $SA$ = **Source Authority** ($0-100$)
* $SAG$ = **Source Agreement** ($0-100$)
* $SI$ = **Source Independence** ($0-100$)
* $w_k$ = Normalized active factor weights (summing to $1.0000$)

### 3.2. Global Default Weights
| Factor | Variable | Default Weight | Description |
| :--- | :--- | :---: | :--- |
| Evidence Quality | $w_{eq}$ | **0.30** (30%) | Semantic grounding and relevance of supporting passages |
| Source Authority | $w_{sa}$ | **0.25** (25%) | Credibility ranking of cited domains |
| Source Agreement | $w_{sag}$ | **0.25** (25%) | Stance corroboration ratio vs refutation |
| Source Independence | $w_{si}$ | **0.20** (20%) | Distinct corporate publisher count |

### 3.3. Weight Normalization Rule
If custom weights are configured by an organization or workspace:
$$w_k^{\text{norm}} = \frac{w_k^{\text{raw}}}{\sum_{j} w_j^{\text{raw}}} \quad \text{such that } \sum_{k} w_k^{\text{norm}} = 1.0000$$

### 3.4. Sub-Factor Mathematical Derivations

#### 1. Evidence Quality ($EQ$)
$$EQ = \text{round}\left( \overline{\text{TrustScore}}_{\text{sources}} \times 100 \right)$$
Where $\overline{\text{TrustScore}}_{\text{sources}}$ is the weighted credibility of all passages directly evaluating the claim.

#### 2. Source Agreement ($SAG$)
Let $N_{\text{sup}}$ be supporting sources and $N_{\text{ref}}$ be refuting sources:
$$SAG = \begin{cases} 
100 & \text{if EvidenceState} = \text{SUPPORTED} \\
100 & \text{if EvidenceState} = \text{REFUTED (strong consensus of falsehood)} \\
\text{round}\left( \dfrac{N_{\text{sup}}}{\max(1, N_{\text{sup}} + N_{\text{ref}})} \times 100 \right) & \text{if EvidenceState} = \text{MIXED} \\
0 & \text{if EvidenceState} = \text{INSUFFICIENT}
\end{cases}$$

#### 3. Source Independence ($SI$)
Let $N_{\text{indep\_sup}}$ be the number of non-syndicated supporting sources, and $N_{\text{total}}$ be the total retrieved evidence items:
$$SI = \text{round}\left( \frac{N_{\text{indep\_sup}}}{\max(1, N_{\text{total}})} \times 100 \right)$$

### 3.5. Canonical Verdict Decision Tree
```
Is EvidenceState == REFUTED or MaxRefutingAuthority >= 95 with zero strong support?
├── YES ──► Canonical Verdict = "FALSE"
└── NO
    ├── Is EvidenceState == MIXED?
    │   ├── YES ──► Canonical Verdict = "PARTIALLY_VERIFIED"
    │   └── NO
    │       ├── Is EvidenceState == SUPPORTED and DerivedConfidence >= 55?
    │       │   ├── YES ──► Canonical Verdict = "VERIFIED"
    │       │   └── NO  ──► Canonical Verdict = "UNVERIFIED"
    │       └── Default ──► Canonical Verdict = "UNVERIFIED"
```

---

## 4. Layer 2: Domain Authority & Source Intelligence Hierarchy

Source authority is governed by a strict five-tier hierarchy with corporate syndication grouping.

### 4.1. Domain Trust Hierarchy Table
| Tier | Category | Base Trust ($0-1.0$) | Score ($0-100$) | Priority Multiplier | Representative Domains |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **Tier 0** | Official Government, Statutory, Academic & Global Bodies | **0.98** | 98 | **$1.5\times$** in weighted averages | `.gov`, `.edu`, `pib.gov.in`, `pmo.gov.in`, `whitehouse.gov`, `who.int`, `un.org`, `nature.com`, `thelancet.com` |
| **Tier 1** | Global Wire Agencies & IFCN Fact-Checking Desks | **0.90 – 0.94** | 90 – 94 | $1.0\times$ | `reuters.com`, `apnews.com`, `afp.com`, `bbc.com`, `snopes.com`, `factcheck.org`, `boomlive.in` |
| **Tier 2** | Major National & Regional Newspapers of Record | **0.75 – 0.89** | 75 – 89 | $1.0\times$ | `thehindu.com`, `nytimes.com`, `theguardian.com`, `indianexpress.com`, `hindustantimes.com` |
| **Tier 3** | Social Media & Public Discourse Platforms | **0.40 – 0.45** | 40 – 45 | $0.4\times$ | `x.com`, `twitter.com`, `facebook.com` |
| **Tier 4** | General / Unclassified Web TLDs | **0.50 – 0.65** | 50 – 65 | $0.8\times$ | `.org` ($0.65$), `.com/.net/.in` ($0.55$), unlisted ($0.50$) |

### 4.2. Multi-Source Cross-Corroboration Boost
When a claim is corroborated across Tier 0/1/2 sources **and** corroborated on social media indexes, a $+0.15$ boost is awarded to Tier 2 regional sources:
$$\text{TrustScore}_{\text{Tier 2}} = \min(0.90, \text{BaseScore} + 0.15)$$

### 4.3. Weighted Average Domain Trust Formula
$$\overline{\text{Trust}} = \frac{\sum_{i=1}^{M} \left( \text{TrustScore}_i \times \text{PriorityMultiplier}_i \right)}{\sum_{i=1}^{M} \text{PriorityMultiplier}_i}$$
*(Where Tier 0 sources receive $\text{PriorityMultiplier} = 1.5$, while Tiers 1–4 receive $1.0$).*

---

## 5. Layer 3: 9-Signal Mamdani Fuzzy Inference Engine

To evaluate complex, ambiguous real-world discourse, ETRAI applies a **Mamdani Fuzzy Logic Inference System** over 9 continuous and categorical signals.

### 5.1. Input Signal Vector
$$\mathbf{X} = \Big[ C_{\text{score}}, \, T_{\text{source}}, \, S_{\text{bias}}, \, I_{\text{sig}}, \, M_{\text{conf}}, \, V_{\text{disc}}, \, S_{\text{soc}}, \, K_{\text{skep}}, \, \Omega_{\text{scope}} \Big]$$

1. $C_{\text{score}}$: Corroboration score ($0.0 - 10.0$)
2. $T_{\text{source}}$: Average source credibility ($0.0 - 1.0$)
3. $S_{\text{bias}}$: Sentiment / emotional bias intensity ($0.0 - 1.0$)
4. $I_{\text{sig}}$: Claim significance / impact ($1 - 100$)
5. $M_{\text{conf}}$: LLM extraction confidence ($0 - 100$)
6. $V_{\text{disc}}$: Public discourse search volume ($0 - 10$)
7. $S_{\text{soc}}$: Social verification ratio ($0.0 - 1.0$)
8. $K_{\text{skep}}$: Community debunk keyword density ($0.0 - 1.0$)
9. $\Omega_{\text{scope}}$: Scope (`International`, `National`, `Regional`, `Local`)

### 5.2. Fuzzy Membership Functions

#### Triangular Membership Function: $\text{trimf}(x; a, b, c)$
$$\mu(x) = \begin{cases} 
0 & x < a \text{ or } x > c \\
\dfrac{x - a}{b - a} & a \le x < b \\
1 & x = b \\
\dfrac{c - x}{c - b} & b < x \le c 
\end{cases}$$

#### Trapezoidal Membership Function: $\text{trapmf}(x; a, b, c, d)$
$$\mu(x) = \begin{cases} 
0 & x < a \text{ or } x > d \\
\dfrac{x - a}{b - a} & a \le x < b \\
1 & b \le x \le c \\
\dfrac{d - x}{d - c} & c < x \le d 
\end{cases}$$

### 5.3. Centroid Defuzzification Formula
Output fuzzy sets are mapped into the domain $x \in [0, 100]$:
$$\text{CrispScore} = \frac{\displaystyle\int_{0}^{100} x \cdot \mu_{\text{agg}}(x) \, dx}{\displaystyle\int_{0}^{100} \mu_{\text{agg}}(x) \, dx} \approx \frac{\displaystyle\sum_{x=0}^{100} x \cdot \max_{r} \min\left(w_r, \mu_{\text{target}}(x)\right)}{\displaystyle\sum_{x=0}^{100} \max_{r} \min\left(w_r, \mu_{\text{target}}(x)\right)}$$

### 5.4. Hard Semantic Boundary Guards
* **Guard 1 (Absence of Evidence):** If $\text{EvidenceState} = \text{INSUFFICIENT}$, the engine enforces $\text{CrispScore} = \max(\text{CrispScore}, 40)$ and sets Verdict = `SUSPICIOUS`. The engine is strictly prohibited from returning `FABRICATED` without active contradiction.
* **Guard 2 (Direct Contradiction):** If $\text{EvidenceState} = \text{REFUTED}$ and refuting source authority $\ge 90$, Verdict is clamped to `FABRICATED`.

---

## 6. Layer 4: Master Investigation Trust Scoring (v2.4.0)

The overall investigation trust score unifies claims, text framing, media forensics, and document authenticity.

### 6.1. Master Trust Score Formula
$$\text{Final Trust Score} = \text{Clamp}_{[0, 100]}\left( \sum_{i=1}^{K} \left( \text{RawScore}_i \times w_i^{\text{normalized}} \right) - \sum_{j} \text{Penalty}_j \right)$$

### 6.2. Active Factors & Weight Allocation
| Factor Key | Factor Name | Default Weight | Condition |
| :--- | :--- | :---: | :--- |
| `claimEvidenceMatch` | Claim–Evidence Match | **0.22** (22%) | Always active (Mean of claim scores) |
| `sourceAuthority` | Source Authority Ranking | **0.18** (18%) | Always active (Authority of cited sources) |
| `independentCorroboration`| Independent Corroboration | **0.15** (15%) | Always active (Count of distinct publisher parents) |
| `contradictoryEvidence` | Contradictory Evidence Ratio | **0.12** (12%) | Always active (Supporting vs refuting ratio) |
| `evidenceFreshness` | Temporal Evidence Freshness | **0.08** (8%) | Always active (Proximity to event window) |
| `provenanceQuality` | Provenance Trail Confidence | **0.07** (7%) | Always active (Earliest publication origin) |
| `attributionQuality` | Language & Direct Attribution | **0.06** (6%) | Always active (Named primary actors & quotes) |
| `contextFramingQuality` | Amplification / Anti-Sensationalism| **0.05** (5%) | Always active (Freedom from alarmist urgency) |
| `mediaIntegrity` | Forensic Media Integrity | **0.15** (15%) | **Active only if Image/Video is submitted** |
| `documentIntegrity` | Document Magic-Byte Integrity | **0.10** (10%) | **Active only if PDF/DOCX is submitted** |

*(When media or documents are not present in an analysis, the active weights automatically normalize to sum to exactly $1.0000$).*

### 6.3. Complete Penalty Catalog (`PENALTY_CATALOG`)
Penalties represent verified adverse findings deducted directly from the weighted base score:

$$\text{Total Deductions} = \sum_{j} \text{PointsDeducted}_j$$

| Penalty Code | Deduction | Cap | Trigger Condition |
| :--- | :---: | :---: | :--- |
| `FABRICATED_DOCUMENT` | **$-35$ pts** | $-35$ | Tampered PDF magic bytes, corrupted trailer, or forged letterhead |
| `VERIFIED_MANIPULATION` | **$-30$ pts** | $-30$ | Forensic image ELA anomaly, copy-move forgery, or deepfake model signature |
| `DIRECT_REFUTATION` | **$-25$ pts / claim** | **$-45$** | Direct factual contradiction from a Tier 0/1 authoritative source |
| `UNRESOLVED_CONTRADICTION`| **$-15$ pts / claim**| **$-30$** | High-authority sources in irreconcilable factual dispute |
| `NUMERICAL_DISCREPANCY` | **$-15$ pts / metric**| **$-25$** | Statistically impossible or manipulated quantitative metrics |
| `DECEPTIVE_REDIRECT` | **$-15$ pts** | $-15$ | Anchor link text mismatch or deceptive phishing redirects |
| `HIGH_SENSATIONALISM` | **$-10$ pts** | $-10$ | Alarmist clickbait rhetoric and urgency manipulation detected |
| `STALE_EVIDENCE` | **$-10$ pts** | $-10$ | Historic evidence cited out of temporal context for present-day claim |

### 6.4. Final Investigation Verdict Mapping
$$\text{Verdict} = \begin{cases} 
\text{HIGHLY\_SUPPORTED} & \text{Score} \ge 85 \text{ and } N_{\text{unverified}} = 0 \\
\text{SUPPORTED} & \text{Score} \ge 70 \\
\text{MIXED} & 50 \le \text{Score} < 70 \text{ or } (N_{\text{supporting}} > 0 \land N_{\text{refuting}} > 0) \\
\text{MISLEADING} & N_{\text{refuted}} > 0 \text{ and } \text{Score} \ge 40 \\
\text{FALSE} & N_{\text{refuted}} > 0 \text{ or } \text{Score} < 40 \\
\text{UNCERTAIN} & N_{\text{evidence}} = 0
\end{cases}$$

---

## 7. Layer 5: Media & Image Forensics Scoring

Implemented in [`imageForensics.js`](file:///c:/Users/acer/.gemini/antigravity-ide/scratch/ETRAI-repo/backend/src/services/media/imageForensics.js) and [`perceptualHasher.js`](file:///c:/Users/acer/.gemini/antigravity-ide/scratch/ETRAI-repo/backend/src/services/media/perceptualHasher.js).

### 7.1. Image Manipulation Score Formula
$$\text{ManipulationScore} = \text{Clamp}_{[0, 100]}\Big( S_{\text{CopyMove}} + S_{\text{ELA}} + S_{\text{Payload}} + S_{\text{Software}} - S_{\text{C2PA}} \Big)$$

Where:
* **$S_{\text{CopyMove}} = +40$ pts:** Detected spatial block duplication with Pearson correlation $> 0.85$.
* **$S_{\text{ELA}} = +25$ pts:** Error Level Analysis indicates multiple distinct JPEG DQT quantization tables.
* **$S_{\text{Payload}} = +20$ pts:** Trailing binary data detected beyond JPEG `0xFFD9` EOI marker.
* **$S_{\text{Software}} = +15$ pts:** Authoring software signature found (Photoshop, GIMP, Midjourney, Canva).
* **$S_{\text{C2PA}} = -50$ pts:** Cryptographically verified C2PA Content Credentials prove authentic hardware capture.

### 7.2. Manipulation Verdict & Likelihood
$$\text{Verdict} = \begin{cases} 
\text{AUTHENTIC\_C2PA\_SIGNED} & \text{if C2PA container is valid and authentic} \\
\text{FABRICATED\_OR\_COMPOSITED} & \text{if ManipulationScore} \ge 70 \implies (\text{Likelihood: } 78\%) \\
\text{ALTERED\_OR\_SUSPICIOUS} & \text{if } 35 \le \text{ManipulationScore} < 70 \implies (\text{Likelihood: } 65\%) \\
\text{NO\_MANIPULATION\_SIGNAL\_FOUND} & \text{if ManipulationScore} < 35 \implies (\text{Likelihood: } 8\%)
\end{cases}$$

### 7.3. Perceptual Reverse Match Gate (dHash Verification)
When web matches are returned from SerpApi Google Lens, candidate images are downloaded and compared to the uploaded image using 64-bit gradient difference hashing (`dHash`):
$$\text{Similarity}(\mathbf{A}, \mathbf{B}) = 1.0 - \frac{\text{HammingDistance}(\text{dHash}_A, \text{dHash}_B)}{64}$$

* **$\text{Similarity} \ge 0.78 \ (78\%):$** Marked as $\mathbf{FOUND}$ (Confirmed original verified match; sets `originalImageUrl`).
* **$\text{Similarity} < 0.78 \ (78\%):$** Marked as $\mathbf{CANDIDATE}$ (Unverified candidate match; sets `candidateImageUrl`).

---

## 8. Data Contracts & Telemetry JSON Schemas

Every analysis generates a machine-readable audit report adhering to this schema:

```json
{
  "$schema": "https://etrai.org/schemas/v2/telemetry.json",
  "auditId": "audit_8f29e1c4",
  "timestamp": "2026-09-23T12:00:00.000Z",
  "scoringVersion": "2.4.0",
  "overallVerdict": "SUPPORTED",
  "finalTrustScore": 76,
  "scoringBreakdown": {
    "weightedBaseScore": 86.0,
    "totalPenalties": 10.0,
    "formula": "FinalTrustScore = Clamp[0, 100](WeightedBase - TotalPenalties)",
    "activeFactorsCount": 8,
    "factors": [
      {
        "factorKey": "claimEvidenceMatch",
        "factorName": "Claim–evidence match",
        "rawScore": 88,
        "weightPercent": 22.0,
        "weightedContribution": 19.36
      },
      {
        "factorKey": "sourceAuthority",
        "factorName": "Source authority",
        "rawScore": 84,
        "weightPercent": 18.0,
        "weightedContribution": 15.12
      }
    ],
    "appliedPenalties": [
      {
        "code": "HIGH_SENSATIONALISM",
        "pointsDeducted": 10.0,
        "reason": "High sensationalism and alarmist rhetoric detected.",
        "evidenceRef": "textAnalysis.urgency"
      }
    ]
  },
  "claims": [
    {
      "claimId": "claim_1",
      "claimText": "Atomic factual assertion text...",
      "evidenceState": "SUPPORTED",
      "verdict": "VERIFIED",
      "confidence": 85,
      "factors": {
        "evidenceQuality": 88,
        "sourceAuthority": 85,
        "sourceAgreement": 100,
        "sourceIndependence": 80
      },
      "activeWeights": {
        "evidenceQuality": 0.30,
        "sourceAuthority": 0.25,
        "sourceAgreement": 0.25,
        "sourceIndependence": 0.20
      }
    }
  ],
  "sensitivityAnalysis": [
    {
      "condition": "Discovering Tier-1 official gazettes confirming unverified claims",
      "potentialImpact": "+15 points",
      "impactScore": 15
    }
  ]
}
```

---

## 9. Failure Modes & Edge Case Recovery

1. **Cold-Start Search Timeouts:** Reverse visual searches (Google Lens) can require up to 18 seconds for real-time visual parsing. The subsystem uses a 25-second socket timeout with automatic failover to textual web retrieval.
2. **SSRF Guard & Anti-Bot Protection:** Remote URLs are fetched via an isolated media proxy (`ssrfGuard.js`). If external CDNs return Cloudflare HTML captchas (`text/html`), the frontend gracefully falls back to direct thumbnail streams without crashing the UI.
3. **Circular Syndication:** When multiple news URLs share a single parent company or wire source ID, they are collapsed into a single independent evidence group, preserving the integrity of the $SI$ (Source Independence) factor.
4. **Breaking News Window:** If `isRecentBreaking` is flagged, low search hit counts are flagged as *indexing latency* rather than *factual refutation*, preventing erroneous `FALSE` verdicts on nascent news stories.
