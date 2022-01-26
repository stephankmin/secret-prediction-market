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
    uint256 public immutable eventDeadline;
    uint256 public immutable revealDeadline;
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

    function recoverSigner(bytes32 commitment, bytes memory signature)
        public
        view
        returns (address)
    {
        bytes32 payloadHash = keccak256(abi.encode(commitment));
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(signature);

        bytes32 messageHash = _prefixed(payloadHash);

        address recoveredSigner = ecrecover(messageHash, v, r, s);
        console.log(recoveredSigner);

        return recoveredSigner;
    }

    function _prefixed(bytes32 hash) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }

    function splitSignature(bytes memory signature)
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
            recoverSigner(commitment, signature) == predictor,
            "Recovered signer does not match predictor"
        );
        console.log(predictor);

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

    function testHash(Choice choice, bytes32 blindingFactor)
        external
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(msg.sender, choice, blindingFactor));
    }

    function reportEvent() external returns (bool) {
        require(block.timestamp < eventDeadline, "Event deadline has passed");

        (, int256 price, , , ) = priceOracle.latestRoundData();

        if (price > benchmarkPrice) {
            eventHasOccurred = true;
            emit EventHasOccurred(block.number);
        }

        return eventHasOccurred;
    }

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

        console.log("smart contract winnings: ", winnings);

        (bool success, ) = predictor.call{value: winnings}("");
        require(success);

        emit Payout(predictor, winnings);
    }
}
