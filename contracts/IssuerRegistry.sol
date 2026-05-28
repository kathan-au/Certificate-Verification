// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract IssuerRegistry {
    // The wallet that deployed this contract becomes the university admin.
    address public admin;

    // Approved university staff wallets are allowed to issue certificate proofs.
    mapping(address => bool) private approvedIssuers;

    event IssuerApproved(address indexed issuer);
    event IssuerRemoved(address indexed issuer);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // Admin adds a staff wallet to the approved issuer list.
    function approveIssuer(address issuer) external onlyAdmin {
        require(issuer != address(0), "Invalid issuer");
        approvedIssuers[issuer] = true;
        emit IssuerApproved(issuer);
    }

    // Admin removes a staff wallet from the approved issuer list.
    function removeIssuer(address issuer) external onlyAdmin {
        require(issuer != address(0), "Invalid issuer");
        approvedIssuers[issuer] = false;
        emit IssuerRemoved(issuer);
    }

    // CertificateRegistry calls this before accepting a certificate hash.
    function isApprovedIssuer(address issuer) external view returns (bool) {
        return approvedIssuers[issuer];
    }
}
