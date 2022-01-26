interface ISecretPredictionMarket {
    enum Choice {
        Hidden,
        Yes,
        No
    }

    function commitChoice(
        bytes32 commitment,
        bytes memory signature,
        address predictor
    ) external payable;

    function revealChoice(
        Choice choice,
        bytes32 blindingFactor,
        address predictor
    ) external;

    function reportEvent() external returns (bool);
}
