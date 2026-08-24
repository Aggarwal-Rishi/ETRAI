'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const JSZip = require('jszip');
const ffmpegPath = require('ffmpeg-static');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const outputDir = path.join(__dirname, 'fixtures', 'multiformat');

const cases = [
  {
    id: 'real',
    expected: 'TRUSTED',
    text: 'The World Health Organization is the United Nations agency responsible for international public health.'
  },
  {
    id: 'false',
    expected: 'FABRICATED',
    text: 'The World Health Organization announced that drinking ocean saltwater cures every viral infection within ten seconds.'
  },
  {
    id: 'ambiguous',
    expected: 'UNVERIFIED',
    text: 'A neighborhood clinic in Pune reported a 17 percent increase in walk-in visits last Tuesday.'
  }
];

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function buildPdf(text) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([612, 792]);
  page.drawText(text, { x: 54, y: 730, size: 13, font, maxWidth: 500, lineHeight: 18 });
  document.setTitle('ETRAI controlled verification fixture');
  document.setAuthor('ETRAI test harness');
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

async function buildDocx(text) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  zip.folder('docProps').file('core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>ETRAI controlled verification fixture</dc:title><dc:creator>ETRAI test harness</dc:creator></cp:coreProperties>');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function wrapText(text, max = 42) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach(word => {
    if (`${line} ${word}`.trim().length > max) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  });
  if (line) lines.push(line);
  return lines;
}

async function buildPng(item, filename) {
  const lines = wrapText(item.text);
  const tspans = lines.map((line, index) => `<tspan x="70" y="${180 + index * 58}">${escapeXml(line)}</tspan>`).join('');
  const color = item.id === 'real' ? '#36d399' : item.id === 'false' ? '#fb7185' : '#fbbf24';
  const svg = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#08111f"/><rect x="40" y="40" width="1200" height="640" rx="30" fill="#111c31" stroke="${color}" stroke-width="4"/><text x="70" y="105" fill="${color}" font-family="Arial" font-size="30" font-weight="700">CONTROLLED ${item.id.toUpperCase()} NEWS FIXTURE</text><text fill="#f4f7fb" font-family="Arial" font-size="42" font-weight="600">${tspans}</text><text x="70" y="640" fill="#94a3b8" font-family="Arial" font-size="22">Generated for local ETRAI input and report testing</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filename);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const item of cases) {
    const prefix = path.join(outputDir, item.id);
    fs.writeFileSync(`${prefix}.txt`, `${item.text}\n`, 'utf8');
    fs.writeFileSync(`${prefix}.pdf`, await buildPdf(item.text));
    fs.writeFileSync(`${prefix}.docx`, await buildDocx(item.text));
    await buildPng(item, `${prefix}.png`);
    execFileSync(ffmpegPath, [
      '-y', '-loop', '1', '-i', `${prefix}.png`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000',
      '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24',
      '-c:a', 'aac', '-b:a', '64k', '-shortest', `${prefix}.mp4`
    ], { stdio: 'ignore' });
  }
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), cases }, null, 2));
  console.log(`Generated ${cases.length * 5} controlled fixtures in ${outputDir}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
