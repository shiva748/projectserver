const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LocationSchema = new Schema({
  type: {
    type: String,
    enum: ["Point"],
    required: true,
  },
  coordinates: {
    type: [Number],
    required: true,
  },
});

const BookingSchema = new Schema({
  BookingId: {
    type: String,
    required: true,
    unique: true,
  },
  Name: {
    type: String,
    required: true,
  },
  PhoneNo: {
    type: String,
    required: true,
  },
  From: {
    description: {
      type: String,
      required: true,
    },
    place_id: {
      type: String,
      required: true,
    },
    location: {
      type: LocationSchema,
      required: true,
    },
  },
  To: {
    description: {
      type: String,
    },
    place_id: {
      type: String,
    },
    location: {
      type: LocationSchema,
      default: null,
    },
  },
  Status: {
    type: String,
    enum: ["pending", "confirmed", "ongoing", "completed", "cancelled"],
    default: "pending",
    required: true,
  },
  Date: {
    type: Date,
    required: true,
  },
  ReturnDate: {
    type: Date,
  },
  Category: {
    type: String,
    enum: ["Micro", "Sedan", "MUV", "SUV"],
    required: true,
  },
  TripType: {
    type: String,
    enum: ["Oneway", "Roundtrip", "Rental"],
    required: true,
  },
  Offer: {
    type: Number,
    required: true,
  },
  Hour: {
    type: Number,
    required: true,
  },
  Km: {
    type: Number,
    required: true,
  },
  UserId: {
    type: String,
    required: true,
  },
  Reasons: [
    {
      type: String,
    },
  ],
  Operator: {
    type: Boolean,
    required: true,
  },
  Bids: [
    {
      OperatorId: {
        type: String,
      },
      Offer: {
        type: Number,
      },
      CabId: {
        type: String,
      },
      DriverId: {
        type: String,
      },
      Model: {
        type: String,
      },
      Name: {
        type: String,
      },
      Manufacturer: {
        type: String,
      },
      rejected: {
        type: Boolean,
      },
    },
  ],
  AcceptedBid: {
    OperatorId: {
      type: String,
    },
    Offer: {
      type: Number,
    },
    CabId: {
      type: String,
    },
    DriverId: {
      type: String,
    },
  },
  CabDetails: {
    CabId: {
      type: String,
    },
    Number: {
      type: String,
    },
    Model: {
      type: String,
    },
  },
  DriverDetails: {
    DriverId: {
      type: String,
    },
    Name: {
      type: String,
    },
    PhoneNo: {
      type: String,
      trim: true,
    },
  },
  Billing: {
    Otp: {
      Start: {
        type: String,
      },
      End: {
        type: String,
      },
    },
    StartTime: {
      type: Date,
    },
    EndTime: {
      type: Date,
    },
    FinalAmount: {
      type: Number,
    },
  },
  PublishOn: {
    type: Number,
    require: true,
  },
  Fee: {
    type: Number,
  },
  OPF: {
    deducted: {
      type: Boolean,
      default:false
    },
    amount: {
      type: Number,
    },
  },
});

BookingSchema.index({ "From.location": "2dsphere", "To.location": "2dsphere" });
const Booking = mongoose.model("Booking", BookingSchema);

module.exports = Booking;
