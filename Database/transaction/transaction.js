const mongoose = require("mongoose");
const Wallet = require("../collection/Wallet");
// const TopUpTransaction = require("../collections/TopUpTransaction");
const Razorpay = require("razorpay");
const uniqid = require("uniqid");
// === === === initializing wallet === === === //

exports.initializeWallet = async (OperatorId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existingWallet = await Wallet.findOne({ OperatorId }).session(
      session
    );

    if (existingWallet) {
      throw new Error("Wallet already exists for this operator");
    }

    const newWallet = new Wallet({
      OperatorId,
      Balance: 0,
      transactions: [],
    });

    await newWallet.save({ session });

    await session.commitTransaction();
    session.endSession();

    return newWallet;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

const razorpay = new Razorpay({
  key_id: process.env.RZPKEY,
  key_secret: process.env.RZPSECRET,
});

exports.initate_topup = async (operatorId, amount) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ OperatorId: operatorId }).session(
      session
    );

    if (!wallet) {
      throw new Error("Unauthorized access: Operator Wallet not found");
    }
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
    });

    let transaction = {
      type: "top-up",
      amount: amount,
      description: `wallet topup with ₹${amount}`,
      transactionId: uniqid("txn-"),
      orderId: razorpayOrder.id,
    };
    wallet.Transactions.unshift(transaction);
    await wallet.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { orderId: razorpayOrder.id, amount };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// exports.verifyPayment = async (orderId, paymentId, signature) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // Fetch the transaction details from your database using the orderId
//     const transaction = await TopUpTransaction.findOne({
//       _id: orderId,
//     }).session(session);

//     if (!transaction) {
//       const error = new Error("Transaction not found");
//       error.status = 404;
//       throw error;
//     }

//     // Verify Razorpay signature
//     const generatedSignature = 1; /* Implement your signature generation logic */
//     if (generatedSignature !== signature) {
//       const error = new Error("Invalid signature");
//       error.status = 400;
//       throw error;
//     }

//     // Update transaction status and operator's wallet balance
//     transaction.status = "completed"; // Assuming successful payment verification
//     await transaction.save({ session });

//     const operator = await Wallet.findOne({
//       owner: transaction.operator,
//     }).session(session);
//     if (!operator) {
//       const error = new Error("Operator wallet not found");
//       error.status = 404;
//       throw error;
//     }

//     operator.balance += transaction.amount;
//     await operator.save({ session });

//     // Step 3: Commit the transaction
//     await session.commitTransaction();
//     session.endSession();

//     return { success: true, message: "Payment verified and wallet updated" };
//   } catch (error) {
//     // Step 4: Rollback transaction if any error occurs
//     await session.abortTransaction();
//     session.endSession();
//     throw error;
//   }
// };

// exports.deductfee = async (operatorId, feeAmount) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const operatorWallet = await Wallet.findOne({
//       ownerId: operatorId,
//     }).session(session);
//     if (!operatorWallet) {
//       throw new Error("Operator wallet not found");
//     }

//     if (operatorWallet.balance < feeAmount) {
//       throw new Error("Insufficient funds in operator wallet");
//     }

//     operatorWallet.balance -= feeAmount;
//     operatorWallet.transactions.push({
//       amount: -feeAmount,
//       type: "debit",
//       from: operatorId,
//       to: "platform",
//     });

//     // Assuming platform wallet is a separate entity
//     const platformWallet = await Wallet.findOne({
//       /* find platform wallet */
//     }).session(session);
//     if (!platformWallet) {
//       throw new Error("Platform wallet not found");
//     }

//     platformWallet.balance += feeAmount;
//     platformWallet.transactions.push({
//       amount: feeAmount,
//       type: "credit",
//       from: operatorId,
//       to: "platform",
//     });

//     await Promise.all([operatorWallet.save(), platformWallet.save()]);

//     await session.commitTransaction();
//     session.endSession();

//     return { operatorWallet, platformWallet };
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     throw error;
//   }
// };

// exports.refundfee = async (operatorId, feeAmount) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // Assuming platform wallet is a separate entity
//     const platformWallet = await Wallet.findOne({
//       /* find platform wallet */
//     }).session(session);
//     if (!platformWallet) {
//       throw new Error("Platform wallet not found");
//     }

//     if (platformWallet.balance < feeAmount) {
//       throw new Error("Insufficient funds in platform wallet");
//     }

//     platformWallet.balance -= feeAmount;
//     platformWallet.transactions.push({
//       amount: -feeAmount,
//       type: "debit",
//       from: "platform",
//       to: operatorId,
//     });

//     const operatorWallet = await Wallet.findOne({
//       ownerId: operatorId,
//     }).session(session);
//     if (!operatorWallet) {
//       throw new Error("Operator wallet not found");
//     }

//     operatorWallet.balance += feeAmount;
//     operatorWallet.transactions.push({
//       amount: feeAmount,
//       type: "credit",
//       from: "platform",
//       to: operatorId,
//     });

//     await Promise.all([platformWallet.save(), operatorWallet.save()]);

//     await session.commitTransaction();
//     session.endSession();

//     return { operatorWallet, platformWallet };
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     throw error;
//   }
// };
