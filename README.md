# Secret Prediction Market

Protocol for a "secret" prediction market centered on the price movement of on-chain assets, with wagers concealed using a commitment scheme. Events being wagered on are structured as: will the asset exceed `benchmarkPrice` at any point before `eventDeadline`?

Users can create a commitment using either a Yes or No choice and a blinding factor. Once the `eventDeadline` has passed, users can reveal their winning commitments in order to claim their winnings.

Winnings are calculated as a user's original wager, plus the losing pot multiplied by the proportion of the user's wager in the winning pot.
