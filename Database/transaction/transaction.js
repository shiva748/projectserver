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
const crypto = require("crypto");

exports.verifySignature = async (
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  operatorId
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ OperatorId: operatorId }).session(
      session
    );

    if (!wallet) {
      throw new Error("Unauthorized access");
    }

    const order = wallet.Transactions.find(
      (item) => item.orderId === razorpay_order_id
    );
    if (!order || order.status !== "pending") {
      throw new Error("Unauthorized access");
    }
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RZPSECRET)
      .update(`${order.orderId}|${razorpay_payment_id}`)
      .digest("hex");
    if (generatedSignature !== razorpay_signature) {
      console.log("payment failed");
      const error = new Error("Invalid signature");
      error.status = 400;
      throw error;
    }

    wallet.Balance += order.amount;
    order.status = "completed";
    wallet.Transactions = wallet.Transactions.map((itm) => {
      if (itm.orderId == order.orderId) {
        return order;
      } else {
        return itm;
      }
    });
    await wallet.save({ session });
    await session.commitTransaction();
    session.endSession();

    return { success: true, message: "Payment verified and wallet updated" };
  } catch (error) {
    // Step 4: Rollback transaction if any error occurs
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

exports.deductfee = async (operatorId, feeAmount, bookingId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const operatorWallet = await Wallet.findOne({
      OperatorId: operatorId,
    }).session(session);
    if (!operatorWallet) {
      throw new Error("Operator wallet not found");
    }

    if (operatorWallet.Balance < feeAmount) {
      throw new Error("Insufficient funds in operator wallet");
    }

    operatorWallet.Balance -= feeAmount;
    operatorWallet.Transactions.unshift({
      amount: feeAmount,
      type: "debit",
      description: `platform fee for booking ${bookingId}`,
      status: "completed",
      transactionId: uniqid("txn-"),
    });

    await operatorWallet.save();

    await session.commitTransaction();
    session.endSession();

    return { result: true };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

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
