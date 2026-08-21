import sys
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)

def create_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette
    COLOR_PRIMARY = colors.HexColor("#1E293B") # Dark Slate
    COLOR_ACCENT = colors.HexColor("#2563EB")  # Royal Blue
    COLOR_TEXT = colors.HexColor("#334155")    # Body Slate
    COLOR_BG_LIGHT = colors.HexColor("#F8FAFC")# Light Grey
    COLOR_BORDER = colors.HexColor("#CBD5E1")  # Border Grey
    COLOR_VERIFIED = colors.HexColor("#15803D")
    COLOR_FALSE = colors.HexColor("#B91C1C")
    COLOR_SUSPICIOUS = colors.HexColor("#A16207")

    # Custom Styles
    style_title = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=COLOR_PRIMARY,
        spaceAfter=4
    )

    style_subtitle = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=12
    )

    style_h1 = ParagraphStyle(
        'Heading1Custom',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=COLOR_PRIMARY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    style_h2 = ParagraphStyle(
        'Heading2Custom',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=COLOR_ACCENT,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    style_body = ParagraphStyle(
        'BodyCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=COLOR_TEXT,
        spaceAfter=6
    )

    style_bullet = ParagraphStyle(
        'BulletCustom',
        parent=style_body,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )

    style_code = ParagraphStyle(
        'CodeCustom',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#F8FAFC"),
        backColor=colors.HexColor("#0F172A"),
        borderPadding=6,
        spaceBefore=4,
        spaceAfter=6
    )

    style_callout = ParagraphStyle(
        'CalloutText',
        parent=style_body,
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#1E3A8A")
    )

    story = []

    # Title & Metadata Block
    story.append(Paragraph("ETRAI Core Verification Engine", ParagraphStyle('Badge', fontName='Helvetica-Bold', fontSize=8, textColor=COLOR_ACCENT, leading=10, spaceAfter=4)))
    story.append(Paragraph("Agent 2 & Agent 3 Technical Architecture Documentation", style_title))
    story.append(Paragraph("Complete Specification of Claim Extraction, Web Search Verification, and Deception Detection", style_subtitle))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_ACCENT, spaceBefore=0, spaceAfter=10))

    # Meta Table
    meta_data = [
        [Paragraph("<b>Project:</b> ETRAI Fact-Checking Platform", style_body), Paragraph("<b>Pipeline Stage:</b> Agent 2 & Agent 3", style_body)],
        [Paragraph("<b>AI Engine:</b> OpenAI GPT-4o (JSON Mode)", style_body), Paragraph("<b>Search Provider:</b> Serper Search API", style_body)],
        [Paragraph("<b>Source Files:</b> <code>claimExtractor.js</code> & <code>factVerifier.js</code>", style_body), Paragraph("<b>Status:</b> Active Production", style_body)]
    ]
    t_meta = Table(meta_data, colWidths=[270, 270])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COLOR_BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 10))

    # Section 1
    story.append(Paragraph("1. Executive Overview & Pipeline Context", style_h1))
    story.append(Paragraph("ETRAI processes documents through a sequential 4-agent verification pipeline. While Agent 1 handles input parsing, <b>Agent 2 (Claim Extractor)</b> and <b>Agent 3 (Fact Verification Agent)</b> form the core analytical core of the platform:", style_body))
    story.append(Paragraph("• <b>Agent 2 (Claim Extractor):</b> Isolates up to 25 verifiable factual claims from unstructured document text, filtering out subjective commentary.", style_bullet))
    story.append(Paragraph("• <b>Agent 3 (Fact Verification Agent):</b> Queries live web search indexes, cross-references evidence via GPT-4o, validates live HTTP URLs to eliminate broken links, and detects major event fabrications.", style_bullet))
    story.append(Spacer(1, 8))

    # Section 2
    story.append(Paragraph("2. Agent 2: Claim Extractor Service (claimExtractor.js)", style_h1))
    story.append(Paragraph("<b>2.1 Input Guardrails:</b> Accepts extracted document text from Agent 1 and truncates it to the first <b>15,000 characters</b> (~3,750 tokens) to optimize API speed and context window allocation.", style_body))
    story.append(Paragraph("<b>2.2 Core GPT-4o Strategy:</b> Uses <code>gpt-4o</code> (temperature: 0.2) with strict JSON mode formatting (<code>response_format: { type: 'json_object' }</code>). Focuses on specific quantitative metrics, dates, financial figures, and direct assertions.", style_body))
    
    # Prompt Callout
    prompt_p = Paragraph("<b>Agent 2 Extraction Prompt:</b><br/><i>'You are Agent 2 (Claim Extractor) in an AI Fact-Checking system. Extract up to 25 of the most important, specific, and verifiable factual claims. Focus on quantitative metrics, financial figures, and statements verifiable by web search. STRICT RULE: Max 25 claims. No subjective commentary.'</i>", style_callout)
    t_callout1 = Table([[prompt_p]], colWidths=[540])
    t_callout1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('LINELEFT', (0,0), (-1,-1), 3, COLOR_ACCENT),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_callout1)
    story.append(Spacer(1, 6))

    story.append(Paragraph("<b>2.3 Output JSON Contract (Capped at 25 Claims):</b>", style_body))
    json_contract_a2 = """[
  {
    "id": "claim_1",
    "text": "Global cloud computing expenditure grew by 24% in Q3 2024.",
    "category": "Statistical Metric",
    "importanceScore": 95
  }
]"""
    story.append(Paragraph(json_contract_a2.replace("\n", "<br/>").replace(" ", "&nbsp;"), style_code))

    story.append(Paragraph("<b>2.4 Algorithmic Heuristic Fallback (extractMockClaims):</b> If OpenAI is unconfigured or encounters an API error, Agent 2 falls back to regex sentence splitting <code>/(?&lt;=[.?!])\\s+/</code> and filters sentences containing factual key terms (e.g. <i>percent, dollar, company, report, million, billion</i>), returning up to 25 scored claims algorithmically.", style_body))
    story.append(Spacer(1, 8))

    # Section 3
    story.append(Paragraph("3. Agent 3: Fact Verification Agent Service (factVerifier.js)", style_h1))
    story.append(Paragraph("<b>3.1 Web Search Querying (Serper API):</b> Agent 3 queries Google Serper API for each claim, fetching up to 5 organic search items (title, URL, snippet, domain). Filters against trusted domains like <i>reuters.com, apnews.com, bbc.com, bloomberg.com, wsj.com, factcheck.org, .gov, .edu</i>.", style_body))
    
    story.append(Paragraph("<b>3.2 Classification & Verdict Rubric:</b> Evaluates claims against search snippets using GPT-4o (temperature: 0.0):", style_body))

    # Rubric Table
    rubric_data = [
        [Paragraph("<b>Verdict</b>", style_body), Paragraph("<b>Classification Logic</b>", style_body), Paragraph("<b>Confidence</b>", style_body)],
        [Paragraph("<font color='#15803D'><b>Verified</b></font>", style_body), Paragraph("Search snippets directly and explicitly corroborate the claim. Link must pass live HTTP check.", style_body), Paragraph("85% - 98%", style_body)],
        [Paragraph("<font color='#B91C1C'><b>False</b></font>", style_body), Paragraph("Snippets directly refute claim OR claim asserts a major public event with 0 search record.", style_body), Paragraph("90% - 98%", style_body)],
        [Paragraph("<font color='#A16207'><b>Suspicious</b></font>", style_body), Paragraph("Claim is ambiguous, minor uncorroborated statement, or link fails HTTP validation.", style_body), Paragraph("50% - 70%", style_body)]
    ]
    t_rubric = Table(rubric_data, colWidths=[80, 360, 100])
    t_rubric.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_LIGHT]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_rubric)
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>3.3 Major Event Fabrication Detection (isMajorEventAssertion):</b> When a claim describes major public leader actions, wars, or treaties (detected via regex: <i>/prime minister|president|modi|biden|putin|declared war|invaded|nuclear test/i</i>) but search returns 0 results, Agent 3 marks it <b>FALSE</b> rather than ambiguous with 94% confidence.", style_body))

    story.append(Paragraph("<b>3.4 Live Source HTTP URL Validator (validateSourceUrl):</b> Executes an HTTP GET request with a 4,000ms timeout on selected source URLs. Drops dead links (404s). If all sources for a 'Verified' claim fail, the verdict is automatically downgraded to Suspicious or False.", style_body))

    story.append(Paragraph("<b>3.5 Agent 3 Output Data Contract:</b>", style_body))
    json_contract_a3 = """[
  {
    "claimId": "claim_1",
    "claimText": "Global cloud computing expenditure grew by 24% in Q3 2024.",
    "category": "Statistical Metric",
    "status": "Verified",
    "confidence": 92,
    "explanation": "Confirmed by BBC News – Global Technology Report...",
    "sources": [{ "title": "BBC News", "url": "https://www.bbc.com/news", "domain": "bbc.com" }]
  }
]"""
    story.append(Paragraph(json_contract_a3.replace("\n", "<br/>").replace(" ", "&nbsp;"), style_code))
    story.append(Spacer(1, 8))

    # Section 4 Matrix
    story.append(Paragraph("4. Summary Comparison Matrix", style_h1))
    matrix_data = [
        [Paragraph("<b>Feature</b>", style_body), Paragraph("<b>Agent 2: Claim Extractor</b>", style_body), Paragraph("<b>Agent 3: Fact Verification Agent</b>", style_body)],
        [Paragraph("<b>Primary Goal</b>", style_body), Paragraph("Extract testable factual claims", style_body), Paragraph("Verify claim truthfulness via web search", style_body)],
        [Paragraph("<b>Input</b>", style_body), Paragraph("Raw extracted text (~15k chars)", style_body), Paragraph("Array of extracted claim objects", style_body)],
        [Paragraph("<b>AI Model & Temp</b>", style_body), Paragraph("gpt-4o (Temperature: 0.2)", style_body), Paragraph("gpt-4o (Temperature: 0.0)", style_body)],
        [Paragraph("<b>External APIs</b>", style_body), Paragraph("OpenAI API", style_body), Paragraph("OpenAI API + Serper Google Search API", style_body)],
        [Paragraph("<b>Capping Rule</b>", style_body), Paragraph("Max 25 Claims", style_body), Paragraph("Processes all claims from Agent 2", style_body)],
        [Paragraph("<b>Safeguard</b>", style_body), Paragraph("Filters opinion & subjective text", style_body), Paragraph("isMajorEventAssertion & HTTP URL check", style_body)]
    ]
    t_matrix = Table(matrix_data, colWidths=[100, 220, 220])
    t_matrix.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_LIGHT]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_matrix)

    doc.build(story)
    print(f"PDF successfully generated at: {filename}")

if __name__ == '__main__':
    out_path = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else 'docs/ETRAI_Agent_2_and_3_Technical_Documentation.pdf'
    create_pdf(out_path)
