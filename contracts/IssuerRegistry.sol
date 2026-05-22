// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract IssuerRegistry {
    address public admin;
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

    function approveIssuer(address issuer) external onlyAdmin {
        require(issuer != address(0), "Invalid issuer");
        approvedIssuers[issuer] = true;
        emit IssuerApproved(issuer);
    }

    function removeIssuer(address issuer) external onlyAdmin {
        require(issuer != address(0), "Invalid issuer");
        approvedIssuers[issuer] = false;
        emit IssuerRemoved(issuer);
    }

    function isApprovedIssuer(address issuer) external view returns (bool) {
        return approvedIssuers[issuer];
    }
}
