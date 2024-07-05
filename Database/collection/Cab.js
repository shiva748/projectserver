const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const cabSchema = new Schema(
  {
    CabId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    Manufacturer: {
      type: String,
      required: true,
      trim: true,
    },
    Model: {
      type: String,
      required: true,
      trim: true,
    },
    Category: {
      type: String,
      required: true,
      enum: ["Micro", "Sedan", "MUV", "SUV"],
    },
    CabNumber: {
      type: String,
      required: true,
      trim: true,
    },
    Photo: {
      type: String,
      required: true,
    },
    Document: {
      Authorization: {
        type: String,
        required: true,
      },
      Permit: {
        type: String,
        required: true,
      },
      RegistrationCertificate: {
        type: String,
        required: true,
      },
    },
    OperatorId: {
      type: String,
      ref: "Operator",
      required: true,
    },
    Status: {
      type: String,
      enum: ["pending", "verified", "suspended", "unlinked"],
      default: "pending",
      required: true,
    },
  },
  { timestamps: true }
);

const Cab = mongoose.model("Cab", cabSchema);

module.exports = Cab;
