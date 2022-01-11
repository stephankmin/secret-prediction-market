interface ISecretPredictionMarket {
    enum Choice {
        Hidden,
        Yes,
        No
    }

    function commitChoice(bytes32 commitment) external payable;

    function revealChoice(Choice choice, bytes32 blindingFactor) external;

    function reportEvent() external returns (bool);
}
