const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const OTP = new Schema(
  {
    UserId: {
      type: String,
      required: true,
      trim: true,
    },
    PhoneNo: {
      type: String,
      required: true,
      trim: true,
    },
    OtpId: {
      type: String,
      required: true,
      unique:true,
    },
    OTPExpires: {
      type: Number,
      required: true,
    },
    Try: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

OTP.index({ createdAt: 1 }, { expireAfterSeconds: 600 }); // 1 hour TTL

const Otp = mongoose.model("Otp", OTP);
module.exports = Otp;
