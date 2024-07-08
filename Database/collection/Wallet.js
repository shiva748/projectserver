const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const transactionSchema = new Schema({
  type: {
    type: String,
    enum: ["credit", "debit", "refund", "top-up"],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  description: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  transactionId: {
    type: String,
    unique: true,
    required: true,
  },
  orderId: {
    type: String,
    unique: true,
  },
});

const walletSchema = new Schema(
  {
    OperatorId: {
      type: String,
      unique: true,
      required: true,
    },
    Balance: {
      type: Number,
      default: 0,
    },
    Transactions: [transactionSchema],
    LastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
