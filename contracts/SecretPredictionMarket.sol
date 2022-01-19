pragma solidity ^0.8.11;

import "./ISecretPredictionMarket.sol";
import "./PriceOracle.sol";
import "hardhat/console.sol";

contract SecretPredictionMarket is ISecretPredictionMarket {
    uint256 public totalPot;
    uint256 public winningPot;
    uint256 public losingPot;
    uint256 public numOfWinningReveals;

    int256 public immutable benchmarkPrice;
    uint256 public immutable fixedWager;
    uint256 public immutable commitDeadline;
    uint256 public immutable revealDeadline;
    uint256 public immutable eventDeadline;
    uint256 public immutable payoutDeadline;
    PriceOracle public immutable priceOracle;

    bool public eventHasOccurred;

    mapping(address => Prediction) public predictions;

    event Commit(address player, uint256 wager);
    event EventHasOccurred(uint256 blockNumber);
    event Reveal(address player, Choice choice);
    event Payout(address player, uint256 winnings);

    struct Prediction {
        bool hasCommitted;
        bool hasClaimedWinnings;
        bytes32 commitment;
        uint256 wager;
        Choice choice;
    }

    constructor(
        int256 _benchmarkPrice,
        uint256 _fixedWager,
        uint256 _commitDeadline,
        uint256 _revealDeadline,
        uint256 _eventDeadline,
        uint256 _payoutDeadline,
        address _priceOracleAddress
    ) {
        benchmarkPrice = _benchmarkPrice;
        priceOracle = PriceOracle(_priceOracleAddress);
        fixedWager = _fixedWager;
        commitDeadline = _commitDeadline;
        revealDeadline = _revealDeadline;
        eventDeadline = _eventDeadline;
        payoutDeadline = _payoutDeadline;
    }

    function commitChoice(bytes32 commitment) external payable {
        require(block.timestamp < commitDeadline, "Commit deadline has passed");

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
            false,
            commitment,
            msg.value,
            Choice.Hidden
        );

        emit Commit(msg.sender, msg.value);
    }

    function testHash(Choice choice, bytes32 blindingFactor)
        external
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(msg.sender, choice, blindingFactor));
    }

    function revealChoice(Choice choice, bytes32 blindingFactor) external {
        require(block.timestamp < revealDeadline, "Reveal deadline has passed");

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
            keccak256(abi.encode(msg.sender, choice, blindingFactor)) ==
                prediction.commitment,
            "Hash does not match commitment"
        );
        prediction.choice = choice;

        if (
            (eventHasOccurred && prediction.choice == Choice.Yes) ||
            (!eventHasOccurred && prediction.choice == Choice.No)
        ) {
            numOfWinningReveals++;
            winningPot += prediction.wager;
        }

        emit Reveal(msg.sender, prediction.choice);
    }

    function claimWinnings() external {
        require(block.timestamp < payoutDeadline, "Payout deadline has passed");

        require(
            !predictions[msg.sender].hasClaimedWinnings,
            "User has already claimed winnings"
        );

        Prediction memory prediction = predictions[msg.sender];
        uint256 winnings = prediction.wager +
            (prediction.wager / winningPot) *
            losingPot;

        (bool success, ) = msg.sender.call{value: winnings}("");
        require(success);

        emit Payout(msg.sender, winnings);
    }

    function reportEvent() external returns (bool) {
        require(!eventHasOccurred, "Event has already occurred");

        require(block.timestamp < eventDeadline, "Event deadline has passed");

        (, int256 price, , , ) = priceOracle.latestRoundData();

        if (price > benchmarkPrice) {
            eventHasOccurred = true;
            emit EventHasOccurred(block.number);
        }

        return eventHasOccurred;
    }
}
