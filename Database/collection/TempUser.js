const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tempUserSchema = new Schema(
  {
    EmailId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\S+@\S+\.\S+$/,
    },
    PhoneNo: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    Name: {
      type: String,
      required: true,
      trim: true,
    },
    Password: {
      type: String,
      required: true,
      minlength: 8,
    },
    OtpId: {
      type: String,
      required: true,
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

tempUserSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 }); // 1 hour TTL

const TempUser = mongoose.model("TempUser", tempUserSchema);
module.exports = TempUser;
