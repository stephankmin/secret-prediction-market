pragma solidity ^0.8.11;

import "./ISecretPredictionMarket.sol";

contract SecretPredictionMarket is ISecretPredictionMarket {
    uint256 public fixedWager;
    uint256 public totalPot;
    uint256 public winningPot;
    uint256 public losingPot;
    uint256 public numOfWinningReveals;

    uint256 public immutable commitDeadline;
    uint256 public immutable revealDeadline;
    uint256 public immutable eventDeadline;
    uint256 public immutable payoutDeadline;

    bool public eventHasOccured;

    mapping(address => Prediction) predictions;

    event Commit(address player, uint256 wager);
    event Reveal(address player, Choice choice);
    event Payout(address player, uint256 winnings);

    struct Prediction {
        bool hasCommitted;
        bytes32 commitment;
        uint256 wager;
        Choice choice;
    }

    constructor(
        uint256 _commitDeadline,
        uint256 _revealDeadline,
        uint256 _eventDeadline,
        uint256 _payoutDeadline
    ) {
        commitDeadline = _commitDeadline;
        revealDeadline = _revealDeadline;
        eventDeadline = _eventDeadline;
        payoutDeadline = _payoutDeadline;
    }

    function commitChoice(bytes32 commitment) external payable {
        require(
            block.timestamp <= commitDeadline,
            "Commit deadline has passed"
        );

        require(
            !predictions[msg.sender].hasCommitted,
            "Player has already committed their choice"
        );

        require(
            msg.value == fixedWager,
            "Player's wager does not match fixed wager"
        );

        totalPot += msg.value;

        predictions[msg.sender] = Prediction(
            true,
            commitment,
            msg.value,
            Choice.Hidden
        );

        emit Commit(msg.sender, msg.value);
    }

    function revealChoice(Choice choice, bytes32 blindingFactor) external {
        require(
            block.timestamp <= revealDeadline,
            "Reveal deadline has passed"
        );

        require(
            predictions[msg.sender].hasCommitted,
            "Player has no commit to reveal"
        );

        require(
            choice == Choice.Yes || choice == Choice.No,
            "Choice must be either 'Yes' or 'No'"
        );

        require(
            predictions[msg.sender].choice == Choice.Hidden,
            "Commit has already been revealed"
        );

        Prediction storage prediction = predictions[msg.sender];

        require(
            keccak256(abi.encodePacked(msg.sender, choice, blindingFactor)) ==
                prediction.commitment,
            "Hash does not match commitment"
        );
        prediction.choice = choice;

        if (
            (eventHasOccured && prediction.choice == Choice.Yes) ||
            (!eventHasOccured && prediction.choice == Choice.No)
        ) {
            numOfWinningReveals++;
            winningPot += prediction.wager;
        }

        emit Reveal(msg.sender, prediction.choice);
    }

    function claimWinnings() external {}

    function reportEvent() external {}
}
