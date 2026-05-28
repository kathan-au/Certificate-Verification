import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { isAddress } from 'ethers';
import {
  certificateRegistryAddress,
  chainId,
  contractsAreConfigured,
  getAbis,
  getCertificateProof,
  issuerRegistryAddress,
  isApprovedIssuer
} from './blockchain.js';
import {
  getCertificateByToken,
  saveCertificate,
  saveTransactionHash
} from './db.js';
import { generateCertificateAssets } from './certificateImage.js';
import { hashCertificate } from './hash.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const port = Number(process.env.PORT || 3000);

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

// Serve the browser build of ethers.js from node_modules for the plain HTML frontend.
app.get('/vendor/ethers.js', (request, response) => {
  const ethersPath = path.join(rootDir, 'node_modules', 'ethers', 'dist', 'ethers.umd.min.js');

  if (!fs.existsSync(ethersPath)) {
    response.status(404).send('ethers.js has not been installed. Run npm install.');
    return;
  }

  response.sendFile(ethersPath);
});

app.get('/', (request, response) => {
  response.redirect('/issue.html');
});

// Public QR verification page. Employers do not need a wallet or gas.
app.get('/verify/:token', async (request, response) => {
  const result = await verifyCertificate(request.params.token);
  const pageStatus = result.httpStatus === 404 ? 404 : 200;
  response.status(pageStatus).send(renderVerificationPage(result));
});

// Frontend uses this to learn the deployed contract addresses and ABIs.
app.get('/api/config', async (request, response) => {
  const { issuerRegistryAbi, certificateRegistryAbi } = await getAbis();

  response.json({
    chainId,
    issuerRegistryAddress,
    certificateRegistryAddress,
    contractsConfigured: contractsAreConfigured(),
    issuerRegistryAbi,
    certificateRegistryAbi
  });
});

// Prepare the off-chain certificate record before the staff submits the on-chain transaction.
app.post('/api/certificates', async (request, response) => {
  try {
    const issuerWallet = normalizeWallet(request.body.issuerWallet);
    if (issuerWallet && contractsAreConfigured()) {
      const approved = await isApprovedIssuer(issuerWallet);
      if (!approved) {
        response.status(403).json({
          error: 'This wallet is not approved to issue certificates'
        });
        return;
      }
    }

    const certificateInput = {
      certificateId: request.body.certificateId,
      studentName: request.body.studentName,
      studentId: request.body.studentId,
      program: request.body.program,
      grade: request.body.grade,
      issueDate: request.body.issueDate,
      universityName: request.body.universityName
    };

    const { certificateHash } = hashCertificate(certificateInput);
    const qrToken = crypto.randomBytes(24).toString('hex');
    const verificationUrl = `${getBaseUrl()}/verify/${qrToken}`;

    const certificate = {
      ...certificateInput,
      certificateHash,
      qrToken,
      issuerWallet
    };

    const assets = await generateCertificateAssets(certificate, verificationUrl);
    await saveCertificate(certificate, assets);

    response.status(201).json({
      certificateId: certificate.certificateId,
      certificateHash,
      verificationUrl,
      certificateImageUrl: assets.certificatePath,
      issuerWallet
    });
  } catch (error) {
    const duplicate = error?.code === 'ER_DUP_ENTRY';
    response.status(duplicate ? 409 : 400).json({
      error: duplicate
        ? 'Certificate ID or QR token already exists'
        : error.message
    });
  }
});

