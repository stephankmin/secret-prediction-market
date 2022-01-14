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
  let mostRecentBlock;
  let testBlindingFactor;

  // abiCoder instance to help encode inputs
  let abiCoderInstance;

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

    // arbitrary params for testing purposes
    benchmarkPrice = 5000;
    fixedWager = ethers.utils.parseEther("1.0");
    mostRecentBlock = await ethers.provider.getBlockNumber();
    commitDeadline = mostRecentBlock + 1000;
    revealDeadline = mostRecentBlock + 2000;
    eventDeadline = mostRecentBlock + 3000;
    payoutDeadline = mostRecentBlock + 4000;

    // deploy mock price oracle and assign mock oracle address
    MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    mockOracle = await MockPriceOracle.deploy();
    await mockOracle.deployed();
    priceOracleAddress = mockOracle.address;

    testBlindingFactor = ethers.utils.formatBytes32String("0x12");
  });

  describe("commitChoice", () => {
    let commitment;
    let commitChoiceTransaction;

    beforeEach(async () => {
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

      commitment = await ethers.utils.solidityKeccak256(
        ["address", "uint256", "bytes32"],
        [deployer.address, 1, testBlindingFactor]
      );
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

    describe("when price is under benchmarkPrice", () => {
      let checkEventTransaction;

      beforeEach(async () => {
        price = 4000;
        benchmarkPrice = 5000;

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

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();
      });

      it("should set eventHasOccurred to false", async () => {
        checkEventTransaction = await secretPredictionMarket.reportEvent();
        await checkEventTransaction.wait();

        const eventHasOccurred = secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(false);
      });
    });

    describe("when price is above benchmarkPrice", () => {
      let checkEventTransaction;

      beforeEach(async () => {
        price = 6000;
        benchmarkPrice = 5000;

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

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();
      });

      it("should set eventHasOccurred to true", async () => {
        checkEventTransaction = await secretPredictionMarket.reportEvent();
        await checkEventTransaction.wait();

        const eventHasOccurred = secretPredictionMarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(true);
      });

      it("should emit EventHasOccurred event", async () => {
        checkEventTransaction = await secretPredictionMarket.reportEvent();
        await checkEventTransaction.wait();

        const checkEventTransactionBlock =
          await ethers.provider.getBlockNumber();

        expect(checkEventTransaction)
          .to.emit("EventHasOccurred")
          .withArgs(checkEventTransactionBlock);
      });
    });
  });

  describe("revealChoice", () => {
    let choice;
    let revealTransaction;

    before(async () => {
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

      choice = 1;
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
        secretPredictionMarket.revealChoice(3, testBlindingFactor)
      ).to.be.revertedWith("Choice is not 'Yes' or 'No'");
    });

    it("should revert if hash does not match commitment", async () => {
      const wrongBlindingFactor = ethers.utils.formatBytes32String("0x34");

      await expect(
        secretPredictionMarket.revealChoice(choice, wrongBlindingFactor)
      ).to.be.revertedWith("Hash does not match commitment");
    });

    it("should revert if prediction has already been revealed", async () => {
      revealTransaction = await secretPredictionMarket.revealChoice(
        choice,
        testBlindingFactor
      );
      await revealTransaction.wait();

      await expect(
        secretPredictionMarket.revealChoice(choice, testBlindingFactor)
      ).to.be.revertedWith("Prediction has already been revealed");
    });

    it("should update PredictionCommit in players mapping with revealed choice", async () => {
      revealTransaction = await secretPredictionMarket.revealChoice(
        choice,
        testBlindingFactor
      );
      await revealTransaction.wait();

      const playerCommitStruct = await secretPredictionMarket.players(
        deployer.address
      );

      expect(playerCommitStruct["choice"]).to.eq(choice);
    });

    it("should emit Reveal event", async () => {
      revealTransaction = await secretPredictionMarket.revealChoice(
        choice,
        testBlindingFactor
      );
      await revealTransaction.wait();

      expect(revealTransaction)
        .to.emit(secretPredictionMarket, "Reveal")
        .withArgs(deployer.address, choice);
    });
  });

  describe("claimWinnings", () => {
    let choice;
    let commitment;
    let commitChoiceTransaction;

    let reportEventOccured;

    let yesReveal;
    let noReveal;

    let claimTransaction;

    before(async () => {
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

    describe("when event occurs", () => {
      describe("when player with 'Yes' reveal attempts to claim", () => {
        let winnings;

        before(async () => {
          choice = 1;

          commitment = await ethers.utils.solidityKeccak256(
            ["address", "uint256", "bytes32"],
            [deployer.address, choice, testBlindingFactor]
          );

          commitChoiceTransaction = await secretPredictionMarket.commitChoice(
            commitment,
            { value: fixedWager }
          );
          await commitChoiceTransaction.wait();

          reportEventOccured = await secretPredictionMarket.reportEvent();
          await reportEventOccured.wait();

          yesReveal = await secretPredictionMarket.revealChoice();
          await yesReveal.wait();
        });

        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          claimTransaction = await secretPredictionMarket.claimWinnings();
          await claimTransaction.wait();

          const playerAddressBalance = await ethers.provider.getBalance(
            deployer.address
          );

          winnings =
            fixedWager +
            (1 / secretPredictionMarket.numOfWinningReveals()) *
              secretPredictionMarket.losingPot();

          expect(playerAddressBalance).to.eq(winnings);
        });

        it("should emit Payout event", async () => {
          expect(claimTransaction)
            .to.emit(secretPredictionMarket, "Payout")
            .withArgs(deployer.address, winnings);
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        before(async () => {
          choice = 2;

          commitment = await ethers.utils.solidityKeccak256(
            ["address", "uint256", "bytes32"],
            [deployer.address, choice, testBlindingFactor]
          );

          commitChoiceTransaction = await secretPredictionMarket.commitChoice(
            commitment,
            { value: fixedWager }
          );
          await commitChoiceTransaction.wait();

          reportEventOccured = await secretPredictionMarket.reportEvent();
          await reportEventOccured.wait();

          noReveal = await secretPredictionMarket.revealChoice();
          await noReveal.wait();
        });

        it("should revert", async () => {
          await expect(
            secretPredictionMarket.claimWinnings()
          ).to.be.revertedWith("Invalid claim");
        });
      });
    });

    describe("when event does not occur", () => {
      describe("when player with 'Yes' reveal attempts to claim", () => {
        before(async () => {
          choice = 1;

          commitment = await ethers.utils.solidityKeccak256(
            ["address", "uint256", "bytes32"],
            [deployer.address, choice, testBlindingFactor]
          );

          commitChoiceTransaction = await secretPredictionMarket.commitChoice(
            commitment,
            { value: fixedWager }
          );
          await commitChoiceTransaction.wait();

          yesReveal = await secretPredictionMarket.revealChoice();
          await yesReveal.wait();
        });

        it("should revert", async () => {
          await expect(
            secretPredictionMarket.claimWinnings()
          ).to.be.revertedWith("Invalid claim");
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        before(async () => {
          choice = 2;

          commitment = await ethers.utils.solidityKeccak256(
            ["address", "uint256", "bytes32"],
            [deployer.address, choice, testBlindingFactor]
          );

          commitChoiceTransaction = await secretPredictionMarket.commitChoice(
            commitment,
            { value: fixedWager }
          );
          await commitChoiceTransaction.wait();

          noReveal = await secretPredictionMarket.revealChoice();
          await noReveal.wait();
        });

        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          claimTransaction = await secretPredictionMarket.claimWinnings();
          await claimTransaction.wait();

          const playerAddressBalance = await ethers.provider.getBalance(
            deployer.address
          );

          winnings =
            fixedWager +
            (1 / secretPredictionMarket.numOfWinningReveals()) *
              secretPredictionMarket.losingPot();

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
