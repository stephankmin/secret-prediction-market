const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SecretPredictionMarket", () => {
  let SecretPredictionMarket;
  let secretpredictionmarket;
  let accounts;
  let deployer;

  before(async () => {
    accounts = await ethers.getSigners();
    deployer = accounts[0];
  });

  describe("commitChoice", () => {
    let wager;
    let commitInput;
    let playerCommitTransaction;

    before(async () => {
      SecretPredictionMarket = ethers.getContractFactory(
        "SecretPredictionMarket"
      );
      secretpredictionmarket = await SecretPredictionMarket.deploy();
      await secretpredictionmarket.deployed();

      wager = ethers.utils.parseEther("1.0");

      commitInput = await ethers.utils.keccak256(
        abiCoder.encode([deployer.address, 1, "test"])
      );

      playerCommitTransaction = await SecretPredictionMarket.commitChoice(
        commitInput,
        { value: wager }
      );
      await playerCommitTransaction.wait();
    });

    it("should revert if commit deadline has passed", async () => {});

    it("should store PredictionCommit for player in players mapping", async () => {
      const playerCommitStruct = await secretpredictionmarket.players(
        deployer.address
      );

      expect(playerCommitStruct["commitment"]).to.eq(commitInput);

      expect(playerCommitStruct["wager"]).to.eq(wager);

      expect(playerCommitStruct["choice"]).to.eq(0);
    });

    it("should emit Commit event", async () => {
      expect(playerCommitTransaction)
        .to.emit(secretpredictionmarket, "Commit")
        .withArgs(deployer.address, wager);
    });
  });

  describe("reportEvent", () => {
    let MockPriceOracle;
    let mockOracle;

    let price;
    let benchmarkPrice;
    let wager;
    let recentBlock;
    let commitDeadline;
    let revealDeadline;
    let eventDeadline;
    let payoutDeadline;
    let priceOracleAddress;

    before(async () => {
      wager = ethers.parseEther("1.0");
      recentBlock = 13981319;
      commitDeadline = recentBlock + 10000;
      revealDeadline = recentBlock + 20000;
      eventDeadline = recentBlock + 30000;
      payoutDeadline = recentBlock + 40000;

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
      secretpredictionmarket = await SecretPredictionMarket.deploy();
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
    let commitInput;
    let playerCommitTransaction;

    let reportEventOccured;

    let yesReveal;
    let noReveal;

    let claimTransaction;

    before(async () => {
      SecretPredictionMarket = ethers.getContractFactory(
        "SecretPredictionMarket"
      );
      secretpredictionmarket = await SecretPredictionMarket.deploy();
      await secretpredictionmarket.deployed();

      wager = ethers.utils.parseEther("1.0");
    });

    describe("when event occurs", () => {
      describe("when player with 'Yes' reveal attempts to claim", () => {
        let winnings;

        before(async () => {
          choice = 1;

          commitInput = await ethers.utils.keccak256(
            abiCoder.encode([deployer.address, choice, "test"])
          );

          playerCommitTransaction = await SecretPredictionMarket.commitChoice(
            commitInput,
            { value: wager }
          );
          await playerCommitTransaction.wait();

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

          commitInput = await ethers.utils.keccak256(
            abiCoder.encode([deployer.address, choice, "test"])
          );

          playerCommitTransaction = await SecretPredictionMarket.commitChoice(
            commitInput,
            { value: wager }
          );
          await playerCommitTransaction.wait();

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

          commitInput = await ethers.utils.keccak256(
            abiCoder.encode([deployer.address, choice, "test"])
          );

          playerCommitTransaction = await SecretPredictionMarket.commitChoice(
            commitInput,
            { value: wager }
          );
          await playerCommitTransaction.wait();

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

          commitInput = await ethers.utils.keccak256(
            abiCoder.encode([deployer.address, choice, "test"])
          );

          playerCommitTransaction = await SecretPredictionMarket.commitChoice(
            commitInput,
            { value: wager }
          );
          await playerCommitTransaction.wait();

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
