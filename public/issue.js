const connectButton = document.querySelector('#connectWallet');
const issueButton = document.querySelector('#issueButton');
const certificateForm = document.querySelector('#certificateForm');
const issueDateInput = document.querySelector('#issueDate');

const walletStatus = document.querySelector('#walletStatus');
const formStatus = document.querySelector('#formStatus');
const previewEmpty = document.querySelector('#previewEmpty');
const certificatePreview = document.querySelector('#certificatePreview');
const proofDetails = document.querySelector('#proofDetails');
const downloadActions = document.querySelector('#downloadActions');
const downloadCertificate = document.querySelector('#downloadCertificate');
const openVerification = document.querySelector('#openVerification');

let appConfig;
let issuerWallet;
let issuerRegistry;
let certificateRegistry;

issueDateInput.valueAsDate = new Date();
connectButton.addEventListener('click', connectIssuerWallet);
certificateForm.addEventListener('submit', issueCertificate);

// Connect MetaMask, switch to Sepolia, and check that this staff wallet is approved.
async function connectIssuerWallet() {
  try {
    requireMetaMask();

    appConfig = await loadAppConfig();
    await connectMetaMask();
    await switchToRequiredNetwork();

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    issuerWallet = await signer.getAddress();

    issuerRegistry = new ethers.Contract(
      appConfig.issuerRegistryAddress,
      appConfig.issuerRegistryAbi,
      provider
    );

    certificateRegistry = new ethers.Contract(
      appConfig.certificateRegistryAddress,
      appConfig.certificateRegistryAbi,
      signer
    );

    const isApproved = await issuerRegistry.isApprovedIssuer(issuerWallet);
    walletStatus.textContent = `${shortAddress(issuerWallet)} connected`;
    walletStatus.className = 'status success';

    if (!isApproved) {
      issueButton.disabled = true;
      showStatus(formStatus, 'This wallet is not approved to issue certificates.', 'error');
      return;
    }

    issueButton.disabled = false;
    showStatus(formStatus, 'Approved issuer wallet connected.', 'success');
  } catch (error) {
    issueButton.disabled = true;
    showStatus(formStatus, getErrorMessage(error), 'error');
  }
}

// Prepare the off-chain certificate first, then write the proof hash on-chain through MetaMask.
async function issueCertificate(event) {
  event.preventDefault();

  if (!issuerWallet || !certificateRegistry) {
    showStatus(formStatus, 'Connect an approved issuer wallet first.', 'error');
    return;
  }

  issueButton.disabled = true;
  showStatus(formStatus, 'Creating the certificate image and QR code...', 'warning');

  try {
    const preparedCertificate = await prepareCertificate();
    showCertificatePreview(preparedCertificate);

    showStatus(formStatus, 'Confirm the Sepolia transaction in MetaMask.', 'warning');
    const transaction = await certificateRegistry.issueCertificate(
      preparedCertificate.certificateId,
      preparedCertificate.certificateHash
    );

    showStatus(formStatus, 'Transaction submitted. Waiting for confirmation...', 'warning');
    await transaction.wait();

    await saveTransactionHash(preparedCertificate.certificateId, transaction.hash);
    addProofDetail('Blockchain Tx', transaction.hash);

    showStatus(formStatus, 'Certificate proof issued successfully.', 'success');
    certificateForm.reset();
    issueDateInput.valueAsDate = new Date();
  } catch (error) {
    showStatus(formStatus, getErrorMessage(error), 'error');
  } finally {
    issueButton.disabled = false;
  }
}

// Load deployed contract addresses and ABIs from the backend.
async function loadAppConfig() {
  const response = await fetch('/api/config');
  const config = await response.json();

  if (!config.contractsConfigured) {
    throw new Error('Contract addresses are not configured in .env.');
  }

  return config;
}

async function connectMetaMask() {
  await window.ethereum.request({ method: 'eth_requestAccounts' });
}

// The prototype expects Sepolia, so ask MetaMask to switch if needed.
async function switchToRequiredNetwork() {
  const requiredChainId = `0x${Number(appConfig.chainId).toString(16)}`;
  const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });

  if (currentChainId !== requiredChainId) {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: requiredChainId }]
    });
  }
}

// Ask the backend to validate, hash, save, and generate the certificate image/QR.
async function prepareCertificate() {
  const payload = Object.fromEntries(new FormData(certificateForm).entries());
  payload.issuerWallet = issuerWallet;

  const response = await fetch('/api/certificates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Certificate preparation failed.');
  }

  return result;
}

// Store the transaction hash only after the blockchain transaction has been mined.
async function saveTransactionHash(certificateId, txHash) {
  const response = await fetch(`/api/certificates/${encodeURIComponent(certificateId)}/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txHash,
      issuerWallet
    })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Transaction was mined, but saving the hash failed.');
  }
}

// Show the generated certificate image and the proof values returned by the backend.
function showCertificatePreview(certificate) {
  previewEmpty.hidden = true;
  certificatePreview.hidden = false;
  certificatePreview.src = certificate.certificateImageUrl;
  certificatePreview.alt = `Certificate ${certificate.certificateId}`;

  downloadCertificate.href = certificate.certificateImageUrl;
  openVerification.href = certificate.verificationUrl;
  downloadActions.hidden = false;

  proofDetails.hidden = false;
  proofDetails.innerHTML = '';
  addProofDetail('Certificate ID', certificate.certificateId);
  addProofDetail('Certificate Hash', certificate.certificateHash);
  addProofDetail('Verification URL', certificate.verificationUrl);
}

function addProofDetail(label, value) {
  const wrapper = document.createElement('div');
  const title = document.createElement('dt');
  const detail = document.createElement('dd');

  title.textContent = label;
  detail.textContent = value;
  detail.className = value.startsWith('0x') ? 'mono' : '';

  wrapper.append(title, detail);
  proofDetails.append(wrapper);
}

// This page needs MetaMask for writes and ethers.js for contract calls.
function requireMetaMask() {
  if (!window.ethereum || !window.ethers) {
    throw new Error('MetaMask and ethers.js are required.');
  }
}

function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status ${type}`;
}

function getErrorMessage(error) {
  return error.reason || error.message || 'Something went wrong.';
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
