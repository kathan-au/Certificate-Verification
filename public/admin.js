const connectButton = document.querySelector('#connectWallet');
const approveButton = document.querySelector('#approveButton');
const removeButton = document.querySelector('#removeButton');
const checkButton = document.querySelector('#checkButton');
const issuerWalletInput = document.querySelector('#issuerWallet');

const walletStatus = document.querySelector('#walletStatus');
const adminStatus = document.querySelector('#adminStatus');
const issuerRegistryAddressText = document.querySelector('#issuerRegistryAddress');
const adminWalletText = document.querySelector('#adminWallet');
const connectedWalletText = document.querySelector('#connectedWallet');

let appConfig;
let issuerRegistry;
let connectedWallet;

connectButton.addEventListener('click', connectAdminWallet);
approveButton.addEventListener('click', approveIssuer);
removeButton.addEventListener('click', removeIssuer);
checkButton.addEventListener('click', checkIssuer);

async function connectAdminWallet() {
  try {
    requireMetaMask();

    appConfig = await loadAppConfig();
    await connectMetaMask();
    await switchToRequiredNetwork();

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    connectedWallet = await signer.getAddress();

    issuerRegistry = new ethers.Contract(
      appConfig.issuerRegistryAddress,
      appConfig.issuerRegistryAbi,
      signer
    );

    const adminWallet = await issuerRegistry.admin();
    const isAdmin = connectedWallet.toLowerCase() === adminWallet.toLowerCase();

    connectedWalletText.textContent = connectedWallet;
    adminWalletText.textContent = adminWallet;
    walletStatus.textContent = `${shortAddress(connectedWallet)} connected`;
    walletStatus.className = 'status success';

    approveButton.disabled = !isAdmin;
    removeButton.disabled = !isAdmin;
    checkButton.disabled = false;

    showStatus(
      adminStatus,
      isAdmin
        ? 'Admin wallet connected. You can manage issuers.'
        : 'This wallet can only check issuer status.',
      isAdmin ? 'success' : 'warning'
    );
  } catch (error) {
    showStatus(adminStatus, getErrorMessage(error), 'error');
  }
}

async function approveIssuer() {
  await sendIssuerTransaction('approve');
}

async function removeIssuer() {
  await sendIssuerTransaction('remove');
}

async function sendIssuerTransaction(action) {
  try {
    const wallet = getIssuerWallet();
    const actionText = action === 'approve' ? 'Approving issuer...' : 'Removing issuer...';
    showStatus(adminStatus, actionText, 'warning');

    const transaction = action === 'approve'
      ? await issuerRegistry.approveIssuer(wallet)
      : await issuerRegistry.removeIssuer(wallet);

    await transaction.wait();

    showStatus(
      adminStatus,
      action === 'approve' ? `Issuer approved: ${wallet}` : `Issuer removed: ${wallet}`,
      'success'
    );
  } catch (error) {
    showStatus(adminStatus, getErrorMessage(error), 'error');
  }
}

async function checkIssuer() {
  try {
    const wallet = getIssuerWallet();
    const isApproved = await issuerRegistry.isApprovedIssuer(wallet);

    showStatus(
      adminStatus,
      isApproved ? `${wallet} is approved to issue.` : `${wallet} is not approved.`,
      isApproved ? 'success' : 'warning'
    );
  } catch (error) {
    showStatus(adminStatus, getErrorMessage(error), 'error');
  }
}

async function loadAppConfig() {
  const response = await fetch('/api/config');
  const config = await response.json();

  issuerRegistryAddressText.textContent = config.issuerRegistryAddress || 'Not configured';

  if (!config.contractsConfigured) {
    throw new Error('Contract addresses are not configured in .env.');
  }

  return config;
}

async function connectMetaMask() {
  await window.ethereum.request({ method: 'eth_requestAccounts' });
}

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

function getIssuerWallet() {
  const wallet = issuerWalletInput.value.trim();

  if (!ethers.isAddress(wallet)) {
    throw new Error('Enter a valid staff wallet address.');
  }

  return wallet;
}

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
