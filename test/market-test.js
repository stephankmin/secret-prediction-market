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
    });

    describe("when event occurs and 'Yes' reveal attempts to claim", () => {
      let winnings;
      let choice;

      before(async () => {
        wager = ethers.utils.parseEther("1.0");
        choice = 1;

        commitInput = await ethers.utils.keccak256(
          abiCoder.encode([deployer.address, 1, "test"])
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

      it("should emit WinningsClaimed event", async () => {
        expect(claimTransaction)
          .to.emit(secretpredictionmarket, "WinningsClaimed")
          .withArgs(choice, winnings);
      });
    });

    it("should revert if player's choice was incorrect", async () => {
      await expect(secretpredictionmarket.claimWinnings()).to.be.revertedWith(
        "Invalid claim"
      );
    });
  });
});
