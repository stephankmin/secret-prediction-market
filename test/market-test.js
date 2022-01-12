const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SecretPredictionMarket", () => {
  let SecretPredictionMarket;
  let secretpredictionmarket;
  let accounts;
  let deployer;
  let mostRecentBlock;

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
    mostRecentBlock = await provider.getBlockNumber();
    commitDeadline = mostRecentBlock + 10000;
    revealDeadline = mostRecentBlock + 20000;
    eventDeadline = mostRecentBlock + 30000;
    payoutDeadline = mostRecentBlock + 40000;

    // deploy mock oracle and assign priceOracleAddress
    MockPriceOracle = ethers.getContractFactory("MockPriceOracle");
    mockOracle = await MockPriceOracle.deployed();
    await mockOracle.wait();

    priceOracleAddress = mockOracle.address;
  });

  describe("commitChoice", () => {
    let commitment;
    let commitChoiceTransaction;

    beforeEach(async () => {
      SecretPredictionMarket = ethers.getContractFactory(
        "SecretPredictionMarket"
      );
      secretpredictionmarket = await SecretPredictionMarket.deploy(
        benchmarkPrice,
        fixedWager,
        commitDeadline,
        revealDeadline,
        eventDeadline,
        payoutDeadline,
        priceOracleAddress
      );
      await secretpredictionmarket.deployed();

      commitment = await ethers.utils.keccak256(
        abiCoder.encode([deployer.address, 1, "test"])
      );
    });

    it("should revert if commit deadline has passed", async () => {
      await network.provider.send("evm_increaseTime", [100000]);
      await network.provider.send("evm_mine");

      await expect(
        secretpredictionmarket.commitChoice(commitment, { value: wager })
      ).to.be.revertedWith("Commit deadline has passed");
    });

    it("should revert if user has already committed choice", async () => {
      commitChoiceTransaction = await secretpredictionmarket.commitChoice(
        commitment,
        { value: fixedWager }
      );
      await commitChoiceTransaction.wait();

      await expect(
        secretpredictionmarket.commitChoice(commitment, { value: fixedWager })
      ).to.be.revertedWith("Player has already committed their choice");
    });

    it("should revert if user wager != fixedWager", async () => {
      const incorrectWager = ethers.utils.parseEther("2.0");

      await expect(
        secretpredictionmarket.commitChoice(commitment, {
          value: incorrectWager,
        })
      ).to.be.revertedWith("Player's wager does not match fixed wager");
    });

    it("should store PredictionCommit for player in players mapping", async () => {
      const playerCommitStruct = await secretpredictionmarket.players(
        deployer.address
      );

      expect(playerCommitStruct["commitment"]).to.eq(commitment);

      expect(playerCommitStruct["wager"]).to.eq(fixedWager);

      expect(playerCommitStruct["choice"]).to.eq(0);
    });

    it("should emit Commit event", async () => {
      expect(commitChoiceTransaction)
        .to.emit(secretpredictionmarket, "Commit")
        .withArgs(deployer.address, wager);
    });
  });

  describe("reportEvent", () => {
    let MockPriceOracle;
    let mockOracle;
    let price;
    let priceOracleAddress;

    before(async () => {
      MockPriceOracle = ethers.getContractFactory("MockPriceOracle");
      mockOracle = await MockPriceOracle.deployed();
      await mockOracle.wait();

      priceOracleAddress = mockOracle.address;
    });

    describe("when price is under benchmarkPrice", () => {
      let checkEventTransaction;

      beforeEach(async () => {
        price = 4000;
        benchmarkPrice = 5000;

        SecretPredictionMarket = ethers.getContractFactory(
          "SecretPredictionMarket"
        );
        secretpredictionmarket = await SecretPredictionMarket.deploy(
          benchmarkPrice,
          wager,
          commitDeadline,
          revealDeadline,
          eventDeadline,
          payoutDeadline,
          priceOracleAddress
        );
        await secretpredictionmarket.deployed();

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();
      });

      it("should set eventHasOccurred to false", async () => {
        checkEventTransaction = await secretpredictionmarket.reportEvent();
        await checkEventTransaction.wait();

        const eventHasOccurred = secretpredictionmarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(false);
      });
    });

    describe("when price is above benchmarkPrice", () => {
      let checkEventTransaction;

      beforeEach(async () => {
        price = 6000;
        benchmarkPrice = 5000;

        SecretPredictionMarket = ethers.getContractFactory(
          "SecretPredictionMarket"
        );
        secretpredictionmarket = await SecretPredictionMarket.deploy(
          benchmarkPrice,
          wager,
          commitDeadline,
          revealDeadline,
          eventDeadline,
          payoutDeadline,
          priceOracleAddress
        );
        await secretpredictionmarket.deployed();

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();
      });

      it("should set eventHasOccurred to true", async () => {
        checkEventTransaction = await secretpredictionmarket.reportEvent();
        await checkEventTransaction.wait();

        const eventHasOccurred = secretpredictionmarket.eventHasOccurred();

        expect(eventHasOccurred).to.eq(true);
      });

      it("should emit EventHasOccurred event", async () => {
        checkEventTransaction = await secretpredictionmarket.reportEvent();
        await checkEventTransaction.wait();

        const checkEventTransactionBlock = await provider
          .expect(checkEventTransaction)
          .to.emit("EventHasOccurred")
          .withArgs();
      });
    });
  });

  describe("revealChoice", () => {
    let choice;
    let blindingFactor;
    let revealTransaction;

    before(async () => {
      SecretPredictionMarket = ethers.getContractFactory(
        "SecretPredictionMarket"
      );
      secretpredictionmarket = await SecretPredictionMarket.deploy(
        benchmarkPrice,
        wager,
        commitDeadline,
        revealDeadline,
        eventDeadline,
        payoutDeadline,
        priceOracleAddress
      );
      await secretpredictionmarket.deployed();

      choice = 1;
      blindingFactor = "test";
    });

    it("should revert if reveal deadline has passed", async () => {
      await network.provider.send("evm_increaseTime", [1000000]);
      await network.provider.send("evm_mine");

      await expect(
        secretpredictionmarket.revealTransaction(choice, blindingFactor)
      ).to.be.revertedWith("Reveal deadline has passed");
    });

    it("should revert if choice is not 'Yes' or 'No'", async () => {
      await expect(
        secretpredictionmarket.revealTransaction(3, blindingFactor)
      ).to.be.revertedWith("Choice is not 'Yes' or 'No'");
    });

    it("should revert if hash does not match commitment", async () => {
      await expect(
        secretpredictionmarket.revealTransaction(choice, "wrong")
      ).to.be.revertedWith("Hash does not match commitment");
    });

    it("should revert if prediction has already been revealed", async () => {
      revealTransaction = await secretpredictionmarket.revealTransaction(
        choice,
        blindingFactor
      );
      await revealTransaction.wait();

      await expect(
        secretpredictionmarket.revealTransaction(choice, blindingFactor)
      ).to.be.revertedWith("Prediction has already been revealed");
    });

    it("should update PredictionCommit in players mapping with revealed choice", async () => {
      revealTransaction = await secretpredictionmarket.revealTransaction(
        choice,
        blindingFactor
      );
      await revealTransaction.wait();

      const playerCommitStruct = await secretpredictionmarket.players(
        deployer.address
      );

      expect(playerCommitStruct["choice"]).to.eq(choice);
    });

    it("should emit Reveal event", async () => {
      revealTransaction = await secretpredictionmarket.revealTransaction(
        choice,
        blindingFactor
      );
      await revealTransaction.wait();

      expect(revealTransaction)
        .to.emit(secretpredictionmarket, "Reveal")
        .withArgs(deployer.address, choice);
    });
  });

  describe("claimWinnings", () => {
    let wager;
    let choice;
    let commitment;
    let commitChoiceTransaction;

    let reportEventOccured;

    let yesReveal;
    let noReveal;

    let claimTransaction;

    before(async () => {
      SecretPredictionMarket = ethers.getContractFactory(
        "SecretPredictionMarket"
      );
      secretpredictionmarket = await SecretPredictionMarket.deploy(
        benchmarkPrice,
        wager,
        commitDeadline,
        revealDeadline,
        eventDeadline,
        payoutDeadline,
        priceOracleAddress
      );
      await secretpredictionmarket.deployed();

      wager = ethers.utils.parseEther("1.0");
    });

    describe("when event occurs", () => {
      describe("when player with 'Yes' reveal attempts to claim", () => {
        let winnings;

        before(async () => {
          choice = 1;

          commitment = await ethers.utils.keccak256(
            abiCoder.encode([deployer.address, choice, "test"])
          );

          commitChoiceTransaction = await SecretPredictionMarket.commitChoice(
            commitment,
            { value: wager }
          );
          await commitChoiceTransaction.wait();

          reportEventOccured = await secretpredictionmarket.reportEvent();
          await reportEventOccured.wait();

          yesReveal = await secretpredictionmarket.revealChoice();
          await yesReveal.wait();
        });

        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          claimTransaction = await secretpredictionmarket.claimWinnings();
          await claimTransaction.wait();

          const playerAddressBalance = await provider.getBalance(
            deployer.address
          );

          winnings =
            wager +
            (1 / secretpredictionmarket.numOfWinningReveals()) *
              secretpredictionmarket.losingPot();

          expect(playerAddressBalance).to.eq(winnings);
        });

        it("should emit Payout event", async () => {
          expect(claimTransaction)
            .to.emit(secretpredictionmarket, "Payout")
            .withArgs(deployer.address, winnings);
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        before(async () => {
          choice = 2;

          commitment = await ethers.utils.keccak256(
            abiCoder.encode([deployer.address, choice, "test"])
          );

          commitChoiceTransaction = await SecretPredictionMarket.commitChoice(
            commitment,
            { value: wager }
          );
          await commitChoiceTransaction.wait();

          reportEventOccured = await secretpredictionmarket.reportEvent();
          await reportEventOccured.wait();

          noReveal = await secretpredictionmarket.revealChoice();
          await noReveal.wait();
        });

        it("should revert", async () => {
          await expect(
            secretpredictionmarket.claimWinnings()
          ).to.be.revertedWith("Invalid claim");
        });
      });
    });

    describe("when event does not occur", () => {
      describe("when player with 'Yes' reveal attempts to claim", () => {
        before(async () => {
          choice = 1;

          commitment = await ethers.utils.keccak256(
            abiCoder.encode([deployer.address, choice, "test"])
          );

          commitChoiceTransaction = await SecretPredictionMarket.commitChoice(
            commitment,
            { value: wager }
          );
          await commitChoiceTransaction.wait();

          yesReveal = await secretpredictionmarket.revealChoice();
          await yesReveal.wait();
        });

        it("should revert", async () => {
          await expect(
            secretpredictionmarket.claimWinnings()
          ).to.be.revertedWith("Invalid claim");
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        before(async () => {
          choice = 2;

          commitment = await ethers.utils.keccak256(
            abiCoder.encode([deployer.address, choice, "test"])
          );

          commitChoiceTransaction = await SecretPredictionMarket.commitChoice(
            commitment,
            { value: wager }
          );
          await commitChoiceTransaction.wait();

          noReveal = await secretpredictionmarket.revealChoice();
          await noReveal.wait();
        });

        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          claimTransaction = await secretpredictionmarket.claimWinnings();
          await claimTransaction.wait();

          const playerAddressBalance = await provider.getBalance(
            deployer.address
          );

          winnings =
            wager +
            (1 / secretpredictionmarket.numOfWinningReveals()) *
              secretpredictionmarket.losingPot();

          expect(playerAddressBalance).to.eq(winnings);
        });

        it("should emit WinningsClaimed event", async () => {
          expect(claimTransaction)
            .to.emit(secretpredictionmarket, "WinningsClaimed")
            .withArgs(choice, winnings);
        });
      });
    });
  });
});
