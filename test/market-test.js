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

  // pay for gas on behalf of predictors
  let thirdParty;

  // commitment inputs
  let yesEnumInt;
  let noEnumInt;

  // timestamp of most recent block to help set deadlines
  let mostRecentBlockTimestamp;

  // constructor parameters (deadlines are timestamps)
  let benchmarkPrice; // will the price of the asset of interest exceed benchmarkPrice before eventDeadline?
  let fixedWager;
  let commitDeadline;
  let revealDeadline;
  let eventDeadline;
  let payoutDeadline;
  let priceOracleAddress; // address of price oracle contract corresponding to asset being wagered on

  before(async () => {
    accounts = await ethers.getSigners();

    user1 = accounts[0];
    user1StartingBalance = await ethers.provider.getBalance(user1.address);

    user2 = accounts[1];
    user2StartingBalance = await ethers.provider.getBalance(user2.address);

    thirdParty = accounts[19];

    // int values for Yes and No in Choice enum
    yesEnumInt = 1;
    noEnumInt = 2;

    // test blinding factors for user1 and user2
    user1TestBlindingFactor = ethers.utils.formatBytes32String("user1");
    user2TestBlindingFactor = ethers.utils.formatBytes32String("user2");

    // possible commitments for user1 and user2
    user1YesCommitment = await ethers.utils.solidityKeccak256(
      ["uint", "bytes32"],
      [yesEnumInt, user1TestBlindingFactor]
    );

    user1NoCommitment = await ethers.utils.solidityKeccak256(
      ["uint", "bytes32"],
      [noEnumInt, user1TestBlindingFactor]
    );

    user2YesCommitment = await ethers.utils.solidityKeccak256(
      ["uint", "bytes32"],
      [yesEnumInt, user2TestBlindingFactor]
    );

    user2NoCommitment = await ethers.utils.solidityKeccak256(
      ["uint", "bytes32"],
      [noEnumInt, user2TestBlindingFactor]
    );

    // deploy mock price oracle and assign mock oracle address
    MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    mockOracle = await MockPriceOracle.connect(thirdParty).deploy();
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
    secretPredictionMarket = await SecretPredictionMarket.connect(
      thirdParty
    ).deploy(
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
    let payload;
    let payloadHash;
    let signature;
    let commitChoiceTransaction;

    before(async () => {
      payload = ethers.utils.defaultAbiCoder.encode(
        ["bytes32"],
        [user1YesCommitment]
      );
      payloadHash = ethers.utils.keccak256(payload);

      signature = await user1.signMessage(ethers.utils.arrayify(payloadHash));
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
        secretPredictionMarket
          .connect(thirdParty)
          .commitChoice(user1YesCommitment, signature, user1.address, {
            value: fixedWager,
          })
      ).to.be.revertedWith("Commit deadline has passed");
    });

    it("should revert if user has already committed choice", async () => {
      commitChoiceTransaction = await secretPredictionMarket
        .connect(thirdParty)
        .commitChoice(user1YesCommitment, signature, user1.address, {
          value: fixedWager,
        });
      await commitChoiceTransaction.wait();

      await expect(
        secretPredictionMarket
          .connect(thirdParty)
          .commitChoice(user1YesCommitment, signature, user1.address, {
            value: fixedWager,
          })
      ).to.be.revertedWith("Player has already committed their choice");
    });

    it("should revert if user wager != fixedWager", async () => {
      const incorrectWager = ethers.utils.parseEther("2.0");

      await expect(
        secretPredictionMarket
          .connect(thirdParty)
          .commitChoice(user1YesCommitment, signature, user1.address, {
            value: incorrectWager,
          })
      ).to.be.revertedWith("Player's wager does not match fixed wager");
    });

    it("should store PredictionCommit for player in players mapping", async () => {
      commitChoiceTransaction = await secretPredictionMarket
        .connect(thirdParty)
        .commitChoice(user1YesCommitment, signature, user1.address, {
          value: fixedWager,
        });
      await commitChoiceTransaction.wait();

      const playerCommitStruct = await secretPredictionMarket.predictions(
        user1.address
      );

      expect(playerCommitStruct["commitment"]).to.eq(user1YesCommitment);

      expect(playerCommitStruct["wager"]).to.eq(fixedWager);

      expect(playerCommitStruct["choice"]).to.eq(0);
    });

    it("should emit Commit event", async () => {
      commitChoiceTransaction = await secretPredictionMarket
        .connect(thirdParty)
        .commitChoice(user1YesCommitment, signature, user1.address, {
          value: fixedWager,
        });
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

  describe("revealChoice", () => {
    let payload;
    let payloadHash;
    let signature;
    let commitChoiceTransaction;
    let revealChoiceTransaction;

    before(async () => {
      payload = ethers.utils.defaultAbiCoder.encode(
        ["bytes32"],
        [user1YesCommitment]
      );
      payloadHash = ethers.utils.keccak256(payload);

      signature = await user1.signMessage(ethers.utils.arrayify(payloadHash));
    });

    beforeEach(async () => {
      snapshotId = await ethers.provider.send("evm_snapshot", []);

      commitChoiceTransaction = await secretPredictionMarket
        .connect(thirdParty)
        .commitChoice(user1YesCommitment, signature, user1.address, {
          value: fixedWager,
        });
      await commitChoiceTransaction.wait();
    });

    afterEach(async () => {
      await ethers.provider.send("evm_revert", [snapshotId]);
    });

    it("should revert if reveal deadline has passed", async () => {
      await network.provider.send("evm_increaseTime", [1000000]);
      await network.provider.send("evm_mine");

      await expect(
        secretPredictionMarket
          .connect(thirdParty)
          .revealChoice(yesEnumInt, user1TestBlindingFactor, user1.address)
      ).to.be.revertedWith("Reveal deadline has passed");
    });

    it("should revert if choice is not 'Yes' or 'No'", async () => {
      await expect(
        secretPredictionMarket
          .connect(thirdParty)
          .revealChoice(0, user1TestBlindingFactor, user1.address)
      ).to.be.revertedWith("Choice must be either 'Yes' or 'No");
    });

    it("should revert if blinding factor is incorrect", async () => {
      const wrongBlindingFactor = ethers.utils.formatBytes32String("wrong");

      await expect(
        secretPredictionMarket
          .connect(thirdParty)
          .revealChoice(yesEnumInt, wrongBlindingFactor, user1.address)
      ).to.be.revertedWith("Hash does not match commitment");
    });

    it("should revert if choice is incorrect", async () => {
      await expect(
        secretPredictionMarket
          .connect(thirdParty)
          .revealChoice(noEnumInt, user1TestBlindingFactor, user1.address)
      ).to.be.revertedWith("Hash does not match commitment");
    });

    it("should revert if prediction has already been revealed", async () => {
      revealChoiceTransaction = await secretPredictionMarket
        .connect(thirdParty)
        .revealChoice(yesEnumInt, user1TestBlindingFactor, user1.address);
      await revealChoiceTransaction.wait();

      await expect(
        secretPredictionMarket
          .connect(thirdParty)
          .revealChoice(yesEnumInt, user1TestBlindingFactor, user1.address)
      ).to.be.revertedWith("Commit has already been revealed");
    });

    it("should update PredictionCommit in players mapping with revealed choice", async () => {
      revealChoiceTransaction = await secretPredictionMarket
        .connect(thirdParty)
        .revealChoice(yesEnumInt, user1TestBlindingFactor, user1.address);
      await revealChoiceTransaction.wait();

      const user1PredictionStruct = await secretPredictionMarket.predictions(
        user1.address
      );

      expect(user1PredictionStruct["choice"]).to.eq(yesEnumInt);
    });

    it("should emit Reveal event", async () => {
      revealChoiceTransaction = await secretPredictionMarket
        .connect(thirdParty)
        .revealChoice(yesEnumInt, user1TestBlindingFactor, user1.address);
      await revealChoiceTransaction.wait();

      expect(revealChoiceTransaction)
        .to.emit(secretPredictionMarket, "Reveal")
        .withArgs(user1.address, yesEnumInt);
    });
  });

  describe("claimWinnings", () => {
    let user1YesPayload;
    let user2NoPayload;
    let user1YesPayloadHash;
    let user2NoPayloadHash;

    let user1Signature;
    let user2Signature;

    let user1CommitChoiceTransaction;
    let user2CommitChoiceTransaction;

    let winnings;
    let numWinningReveals;
    let losingPot;

    let reportEventOccured;

    let blindingFactors = [];

    before(async () => {
      for (const a of accounts.slice(1, 11)) {
        let commitment;
        let payload;
        let payloadHash;
        let signature;
        let commitChoiceTransaction;

        blindingFactors[a] = ethers.utils.formatBytes32String("user", a);
        console.log("user", a, "blindingFactor: ", blindingFactors[a]);

        if (a % 2 === 1) {
          commitment = await ethers.utils.solidityKeccak256(
            ["uint", "bytes32"],
            [yesEnumInt, blindingFactors[a]]
          );
        } else {
          commitment = await ethers.utils.solidityKeccak256(
            ["uint", "bytes32"],
            [noEnumInt, blindingFactors[a]]
          );
        }

        payload = ethers.utils.defaultAbiCoder.encode(
          ["bytes32"],
          [commitment]
        );
        payloadHash = ethers.utils.keccak256(payload);

        signature = await a.signMessage(ethers.utils.arrayify(payloadHash));

        commitChoiceTransaction = await secretPredictionMarket
          .connect(a)
          .commitChoice(commitment, signature, a.address, {
            value: fixedWager,
          });
        await commitChoiceTransaction.wait();
      }
    });

    describe("when event occurs", () => {
      let beforePriceSetAboveBenchmarkSnapshotId;

      let user1YesReveal;
      let user2NoReveal;

      let user1ClaimTransaction;

      before(async () => {
        beforePriceSetAboveBenchmarkSnapshotId = await ethers.provider.send(
          "evm_snapshot",
          []
        );

        price = 6000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        reportEventOccured = await secretPredictionMarket
          .connect(thirdParty)
          .reportEvent();
        await reportEventOccured.wait();

        for (const a of accounts.splice(1, 11)) {
          let reveal;

          if (a % 2 == 1) {
            reveal = await secretPredictionMarket
              .connect(thirdParty)
              .revealChoice(yesEnumInt, blindingFactors[a], a.address);
            await reveal.wait();
          } else {
            reveal = await secretPredictionMarket
              .connect(thirdParty)
              .revealChoice(noEnumInt, blindingFactors[a], a.address);
          }
        }

        // user1YesReveal = await secretPredictionMarket
        //   .connect(thirdParty)
        //   .revealChoice(yesEnumInt, user1TestBlindingFactor, user1.address);
        // await user1YesReveal.wait();

        // user2NoReveal = await secretPredictionMarket
        //   .connect(thirdParty)
        //   .revealChoice(noEnumInt, user2TestBlindingFactor, user2.address);
        // await user2NoReveal.wait();

        numWinningReveals = await secretPredictionMarket
          .connect(thirdParty)
          .numOfWinningReveals();

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
          user1ClaimTransaction = await secretPredictionMarket
            .connect(thirdParty)
            .claimWinnings(user1.address);
          await user1ClaimTransaction.wait();

          const user1BalanceAfterWinnings = await ethers.provider.getBalance(
            user1.address
          );

          const differenceInAddressBalances =
            user1BalanceAfterWinnings.sub(user1StartingBalance);

          expect(differenceInAddressBalances).to.eq(winnings);
        });

        it("should emit Payout event", async () => {
          expect(user1ClaimTransaction)
            .to.emit(secretPredictionMarket, "Payout")
            .withArgs(user1.address, winnings);
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        it("should revert", async () => {
          await expect(
            secretPredictionMarket
              .connect(thirdParty)
              .claimWinnings(user2.address)
          ).to.be.revertedWith("Invalid claim");
        });
      });
    });

    describe("when event does not occur", () => {
      let beforePriceSetUnderBenchmarkSnapshotId;

      let user1YesReveal;
      let user2NoReveal;

      let user2ClaimTransaction;

      before(async () => {
        beforePriceSetUnderBenchmarkSnapshotId = await ethers.provider.send(
          "evm_snapshot",
          []
        );

        price = 4000;

        const setMockPrice = await mockOracle.setEthPrice(price);
        await setMockPrice.wait();

        reportEventOccured = await secretPredictionMarket
          .connect(thirdParty)
          .reportEvent();
        await reportEventOccured.wait();

        user1YesReveal = await secretPredictionMarket
          .connect(thirdParty)
          .revealChoice(yesEnumInt, user1TestBlindingFactor, user1.address);
        await user1YesReveal.wait();

        user2NoReveal = await secretPredictionMarket
          .connect(thirdParty)
          .revealChoice(noEnumInt, user2TestBlindingFactor, user2.address);
        await user2NoReveal.wait();

        numWinningReveals = await secretPredictionMarket
          .connect(thirdParty)
          .numOfWinningReveals();

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
            secretPredictionMarket
              .connect(thirdParty)
              .claimWinnings(user1.address)
          ).to.be.revertedWith("Invalid claim");
        });
      });

      describe("when player with 'No' reveal attempts to claim", () => {
        it("should pay out player's wager + (wager's proportion of winning pot * losing pot)", async () => {
          user2ClaimTransaction = await secretPredictionMarket
            .connect(thirdParty)
            .claimWinnings(user2.address);
          await user2ClaimTransaction.wait();

          const user2BalanceAfterWinnings = await ethers.provider.getBalance(
            user2.address
          );

          const differenceInAddressBalances =
            user2BalanceAfterWinnings.sub(user2StartingBalance);

          expect(differenceInAddressBalances).to.eq(winnings);
        });

        it("should emit Payout event", async () => {
          expect(user2ClaimTransaction)
            .to.emit(secretPredictionMarket, "Payout")
            .withArgs(user2.address, winnings);
        });
      });
    });
  });
});
