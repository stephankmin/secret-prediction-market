pragma solidity ^0.8.11;

import "./ISecretPredictionMarket.sol";

contract SecretPredictionMarket is ISecretPredictionMarket {
    uint256 public totalPot;
    uint256 public winningPot;
    uint256 public losingPot;
    uint256 public winningReveals;
    bool public eventOccured;

    mapping(address => PredictionCommit) players;

    struct PredictionCommit {
        bytes32 commitment;
        uint256 wager;
        Choice choice;
    }

    function commitChoice(bytes32 commitment) external payable {}

    function revealChoice(Choice choice, bytes32 blindingFactor) external {}

    function claimWinnings() external {}

    function reportEvent() external {}
}
