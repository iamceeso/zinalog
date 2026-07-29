import fs from "node:fs/promises";
import path from "node:path";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error(
    "Usage: node update-coverage-badge.mjs <coverage-report> <output-svg>"
  );
}

const report = await fs.readFile(inputPath, "utf8");
const match = report.match(
  /all files\s+\|\s+(\d+\.\d+)\s+\|\s+(\d+\.\d+)\s+\|\s+(\d+\.\d+)/
);

if (!match) {
  throw new Error(
    "Could not find overall coverage line in test coverage output"
  );
}

const lineCoverage = Number.parseFloat(match[1]);
const branchCoverage = Number.parseFloat(match[2]);
const functionCoverage = Number.parseFloat(match[3]);
const overallCoverage = Math.min(
  lineCoverage,
  branchCoverage,
  functionCoverage
);
const coverageText = `${overallCoverage.toFixed(2)}%`;

function badgeColor(value) {
  if (value >= 100) return "#15803d";
  if (value >= 95) return "#65a30d";
  if (value >= 90) return "#ca8a04";
  if (value >= 80) return "#ea580c";
  return "#dc2626";
}

function textWidth(text) {
  return Math.max(40, text.length * 7 + 10);
}

const label = "coverage";
const labelWidth = textWidth(label);
const valueWidth = textWidth(coverageText);
const totalWidth = labelWidth + valueWidth;
const color = badgeColor(overallCoverage);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${coverageText}">
  <title>${label}: ${coverageText}</title>
  <linearGradient id="smooth" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".7"/>
    <stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>
    <stop offset=".9" stop-color="#000" stop-opacity=".3"/>
    <stop offset="1" stop-color="#000" stop-opacity=".5"/>
  </linearGradient>
  <clipPath id="round">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#round)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#smooth)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${Math.round(labelWidth / 2)}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${Math.round(labelWidth / 2)}" y="14">${label}</text>
    <text x="${labelWidth + Math.round(valueWidth / 2)}" y="15" fill="#010101" fill-opacity=".3">${coverageText}</text>
    <text x="${labelWidth + Math.round(valueWidth / 2)}" y="14">${coverageText}</text>
  </g>
</svg>
`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, svg);
