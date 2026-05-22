// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIssuerRegistry {
    function isApprovedIssuer(address issuer) external view returns (bool);
}

contract CertificateRegistry {
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

    function issueCertificate(
        string calldata certificateId,
        bytes32 certificateHash
    ) external {
        require(bytes(certificateId).length > 0, "Certificate ID required");
        require(certificateHash != bytes32(0), "Certificate hash required");
        require(!certificates[certificateId].exists, "Certificate already exists");
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
