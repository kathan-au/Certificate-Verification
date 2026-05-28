import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Contract, JsonRpcProvider, isAddress } from 'ethers';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const chainId = Number(process.env.CHAIN_ID || 11155111);
export const issuerRegistryAddress = process.env.ISSUER_REGISTRY_ADDRESS || '';
export const certificateRegistryAddress = process.env.CERTIFICATE_REGISTRY_ADDRESS || '';

let provider;
let issuerAbi;
let certificateAbi;

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

// ABIs are served to the browser so MetaMask can call the deployed contracts.
export async function getAbis() {
  if (!issuerAbi) {
    issuerAbi = await readJson(path.join(rootDir, 'abi', 'IssuerRegistry.json'));
  }
  if (!certificateAbi) {
    certificateAbi = await readJson(path.join(rootDir, 'abi', 'CertificateRegistry.json'));
  }
  return {
    issuerRegistryAbi: issuerAbi,
    certificateRegistryAbi: certificateAbi
  };
}

// The backend uses a read-only provider for public verification. It never signs transactions.
export function getProvider() {
  if (!process.env.SEPOLIA_RPC_URL) {
    throw new Error('SEPOLIA_RPC_URL is not configured');
  }

  if (!provider) {
    provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL, chainId);
  }

  return provider;
}

// Routes use this guard to show a clear setup error before trying blockchain reads.
export function contractsAreConfigured() {
  return (
    isAddress(issuerRegistryAddress) &&
    issuerRegistryAddress !== '0x0000000000000000000000000000000000000000' &&
    isAddress(certificateRegistryAddress) &&
    certificateRegistryAddress !== '0x0000000000000000000000000000000000000000'
  );
}

// Build read-only contract instances for backend verification checks.
export async function getReadContracts() {
  if (!contractsAreConfigured()) {
    throw new Error('Contract addresses are not configured');
  }

  const { issuerRegistryAbi, certificateRegistryAbi } = await getAbis();
  const rpcProvider = getProvider();

  return {
    issuerRegistry: new Contract(issuerRegistryAddress, issuerRegistryAbi, rpcProvider),
    certificateRegistry: new Contract(
      certificateRegistryAddress,
      certificateRegistryAbi,
      rpcProvider
    )
  };
}

// Read the immutable proof stored by CertificateRegistry for one certificate ID.
export async function getCertificateProof(certificateId) {
  const { certificateRegistry } = await getReadContracts();
  const [certificateHash, issuer, issuedAt, exists] =
    await certificateRegistry.getCertificate(certificateId);

  return {
    certificateHash,
    issuer,
    issuedAt: Number(issuedAt),
    exists
  };
}

// Used during preparation to reject issuance from a wallet that is not approved.
export async function isApprovedIssuer(address) {
  if (!isAddress(address)) {
    return false;
  }

  const { issuerRegistry } = await getReadContracts();
  return issuerRegistry.isApprovedIssuer(address);
}