// Save the mined blockchain transaction hash after MetaMask confirms issuance.
app.post('/api/certificates/:certificateId/transaction', async (request, response) => {
  try {
    const txHash = String(request.body.txHash || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      response.status(400).json({ error: 'Invalid transaction hash' });
      return;
    }

    const issuerWallet = normalizeWallet(request.body.issuerWallet);
    const saved = await saveTransactionHash(
      request.params.certificateId,
      txHash,
      issuerWallet
    );

    if (!saved) {
      response.status(404).json({ error: 'Certificate not found' });
      return;
    }

    response.json({
      certificateId: request.params.certificateId,
      txHash,
      issuerWallet
    });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// Keep unknown routes friendly for bad links and mistyped QR URLs.
app.use((request, response) => {
  response.status(404).send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Page Not Found</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <main class="shell verify-shell">
          <section class="panel result-panel">
            <span class="badge invalid">NOT FOUND</span>
            <h1>Page Not Found</h1>
            <p>The page or verification link could not be found.</p>
          </section>
        </main>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Certificate verification app running on http://localhost:${port}`);
});

function getBaseUrl() {
  return (process.env.APP_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
}

// Wallet addresses come from the browser, so validate them before saving or checking approval.
function normalizeWallet(wallet) {
  if (!wallet) {
    return null;
  }

  const normalized = String(wallet).trim();
  if (!isAddress(normalized)) {
    throw new Error('issuerWallet must be a valid Ethereum address');
  }

  return normalized;
}

// MySQL may return dates as Date objects or strings depending on configuration.
function formatDate(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value).slice(0, 10);
}

// Convert a database row back into the exact fields used by the canonical hash.
function toHashInput(row) {
  return {
    certificateId: row.certificate_id,
    studentName: row.student_name,
    studentId: row.student_id,
    program: row.program,
    grade: row.grade,
    issueDate: formatDate(row.issue_date),
    universityName: row.university_name
  };
}

// Only expose the fields that are useful on the public verification page.
function toPublicCertificate(row) {
  return {
    certificateId: row.certificate_id,
    studentName: row.student_name,
    studentId: row.student_id,
    program: row.program,
    grade: row.grade,
    issueDate: formatDate(row.issue_date),
    universityName: row.university_name,
    issuerWallet: row.issuer_wallet,
    certificateImageUrl: row.png_file_path
  };
}

// Main verification flow: compare recalculated off-chain hash with immutable on-chain proof.
async function verifyCertificate(token) {
  try {
    const certificate = await getCertificateByToken(token);
    if (!certificate) {
      return {
        httpStatus: 404,
        status: 'invalid',
        title: 'Certificate Not Found',
        message: 'The verification link does not match any stored certificate.'
      };
    }

    const publicCertificate = toPublicCertificate(certificate);
    const recalculated = hashCertificate(toHashInput(certificate));

    if (!contractsAreConfigured()) {
      return {
        httpStatus: 503,
        status: 'unavailable',
        title: 'Blockchain Not Configured',
        message: 'Contract addresses are not configured yet, so the proof cannot be checked.',
        certificate: publicCertificate
      };
    }

    const proof = await getCertificateProof(certificate.certificate_id);
    const databaseWasAltered =
      certificate.certificate_hash.toLowerCase() !==
      recalculated.certificateHash.toLowerCase();
    const chainHashMatches =
      proof.exists &&
      proof.certificateHash.toLowerCase() === recalculated.certificateHash.toLowerCase();
    const valid = proof.exists && !databaseWasAltered && chainHashMatches;

    return {
      httpStatus: valid ? 200 : 409,
      status: valid ? 'valid' : 'invalid',
      title: valid ? 'Certificate Valid' : 'Certificate Invalid',
      message: valid
        ? 'The certificate hash matches the immutable on-chain proof.'
        : 'The certificate does not match the immutable on-chain proof.',
      certificate: publicCertificate,
      checks: {
        proofExists: proof.exists,
        databaseWasAltered,
        chainHashMatches
      }
    };
  } catch (error) {
    return {
      httpStatus: 503,
      status: 'unavailable',
      title: 'Verification Temporarily Unavailable',
      message: 'The certificate record was found, but the blockchain proof could not be read.',
      detail: error.message
    };
  }
}

// Escape server-rendered values to avoid injecting untrusted certificate data into HTML.
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Render one simple public result page for valid, invalid, and unavailable states.
function renderVerificationPage(result) {
  const certificate = result.certificate;
  const badgeClass = result.status === 'valid'
    ? 'badge valid'
    : result.status === 'invalid'
      ? 'badge invalid'
      : 'badge warning';

  const details = certificate
    ? `
      <dl class="result-grid">
        <div>
          <dt>Student</dt>
          <dd>${escapeHtml(certificate.studentName)}</dd>
        </div>
        <div>
          <dt>University</dt>
          <dd>${escapeHtml(certificate.universityName)}</dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd>${escapeHtml(certificate.program)}</dd>
        </div>
        <div>
          <dt>Issue Date</dt>
          <dd>${escapeHtml(certificate.issueDate)}</dd>
        </div>
        <div>
          <dt>Certificate ID</dt>
          <dd>${escapeHtml(certificate.certificateId)}</dd>
        </div>
        <div>
          <dt>Issuer Wallet</dt>
          <dd class="mono">${escapeHtml(certificate.issuerWallet || 'Pending transaction')}</dd>
        </div>
      </dl>
    `
    : '';

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(result.title)}</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <main class="shell verify-shell">
          <section class="panel result-panel">
            <span class="${badgeClass}">${escapeHtml(result.status.toUpperCase())}</span>
            <h1>${escapeHtml(result.title)}</h1>
            <p>${escapeHtml(result.message)}</p>
            ${details}
            ${certificate?.certificateImageUrl
              ? `<a class="button secondary" href="${escapeHtml(certificate.certificateImageUrl)}" download>Download Certificate Image</a>`
              : ''}
          </section>
        </main>
      </body>
    </html>
  `;
}
