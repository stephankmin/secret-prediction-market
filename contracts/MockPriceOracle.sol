pragma solidity ^0.8.11;

import "./PriceOracle.sol";

contract MockPriceOracle is PriceOracle {
    int256 public ethPrice;

    constructor() {}

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = 0;
        answer = ethPrice;
        startedAt = 0;
        updatedAt = 0;
        answeredInRound = 0;
    }

    function setEthPrice(int256 price) public {
        ethPrice = price;
    }
}
