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

  describe("commitChoice", () => {
    let commitChoiceSnapshotId;
    let commitment;
    let commitChoiceTransaction;

    before(async () => {
      commitment = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [user1AddressBytes32, yesChoiceBytes32, testBlindingFactor]
      );
    });

    beforeEach(async () => {
      commitChoiceSnapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await ethers.provider.send("evm_revert", [commitChoiceSnapshotId]);
    });

    it("should revert if commit deadline has passed", async () => {
      await network.provider.send("evm_increaseTime", [1000000]);
      await network.provider.send("evm_mine");

      await expect(
        secretPredictionMarket.commitChoice(commitment, { value: fixedWager })
      ).to.be.revertedWith("Commit deadline has passed");
    });

    it("should revert if user has already committed choice", async () => {
      commitChoiceTransaction = await secretPredictionMarket.commitChoice(
        commitment,
        { value: fixedWager }
      );
      await commitChoiceTransaction.wait();

      await expect(
        secretPredictionMarket.commitChoice(commitment, { value: fixedWager })
      ).to.be.revertedWith("Player has already committed their choice");
    });

    it("should revert if user wager != fixedWager", async () => {
      const incorrectWager = ethers.utils.parseEther("2.0");

      await expect(
        secretPredictionMarket.commitChoice(commitment, {
          value: incorrectWager,
        })
      ).to.be.revertedWith("Player's wager does not match fixed wager");
    });

    it("should store PredictionCommit for player in players mapping", async () => {
      commitChoiceTransaction = await secretPredictionMarket.commitChoice(
        commitment,
        { value: fixedWager }
      );
      await commitChoiceTransaction.wait();

      const playerCommitStruct = await secretPredictionMarket.predictions(
        user1.address
      );

      expect(playerCommitStruct["commitment"]).to.eq(commitment);

      expect(playerCommitStruct["wager"]).to.eq(fixedWager);

      expect(playerCommitStruct["choice"]).to.eq(0);
    });

    it("should emit Commit event", async () => {
      commitChoiceTransaction = await secretPredictionMarket.commitChoice(
        commitment,
        { value: fixedWager }
      );
      await commitChoiceTransaction.wait();

      expect(commitChoiceTransaction)
        .to.emit(secretPredictionMarket, "Commit")
        .withArgs(user1.address, fixedWager);
    });
  });

  describe("reportEvent", () => {
    let price;

    describe("when price is above benchmarkPrice", () => {
      let checkEventTransaction;
      let beforePriceSetAboveBenchmarkSnapshotId;

      before(async () => {
        beforePriceSetAboveBenchmarkSnapshotId = await ethers.provider.send(
          "evm_snapshot",
          []
        );
        price = 6000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        checkEventTransaction = await secretPredictionMarket.reportEvent();
        await checkEventTransaction.wait();
      });

      after(async () => {
        await ethers.provider.send("evm_revert", [
          beforePriceSetAboveBenchmarkSnapshotId,
        ]);
      });

      it("should set eventHasOccurred to true", async () => {
        const eventHasOccurred =
          await secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(true);
      });

      it("should emit EventHasOccurred event", async () => {
        expect(checkEventTransaction)
          .to.emit(secretPredictionMarket, "EventHasOccurred")
          .withArgs(checkEventTransaction.blockNumber);
      });
    });

    describe("when price is under benchmarkPrice", () => {
      let checkEventTransaction;
      let beforePriceSetUnderBenchmarkSnapshotId;

      before(async () => {
        beforePriceSetUnderBenchmarkSnapshotId = await ethers.provider.send(
          "evm_snapshot",
          []
        );

        price = 4000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        checkEventTransaction = await secretPredictionMarket.reportEvent();
        await checkEventTransaction.wait();
      });

      after(async () => {
        await ethers.provider.send("evm_revert", [
          beforePriceSetUnderBenchmarkSnapshotId,
        ]);
      });

      it("should set eventHasOccurred to false", async () => {
        const eventHasOccurred =
          await secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(false);
      });
    });
  });

  describe("testHash", () => {
    it("should return keccak256 hash", async () => {
      const contractHashResult = await secretPredictionMarket.testHash(
        1,
        testBlindingFactor
      );

      const ethersHashResult = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [user1AddressBytes32, choiceBytes32, testBlindingFactor]
      );

      expect(contractHashResult).to.eq(ethersHashResult);
    });
  });

  describe("revealChoice", () => {
    let commitment;
    let commitChoiceTransaction;
    let revealChoiceTransaction;

    before(async () => {
      commitment = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [user1AddressBytes32, yesChoiceBytes32, testBlindingFactor]
      );
    });

    beforeEach(async () => {
      snapshotId = await ethers.provider.send("evm_snapshot", []);

      commitChoiceTransaction = await secretPredictionMarket.commitChoice(
        commitment,
        { value: fixedWager }
      );
      await commitChoiceTransaction.wait();
    });

    afterEach(async () => {
      await ethers.provider.send("evm_revert", [snapshotId]);
    });

    it("should revert if reveal deadline has passed", async () => {
      await network.provider.send("evm_increaseTime", [1000000]);
      await network.provider.send("evm_mine");

      await expect(
        secretPredictionMarket.revealChoice(choice, testBlindingFactor)
      ).to.be.revertedWith("Reveal deadline has passed");
    });

    it("should revert if choice is not 'Yes' or 'No'", async () => {
      await expect(
        secretPredictionMarket.revealChoice(0, testBlindingFactor)
      ).to.be.revertedWith("Choice must be either 'Yes' or 'No");
    });

    it("should revert if hash does not match commitment", async () => {
      const wrongBlindingFactor = ethers.utils.formatBytes32String("0x34");

      await expect(
        secretPredictionMarket.revealChoice(choice, wrongBlindingFactor)
      ).to.be.revertedWith("Hash does not match commitment");
    });

    it("should revert if prediction has already been revealed", async () => {
      revealChoiceTransaction = await secretPredictionMarket.revealChoice(
        1,
        testBlindingFactor
      );
      await revealChoiceTransaction.wait();

      await expect(
        secretPredictionMarket.revealChoice(1, testBlindingFactor)
      ).to.be.revertedWith("Commit has already been revealed");
    });

    it("should update PredictionCommit in players mapping with revealed choice", async () => {
      revealChoiceTransaction = await secretPredictionMarket.revealChoice(
        choice,
        testBlindingFactor
      );
      await revealChoiceTransaction.wait();

      const playerCommitStruct = await secretPredictionMarket.predictions(
        user1.address
      );

      expect(playerCommitStruct["choice"]).to.eq(choice);
    });

    it("should emit Reveal event", async () => {
      revealChoiceTransaction = await secretPredictionMarket.revealChoice(
        choice,
        testBlindingFactor
      );
      await revealChoiceTransaction.wait();

      expect(revealChoiceTransaction)
        .to.emit(secretPredictionMarket, "Reveal")
        .withArgs(user1.address, choice);
    });
  });

  describe("claimWinnings", () => {
    let choice;
    let yesCommitment;
    let noCommitment;

    let yesCommitChoiceTransaction;
    let noCommitChoiceTransaction;

    let winnings;
    let numWinningReveals;
    let losingPot;

    let reportEventOccured;

    let yesReveal;
    let noReveal;

    let claimTransaction;

    before(async () => {
      yesCommitment = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [user1AddressBytes32, yesChoiceBytes32, testBlindingFactor]
      );

      noCommitment = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [user2AddressBytes32, noChoiceBytes32, testBlindingFactor]
      );

      yesCommitChoiceTransaction = await secretPredictionMarket.commitChoice(
        yesCommitment,
        {
          value: fixedWager,
        }
      );
      await yesCommitChoiceTransaction.wait();

      noCommitChoiceTransaction = await secretPredictionMarket
        .connect(user2)
        .commitChoice(noCommitment, { value: fixedWager });
      await noCommitChoiceTransaction.wait();
    });

    describe("when event occurs", () => {
      let beforePriceSetAboveBenchmarkSnapshotId;

      before(async () => {
        beforePriceSetAboveBenchmarkSnapshotId = await ethers.provider.send(
          "evm_snapshot",
          []
        );

        price = 6000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        reportEventOccured = await secretPredictionMarket.reportEvent();
        await reportEventOccured.wait();

        yesReveal = await secretPredictionMarket.revealChoice(
          1,
          testBlindingFactor
        );
        await yesReveal.wait();

        noReveal = await secretPredictionMarket
          .connect(user2)
          .revealChoice(2, testBlindingFactor);
        await noReveal.wait();

        numWinningReveals = await secretPredictionMarket.numOfWinningReveals();

        proportionOfWinningPot =
          ethers.BigNumber.from("1").div(numWinningReveals);

        losingPot = ethers.BigNumber.from(
          await secretPredictionMarket.losingPot()
        );

        winnings = fixedWager.add(proportionOfWinningPot.mul(losingPot));

        // increase time to be between revealDeadline and payoutDeadline
        await network.provider.send("evm_increaseTime", [17500]);
        await network.provider.send("evm_mine");
      });

      after(async () => {
        await ethers.provider.send("evm_revert", [
          beforePriceSetAboveBenchmarkSnapshotId,
        ]);
      });

      it("should set eventHasOccurred to true", async () => {
        const eventHasOccurred =
          await secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(true);
      });

      describe("when player with 'Yes' reveal attempts to claim", () => {
        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          claimTransaction = await secretPredictionMarket.claimWinnings();
          await claimTransaction.wait();

          const user1BalanceAfterWinnings = await ethers.provider.getBalance(
            user1.address
          );

          const differenceInAddressBalances =
            user1BalanceAfterWinnings.sub(user1StartingBalance);
          const expectedGains = winnings.sub(fixedWager);

          expect(differenceInAddressBalances).to.eq(expectedGains);
        });

        it("should emit Payout event", async () => {
          expect(claimTransaction)
            .to.emit(secretPredictionMarket, "Payout")
            .withArgs(user1.address, winnings);
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        it("should revert", async () => {
          await expect(
            secretPredictionMarket.connect(user2).claimWinnings()
          ).to.be.revertedWith("Invalid claim");
        });
      });
    });

    describe("when event does not occur", () => {
      let beforePriceSetUnderBenchmarkSnapshotId;

      before(async () => {
        beforePriceSetUnderBenchmarkSnapshotId = await ethers.provider.send(
          "evm_snapshot",
          []
        );

        price = 4000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        reportEventOccured = await secretPredictionMarket.reportEvent();
        await reportEventOccured.wait();

        yesReveal = await secretPredictionMarket.revealChoice(
          1,
          testBlindingFactor
        );
        await yesReveal.wait();

        noReveal = await secretPredictionMarket
          .connect(user2)
          .revealChoice(2, testBlindingFactor);
        await noReveal.wait();

        numWinningReveals = await secretPredictionMarket.numOfWinningReveals();

        const proportionOfWinningPot =
          ethers.BigNumber.from("1").div(numWinningReveals);

        losingPot = ethers.BigNumber.from(
          await secretPredictionMarket.losingPot()
        );

        winnings = fixedWager.add(proportionOfWinningPot.mul(losingPot));

        await network.provider.send("evm_increaseTime", [17500]);
        await network.provider.send("evm_mine");
      });

      after(async () => {
        await ethers.provider.send("evm_revert", [
          beforePriceSetUnderBenchmarkSnapshotId,
        ]);
      });

      it("should set eventHasOccurred to false", async () => {
        const eventHasOccurred =
          await secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(false);
      });

      describe("when player with 'Yes' reveal attempts to claim", () => {
        it("should revert", async () => {
          await expect(
            secretPredictionMarket.claimWinnings()
          ).to.be.revertedWith("Invalid claim");
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          claimTransaction = await secretPredictionMarket
            .connect(user2)
            .claimWinnings();
          await claimTransaction.wait();

          const user2BalanceAfterWinnings = await ethers.provider.getBalance(
            user2.address
          );

          const differenceInAddressBalances =
            user2BalanceAfterWinnings.sub(user2StartingBalance);
          const expectedGains = winnings.sub(fixedWager);

          expect(differenceInAddressBalances).to.eq(expectedGains);
        });

        it("should emit WinningsClaimed event", async () => {
          expect(claimTransaction)
            .to.emit(secretPredictionMarket, "WinningsClaimed")
            .withArgs(choice, winnings);
        });
      });
    });
  });
});
