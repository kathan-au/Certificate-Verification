import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { shortFingerprint } from './hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const certificateDir = path.join(publicDir, 'generated', 'certificates');
const qrDir = path.join(publicDir, 'generated', 'qr');

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, '_');
}

async function ensureOutputDirs() {
  await fs.mkdir(certificateDir, { recursive: true });
  await fs.mkdir(qrDir, { recursive: true });
}

export async function generateCertificateAssets(certificate, verificationUrl) {
  await ensureOutputDirs();

  const baseName = safeFileName(certificate.certificateId);
  const qrAbsolutePath = path.join(qrDir, `${baseName}.png`);
  const certificateAbsolutePath = path.join(certificateDir, `${baseName}.png`);

  await QRCode.toFile(qrAbsolutePath, verificationUrl, {
    width: 260,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#12223b',
      light: '#ffffff'
    }
  });

  const qrData = await fs.readFile(qrAbsolutePath);
  const qrDataUri = `data:image/png;base64,${qrData.toString('base64')}`;
  const fingerprint = shortFingerprint(certificate.certificateHash);

  const svg = `
    <svg width="1400" height="980" viewBox="0 0 1400 980" xmlns="http://www.w3.org/2000/svg">
      <rect width="1400" height="980" fill="#f7f3ea"/>
      <rect x="54" y="54" width="1292" height="872" fill="#fffdf7" stroke="#18324d" stroke-width="6"/>
      <rect x="86" y="86" width="1228" height="808" fill="none" stroke="#c9a45b" stroke-width="3"/>
      <text x="700" y="160" text-anchor="middle" font-family="Georgia, serif" font-size="54" fill="#18324d" font-weight="700">${escapeXml(certificate.universityName)}</text>
      <text x="700" y="222" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#536171">Certificate of Completion</text>
      <line x1="320" y1="258" x2="1080" y2="258" stroke="#c9a45b" stroke-width="3"/>

      <text x="700" y="335" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#536171">This certifies that</text>
      <text x="700" y="412" text-anchor="middle" font-family="Georgia, serif" font-size="58" fill="#111827" font-weight="700">${escapeXml(certificate.studentName)}</text>
      <text x="700" y="466" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#536171">Student ID: ${escapeXml(certificate.studentId)}</text>

      <text x="700" y="545" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" fill="#536171">has successfully completed</text>
      <text x="700" y="604" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#18324d" font-weight="700">${escapeXml(certificate.program)}</text>

      <text x="260" y="720" font-family="Arial, sans-serif" font-size="24" fill="#536171">Grade</text>
      <text x="260" y="758" font-family="Arial, sans-serif" font-size="31" fill="#111827" font-weight="700">${escapeXml(certificate.grade)}</text>

      <text x="260" y="820" font-family="Arial, sans-serif" font-size="24" fill="#536171">Issue Date</text>
      <text x="260" y="858" font-family="Arial, sans-serif" font-size="31" fill="#111827" font-weight="700">${escapeXml(certificate.issueDate)}</text>

      <text x="760" y="720" font-family="Arial, sans-serif" font-size="24" fill="#536171">Certificate ID</text>
      <text x="760" y="758" font-family="Arial, sans-serif" font-size="31" fill="#111827" font-weight="700">${escapeXml(certificate.certificateId)}</text>

      <text x="760" y="820" font-family="Arial, sans-serif" font-size="24" fill="#536171">Proof Fingerprint</text>
      <text x="760" y="858" font-family="Arial, sans-serif" font-size="28" fill="#111827" font-weight="700">${escapeXml(fingerprint)}</text>

      <rect x="1090" y="675" width="178" height="178" fill="#ffffff" stroke="#d5dbe3" stroke-width="2"/>
      <image x="1100" y="685" width="158" height="158" href="${qrDataUri}"/>
      <text x="1179" y="880" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#536171">Scan to verify</text>
    </svg>
  `;

  await sharp(Buffer.from(svg)).png().toFile(certificateAbsolutePath);

  return {
    certificatePath: `/generated/certificates/${baseName}.png`,
    qrPath: `/generated/qr/${baseName}.png`,
    certificateAbsolutePath,
    qrAbsolutePath
  };
}
