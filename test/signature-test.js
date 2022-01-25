const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SecretPredictionMarket", () => {
  // contract factories and instances
  let SecretPredictionMarket;
  let secretPredictionMarket;
  let MockPriceOracle;
  let mockOracle;

  let accounts;
  let user1;
  let user1StartingBalance;
  let user2;
  let user2StartingBalance;
  let user3;
  let testBlindingFactor;

  let user1AddressBytes32;
  let user2AddressBytes32;
  let yesChoiceBytes32;
  let noChoiceBytes32;

  // timestamp of most recent block to help set deadlines
  let mostRecentBlockTimestamp;

  // constructor parameters
  let benchmarkPrice;
  let fixedWager;
  let commitDeadline;
  let revealDeadline;
  let eventDeadline;
  let payoutDeadline;
  let priceOracleAddress;

  before(async () => {
    accounts = await ethers.getSigners();

    user1 = accounts[0];
    user1AddressBytes32 = ethers.utils.hexZeroPad(
      ethers.utils.hexlify(user1.address),
      32
    );
    user1StartingBalance = await ethers.provider.getBalance(user1.address);

    user2 = accounts[1];
    user2AddressBytes32 = ethers.utils.hexZeroPad(
      ethers.utils.hexlify(user2.address),
      32
    );
    user2StartingBalance = await ethers.provider.getBalance(user2.address);

    user3 = accounts[2];

    testBlindingFactor = ethers.utils.formatBytes32String("0x12");

    yesChoiceBytes32 = ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32);
    noChoiceBytes32 = ethers.utils.hexZeroPad(ethers.utils.hexlify(2), 32);

    // deploy mock price oracle and assign mock oracle address
    MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    mockOracle = await MockPriceOracle.deploy();
    await mockOracle.deployed();
    priceOracleAddress = mockOracle.address;

    // retrieve timestamp of most recent block
    const mostRecentBlockNumber = await ethers.provider.getBlockNumber();
    const mostRecentBlock = await ethers.provider.getBlock(
      mostRecentBlockNumber
    );
    mostRecentBlockTimestamp = mostRecentBlock.timestamp;

    // arbitrary params for prediction market contract
    benchmarkPrice = 5000;
    fixedWager = ethers.utils.parseEther("1.0");
    commitDeadline = ethers.BigNumber.from(mostRecentBlockTimestamp).add(
      "5000"
    );
    eventDeadline = ethers.BigNumber.from(mostRecentBlockTimestamp).add(
      "10000"
    );
    revealDeadline = ethers.BigNumber.from(mostRecentBlockTimestamp).add(
      "15000"
    );
    payoutDeadline = ethers.BigNumber.from(mostRecentBlockTimestamp).add(
      "20000"
    );

    SecretPredictionMarket = await ethers.getContractFactory(
      "SecretPredictionMarket"
    );
    secretPredictionMarket = await SecretPredictionMarket.deploy(
      benchmarkPrice,
      fixedWager,
      commitDeadline,
      revealDeadline,
      eventDeadline,
      payoutDeadline,
      priceOracleAddress
    );
    await secretPredictionMarket.deployed();
  });

  describe("getSigner()", () => {
    let messageString;
    let messageHash;
    let messageHashBinary;
    let signature;

    it("should return true", async () => {
      messageString = "hello";
      messageHash = ethers.utils.solidityKeccak256(["string"], [messageString]);
      messageHashBinary = ethers.utils.arrayify(messageHash);
      signature = await user1.signMessage(messageHashBinary);

      const getSignerTransaction = await secretPredictionMarket.getSigner(
        messageString,
        signature
      );
    });
  });
});
