import { keccak256, toUtf8Bytes } from 'ethers';

const requiredFields = [
  'certificateId',
  'studentName',
  'studentId',
  'program',
  'grade',
  'issueDate',
  'universityName'
];

export function normalizeCertificateInput(input) {
  const normalized = {};

  for (const field of requiredFields) {
    const value = input[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${field} is required`);
    }
    normalized[field] = value.trim();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.issueDate)) {
    throw new Error('issueDate must use YYYY-MM-DD format');
  }

  const parsedDate = new Date(`${normalized.issueDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('issueDate is not a valid date');
  }

  return normalized;
}

export function createCanonicalCertificateString(input) {
  const normalized = normalizeCertificateInput(input);
  return requiredFields.map((field) => normalized[field]).join('|');
}

export function hashCertificate(input) {
  const canonicalString = createCanonicalCertificateString(input);
  return {
    canonicalString,
    certificateHash: keccak256(toUtf8Bytes(canonicalString))
  };
}

export function shortFingerprint(hash) {
  if (!hash || hash.length < 14) {
    return 'Unavailable';
  }
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}
