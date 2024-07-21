const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const jwt = require("jsonwebtoken");
const Bcrypt = require("bcryptjs");

const userSchema = new Schema({
  UserId: {
    type: String,
    unique: true,
    required: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  Name: {
    type: String,
    required: true,
    trim: true,
  },
  Password: {
    type: String,
    required: true,
  },
  PhoneNo: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  EmailId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: /^\S+@\S+\.\S+$/,
  },
  Operator: {
    OperatorId: {
      type: String,
    },
    Status: {
      type: String,
      enum: ["pending", "verified", "active", "suspended"],
    },
    verified: {
      type: Boolean,
    },
  },
  Driver: {
    DriverId: {
      type: String,
    },
    Status: {
      type: String,
      enum: ["approved", "verified", "suspended"],
    },
  },
  tokens: [
    {
      token: {
        type: String,
      },
      fcm: {
        type: String,
      },
      expire: {
        type: Number,
      },
    },
  ],
  City: {
    description: {
      type: String,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    place_id: {
      type: String,
    },
  },
  Profile: {
    type: String,
  },
});

userSchema.index({ "City.location": "2dsphere" });

userSchema.pre("save", async function (next) {
  if (this.isModified("Password")) {
    this.Password = await Bcrypt.hash(this.Password, 12);
  }
  next();
});

userSchema.methods.genrateauth = async function () {
  try {
    let token = jwt.sign({ UserId: this.UserId }, process.env.KEY, {
      expiresIn: "14 days",
    });
    this.tokens.push({
      token,
      expire: new Date().getTime() + 1209600000,
    });
    await this.save();
    return token;
  } catch (error) {
    throw error;
  }
};

const User = mongoose.model("User", userSchema);

module.exports = User;
