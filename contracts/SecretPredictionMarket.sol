pragma solidity ^0.8.11;

import "./ISecretPredictionMarket.sol";
import "./PriceOracle.sol";
import "hardhat/console.sol";

contract SecretPredictionMarket is ISecretPredictionMarket {
    uint256 public totalPot;
    uint256 public winningPot;
    uint256 public losingPot;
    uint256 public numOfWinningReveals;

    int256 public immutable benchmarkPrice; // price that must be exceeded before eventDeadline in order for event to occur
    uint256 public immutable fixedWager;
    uint256 public immutable commitDeadline; // deadline for user to commit choice
    uint256 public immutable eventDeadline; // deadline for benchmarkPrice to be exceeded
    uint256 public immutable revealDeadline; // deadline for user to reveal choice. unrevealed commitments are treated as losses
    uint256 public immutable payoutDeadline; // deadline to claim winnings
    PriceOracle public immutable priceOracle;

    bool public eventHasOccurred;

    mapping(address => Prediction) public predictions;

    event Commit(address player, uint256 wager);
    event EventHasOccurred(uint256 blockNumber);
    event Reveal(address player, Choice choice);
    event Payout(address player, uint256 winnings);

    struct Prediction {
        bool hasCommitted;
        bool hasWon;
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
        address _priceOracleAddress // price oracle address of asset being wagered on. as of now, contract only supports chainlink price oracles
    ) {
        benchmarkPrice = _benchmarkPrice;
        priceOracle = PriceOracle(_priceOracleAddress);
        fixedWager = _fixedWager;
        commitDeadline = _commitDeadline;
        revealDeadline = _revealDeadline;
        eventDeadline = _eventDeadline;
        payoutDeadline = _payoutDeadline;
    }

    /// @notice Recovers address of signer given a commitment and signature
    /// @param commitment Hash of Choice and blinding factor
    /// @param signature Signature of predictor
    function _recoverSigner(bytes32 commitment, bytes memory signature)
        internal
        pure
        returns (address)
    {
        bytes32 payloadHash = keccak256(abi.encode(commitment));
        (uint8 v, bytes32 r, bytes32 s) = _splitSignature(signature);

        bytes32 messageHash = _prefixed(payloadHash);

        address recoveredSigner = ecrecover(messageHash, v, r, s);

        return recoveredSigner;
    }

    /// @notice Adds prefix to hash of commitment to create message hash
    function _prefixed(bytes32 hash) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }

    /// @notice Returns v,r,s values for given signature
    function _splitSignature(bytes memory signature)
        internal
        pure
        returns (
            uint8 v,
            bytes32 r,
            bytes32 s
        )
    {
        require(signature.length == 65);

        assembly {
            // first 32 bytes, after the length prefix.
            r := mload(add(signature, 32))
            // second 32 bytes.
            s := mload(add(signature, 64))
            // final byte (first byte of the next 32 bytes).
            v := byte(0, mload(add(signature, 96)))
        }

        return (v, r, s);
    }

    /// @notice Commits a choice for a given predictor
    /// @param commitment Hash of choice and blinding factor
    /// @param signature Signature signed by predictor
    /// @param predictor Address of predictor committing choice
    function commitChoice(
        bytes32 commitment,
        bytes memory signature,
        address predictor
    ) external payable {
        require(block.timestamp < commitDeadline, "Commit deadline has passed");

        require(
            !predictions[predictor].hasCommitted,
            "Player has already committed their choice"
        );

        require(
            msg.value == fixedWager,
            "Player's wager does not match fixed wager"
        );

        require(
            _recoverSigner(commitment, signature) == predictor,
            "Recovered signer does not match predictor"
        );

        totalPot += msg.value;

        predictions[predictor] = Prediction(
            true,
            false,
            false,
            commitment,
            msg.value,
            Choice.Hidden
        );
        emit Commit(predictor, msg.value);
    }

    /// @notice Retrieves price from priceOracle and compares it to benchmarkPrice to see if event has occurred
    /// @return Boolean value representing event occurrence
    function reportEvent() external returns (bool) {
        require(block.timestamp < eventDeadline, "Event deadline has passed");

        (, int256 price, , , ) = priceOracle.latestRoundData();

        if (price > benchmarkPrice) {
            eventHasOccurred = true;
            emit EventHasOccurred(block.number);
        }

        return eventHasOccurred;
    }

    /// @notice Reveals choice of predictor given their choice and blinding factor
    function revealChoice(
        Choice choice,
        bytes32 blindingFactor,
        address predictor
    ) external {
        require(block.timestamp < revealDeadline, "Reveal deadline has passed");

        require(
            predictions[predictor].hasCommitted,
            "Player has no commit to reveal"
        );

        require(
            choice == Choice.Yes || choice == Choice.No,
            "Choice must be either 'Yes' or 'No'"
        );

        require(
            predictions[predictor].choice == Choice.Hidden,
            "Commit has already been revealed"
        );

        Prediction storage prediction = predictions[predictor];

        require(
            keccak256(abi.encode(choice, blindingFactor)) ==
                prediction.commitment,
            "Hash does not match commitment"
        );
        prediction.choice = choice;

        if (
            (eventHasOccurred && prediction.choice == Choice.Yes) ||
            (!eventHasOccurred && prediction.choice == Choice.No)
        ) {
            prediction.hasWon = true;
            numOfWinningReveals++;
            totalPot -= prediction.wager;
            winningPot += prediction.wager;
        } else {
            prediction.hasWon = false;
            totalPot -= prediction.wager;
            losingPot += prediction.wager;
        }

        emit Reveal(predictor, prediction.choice);
    }

    /// @notice Allows predictor to claim winnings once they have won
    function claimWinnings(address payable predictor) external {
        require(
            block.timestamp > revealDeadline,
            "Winnings can only be claimed after reveal deadline has passed"
        );

        require(block.timestamp < payoutDeadline, "Payout deadline has passed");

        require(predictions[predictor].hasWon, "Invalid claim");

        require(
            !predictions[predictor].hasClaimedWinnings,
            "User has already claimed winnings"
        );

        if (totalPot > 0) {
            losingPot += totalPot; // adds wagers from unrevealed commits to losingPot
            totalPot = 0;
        }

        Prediction memory prediction = predictions[predictor];
        uint256 winnings = prediction.wager +
            (prediction.wager / winningPot) *
            losingPot;
        console.log(prediction.wager);
        console.log(prediction.wager / winningPot);
        console.log(winningPot);
        console.log(losingPot);
        console.log(winnings);

        (bool success, ) = predictor.call{value: winnings}("");
        require(success, "Transaction failed");

        emit Payout(predictor, winnings);
    }
}
