// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIssuerRegistry {
    function isApprovedIssuer(address issuer) external view returns (bool);
}

contract CertificateRegistry {
    // Only this minimal proof is stored on-chain. Full certificate data stays off-chain.
    struct CertificateProof {
        bytes32 certificateHash;
        address issuer;
        uint256 issuedAt;
        bool exists;
    }

    IIssuerRegistry public issuerRegistry;
    mapping(string => CertificateProof) private certificates;

    event CertificateIssued(
        string indexed certificateId,
        bytes32 indexed certificateHash,
        address indexed issuer,
        uint256 issuedAt
    );

    constructor(address issuerRegistryAddress) {
        require(issuerRegistryAddress != address(0), "Invalid registry");
        issuerRegistry = IIssuerRegistry(issuerRegistryAddress);
    }

    // Approved staff wallets store one immutable proof hash per certificate ID.
    function issueCertificate(
        string calldata certificateId,
        bytes32 certificateHash
    ) external {
        require(bytes(certificateId).length > 0, "Certificate ID required");
        require(certificateHash != bytes32(0), "Certificate hash required");
        require(!certificates[certificateId].exists, "Certificate already exists");

        // Direct contract interaction: ask IssuerRegistry whether msg.sender is approved.
        require(issuerRegistry.isApprovedIssuer(msg.sender), "Issuer not approved");

        certificates[certificateId] = CertificateProof({
            certificateHash: certificateHash,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            exists: true
        });

        emit CertificateIssued(
            certificateId,
            certificateHash,
            msg.sender,
            block.timestamp
        );
    }

    function certificateExists(string calldata certificateId) external view returns (bool) {
        return certificates[certificateId].exists;
    }

    // Public read used by the backend during QR verification. This costs no gas.
    function getCertificate(
        string calldata certificateId
    )
        external
        view
        returns (
            bytes32 certificateHash,
            address issuer,
            uint256 issuedAt,
            bool exists
        )
    {
        CertificateProof memory proof = certificates[certificateId];
        return (
            proof.certificateHash,
            proof.issuer,
            proof.issuedAt,
            proof.exists
        );
    }
}
