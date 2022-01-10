pragma solidity ^0.8.11;

import "./PriceOracle.sol";

contract MockPriceOracle is PriceOracle {
    uint256 ethPrice;

    function latestRoundData()
        external
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ); {}

    function setEthPrice(uint256 price) public {
        ethPrice = price;
    }
}
