const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SecretPredictionMarket", () => {
  // contract factories and instances
  let SecretPredictionMarket;
  let secretPredictionMarket;
  let MockPriceOracle;
  let mockOracle;

  let accounts;
  let deployer;
  let testBlindingFactor;

  // timestamp to help set deadlines
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
    deployer = accounts[0];
    testBlindingFactor = ethers.utils.formatBytes32String("0x12");

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
      "1000"
    );
    revealDeadline = ethers.BigNumber.from(mostRecentBlockTimestamp).add(
      "2000"
    );
    eventDeadline = ethers.BigNumber.from(mostRecentBlockTimestamp).add("3000");
    payoutDeadline = ethers.BigNumber.from(mostRecentBlockTimestamp).add(
      "4000"
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
    let snapshotId;
    let commitment;
    let commitChoiceTransaction;

    before(async () => {
      commitment = await ethers.utils.solidityKeccak256(
        ["address", "uint256", "bytes32"],
        [deployer.address, 1, testBlindingFactor]
      );
    });

    beforeEach(async () => {
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await ethers.provider.send("evm_revert", [snapshotId]);
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
        deployer.address
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

      await expect(commitChoiceTransaction)
        .to.emit(secretPredictionMarket, "Commit")
        .withArgs(deployer.address, fixedWager);
    });
  });

  describe("reportEvent", () => {
    let price;

    beforeEach(async () => {
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await ethers.provider.send("evm_revert", [snapshotId]);
    });

    describe("when price is under benchmarkPrice", () => {
      let checkEventTransaction;

      before(async () => {
        snapshotId = await ethers.provider.send("evm_snapshot", []);

        price = 4000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();
      });

      afterEach(async () => {
        await ethers.provider.send("evm_revert", [snapshotId]);
      });

      it("should set eventHasOccurred to false", async () => {
        checkEventTransaction = await secretPredictionMarket.reportEvent();
        await checkEventTransaction.wait();

        const eventHasOccurred =
          await secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(false);
      });
    });

    describe("when price is above benchmarkPrice", () => {
      let checkEventTransaction;

      before(async () => {
        snapshotId = await ethers.provider.send("evm_snapshot", []);

        price = 6000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        checkEventTransaction = await secretPredictionMarket.reportEvent();
        await checkEventTransaction.wait();
      });

      afterEach(async () => {
        await ethers.provider.send("evm_revert", [snapshotId]);
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
  });

  describe("testHash", () => {
    it("should return keccak256 hash", async () => {
      const choiceHexlify = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(1),
        32
      );
      const addressHexlify = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(deployer.address),
        32
      );

      const contractHashResult = await secretPredictionMarket.testHash(
        1,
        testBlindingFactor
      );
      console.log(contractHashResult);

      const ethersHashResult = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [addressHexlify, choiceHexlify, testBlindingFactor]
      );
      console.log(ethersHashResult);

      expect(contractHashResult).to.eq(ethersHashResult);
    });
  });

  describe("revealChoice", () => {
    let choice;
    let addressHexlify;
    let choiceHexlify;
    let commitment;
    let commitChoiceTransaction;
    let revealChoiceTransaction;

    before(async () => {
      choice = 1;
      addressHexlify = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(deployer.address),
        32
      );
      choiceHexlify = ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32);

      commitment = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [addressHexlify, choiceHexlify, testBlindingFactor]
      );
      console.log("Test Commitment:", commitment);
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
        deployer.address
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
        .withArgs(deployer.address, choice);
    });
  });

  describe("claimWinnings", () => {
    let choice;
    let yesCommitment;
    let noCommitment;
    let deployerAddressHexlify;
    let user1AddressHexlify;
    let yesChoiceHexlify;
    let noChoiceHexlify;

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
      user1 = accounts[1];

      deployerAddressHexlify = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(deployer.address),
        32
      );
      user1AddressHexlify = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(user1.address),
        32
      );
      yesChoiceHexlify = ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32);
      noChoiceHexlify = ethers.utils.hexZeroPad(ethers.utils.hexlify(2), 32);

      yesCommitment = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [deployerAddressHexlify, yesChoiceHexlify, testBlindingFactor]
      );

      noCommitment = await ethers.utils.solidityKeccak256(
        ["bytes32", "bytes32", "bytes32"],
        [user1AddressHexlify, noChoiceHexlify, testBlindingFactor]
      );

      yesCommitChoiceTransaction = await secretPredictionMarket.commitChoice(
        yesCommitment,
        {
          value: fixedWager,
        }
      );
      await yesCommitChoiceTransaction.wait();

      noCommitChoiceTransaction = await secretPredictionMarket
        .connect(user1)
        .commitChoice(noCommitment, { value: fixedWager });
      await noCommitChoiceTransaction.wait();
    });

    beforeEach(async () => {
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await ethers.provider.send("evm_revert", [snapshotId]);
    });

    describe("when event occurs", () => {
      before(async () => {
        snapshotId = await ethers.provider.send("evm_snapshot", []);

        price = 6000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        reportEventOccured = await secretPredictionMarket.reportEvent();
        await reportEventOccured.wait();
      });

      after(async () => {
        await ethers.provider.send("evm_revert", [snapshotId]);
      });

      it("should set eventHasOccurred to true", async () => {
        const eventHasOccurred =
          await secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(true);
      });

      describe("when player with 'Yes' reveal attempts to claim", () => {
        beforeEach(async () => {
          snapshotId = await ethers.provider.send("evm_snapshot", []);

          yesReveal = await secretPredictionMarket.revealChoice(
            1,
            testBlindingFactor
          );
          await yesReveal.wait();
        });

        afterEach(async () => {
          await ethers.provider.send("evm_revert", [snapshotId]);
        });

        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          numWinningReveals = secretPredictionMarket.numOfWinningReveals();
          proportionOfWinningPot = 1 / numWinningReveals;
          losingPot = ethers.BigNumber.from(secretPredictionMarket.losingPot());
          winnings = fixedWager.add(proportionOfWinningPot.mul(losingPot));

          claimTransaction = await secretPredictionMarket.claimWinnings();
          await claimTransaction.wait();

          const playerAddressBalance = ethers.provider.getBalance(
            deployer.address
          );

          expect(playerAddressBalance).to.eq(winnings);
        });

        it("should emit Payout event", async () => {
          expect(claimTransaction)
            .to.emit(secretPredictionMarket, "Payout")
            .withArgs(deployer.address, winnings);
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        beforeEach(async () => {
          snapshotId = await ethers.provider.send("evm_snapshot", []);

          noReveal = await secretPredictionMarket
            .connect(user1)
            .revealChoice(2, testBlindingFactor);
          await noReveal.wait();
        });

        afterEach(async () => {
          await ethers.provider.send("evm_revert", [snapshotId]);
        });

        it("should revert", async () => {
          await expect(
            secretPredictionMarket.connect(user1).claimWinnings()
          ).to.be.revertedWith("Invalid claim");
        });
      });
    });

    describe("when event does not occur", () => {
      before(async () => {
        price = 4000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        reportEventOccured = await secretPredictionMarket.reportEvent();
        await reportEventOccured.wait();
      });

      it("should set eventHasOccurred to false", async () => {
        const eventHasOccurred =
          await secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(false);
      });

      describe("when player with 'Yes' reveal attempts to claim", () => {
        beforeEach(async () => {
          snapshotId = await ethers.provider.send("evm_snapshot", []);

          commitment = await ethers.utils.solidityKeccak256(
            ["bytes32", "bytes32", "bytes32"],
            [deployerAddressHexlify, yesChoiceHexlify, testBlindingFactor]
          );

          commitChoiceTransaction = await secretPredictionMarket.commitChoice(
            commitment,
            { value: fixedWager }
          );
          await commitChoiceTransaction.wait();

          yesReveal = await secretPredictionMarket.revealChoice(
            1,
            testBlindingFactor
          );
          await yesReveal.wait();
        });

        afterEach(async () => {
          await ethers.provider.send("evm_revert", [snapshotId]);
        });

        it("should revert", async () => {
          await expect(
            secretPredictionMarket.claimWinnings()
          ).to.be.revertedWith("Invalid claim");
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        before(async () => {
          snapshotId = await ethers.provider.send("evm_snapshot", []);

          commitment = await ethers.utils.solidityKeccak256(
            ["bytes32", "bytes32", "bytes32"],
            [user1AddressHexlify, noChoiceHexlify, testBlindingFactor]
          );

          commitChoiceTransaction = await secretPredictionMarket.commitChoice(
            commitment,
            { value: fixedWager }
          );
          await commitChoiceTransaction.wait();

          noReveal = await secretPredictionMarket.revealChoice(
            2,
            testBlindingFactor
          );
          await noReveal.wait();
        });

        afterEach(async () => {
          await ethers.provider.send("evm_revert", [snapshotId]);
        });

        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          claimTransaction = await secretPredictionMarket.claimWinnings();
          await claimTransaction.wait();

          const playerAddressBalance = await ethers.provider.getBalance(
            deployer.address
          );

          expect(playerAddressBalance).to.eq(winnings);
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
