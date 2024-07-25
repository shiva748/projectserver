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
      Transactions: [],
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
    if (wallet.Balance > 2000 || wallet.Balance + amount > 2000) {
      throw new Error("A wallet can hold maximum amount of INR 2000");
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
const Booking = require("../collection/Booking");
const { type } = require("os");

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

    return {
      success: true,
      message: "Payment verified and wallet updated",
      amount: order.amount,
    };
  } catch (error) {
    // Step 4: Rollback transaction if any error occurs
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};
// === === === dismiss payment === === === //

exports.paymentDismiss = async (operatorId, orderId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ OperatorId: operatorId }).session(
      session
    );
    if (!wallet) {
      throw new Error("Unauthorized access");
    }

    const order = wallet.Transactions.find((item) => item.orderId === orderId);
    if (!order || order.status !== "pending") {
      throw new Error("Unauthorized access");
    }
    let odr = await razorpay.orders.fetchPayments(order.orderId);
    console.log(odr);
    if (
      odr.items.some(
        (itm) => itm.status == "captured" && itm.order_id == order.orderId
      )
    ) {
      order.status = "completed";
      wallet.Balance += order.amount;
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
      return { success: true, message: "Payment failed and wallet updated" };
    } else {
      order.status = "failed";
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
      return { success: true, message: "Payment failed and wallet updated" };
    }
  } catch (error) {
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

exports.refundfee = async (BookingId, UserId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const booking = await Booking.findOne({ BookingId, UserId }).session(
      session
    );
    if (!booking) {
      throw new Error("No Booking found");
    } else if (booking.Status !== "confirmed") {
      throw new Error("Booking can't be cancelled at this stage");
    }
    const operatorWallet = await Wallet.findOne({
      OperatorId: booking.AcceptedBid.OperatorId,
    }).session(session);
    if (!operatorWallet) {
      throw new Error("Operator wallet not found");
    }
    operatorWallet.Balance += booking.Fee;
    operatorWallet.Transactions.unshift({
      amount: booking.Fee,
      type: "refund",
      status: "completed",
      transactionId: uniqid("txn-"),
      description: `platform fee refund for booking ${BookingId}`,
    });
    booking.Status = "cancelled";
    booking.Fee = 0;
    await Promise.all([booking.save(), operatorWallet.save()]);

    await session.commitTransaction();
    session.endSession();

    return { success: true, message: "booking cancelled successfully" };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};
