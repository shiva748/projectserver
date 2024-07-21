const express = require("express");
const Router = express.Router();
const {
  search,
  distance,
  signup,
  verifyOTP,
  login,
  authenticate,
  logout,
  citysearch,
  getRates,
  registerOperator,
  OperatorProfile,
  OperatorImage,
  SearchDriver,
  RegisterDriver,
  getActivation,
  RegisterCab,
  bookcab,
  updatedetails,
  UserImage,
  Activate,
  getDuty,
  change_password,
  mydriver,
  myCabs,
  CabImage,
  DriverImage,
  getactivecd,
  postOffer,
  getrequests,
  cancelRequest,
  getWallet,
  createOrder,
  servepay,
  verifypayment,
  acceptOffer,
  getBookings,
  getOBookings,
  cancelBooking,
  rejectOffer,
  DriverProfile,
  verifyProfile,
  getDBookings,
  failedpayment,
  storefcm,
  genrateOtp,
  startTrip,
  endTrip,
} = require("../Controller/controller");
const path = require("path");
const fs = require("fs");
const verifyToken = require("../Middleware/auth");

Router.get("/", (req, res) => {
  res.json({ message: "we are live" });
});

Router.get("/media/logo.png", (req, res) => {
  try {
    let filePath = path.join(__dirname, "../files/logo.png");

    if (fs.existsSync(filePath)) {
      return res.status(200).sendFile(filePath);
    } else {
      return res.status(404).json({ message: "File not found" });
    }
  } catch (error) {
    console.error("Error serving file:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

Router.post("/login", login);

Router.post("/register", signup);

Router.post("/verify-otp", verifyOTP);

Router.post("/store-fcm", verifyToken, storefcm);

Router.post("/search", verifyToken, search);

Router.post("/search-city", verifyToken, citysearch);

Router.post("/calculate-distance", verifyToken, distance);

Router.get("/get-rates", verifyToken, getRates);

Router.get("/authenticate", verifyToken, authenticate);

Router.get("/logout", verifyToken, logout);

Router.post("/update-details", verifyToken, updatedetails);

Router.post("/operator-registration", verifyToken, registerOperator);

Router.get("/Operator/profile", verifyToken, OperatorProfile);

Router.post("/Operator/SearchDriver", verifyToken, SearchDriver);

Router.get("/Operator/media/:OperatorId/image", OperatorImage);

Router.get("/User/media/:UserId/:image", UserImage);

Router.post("/Operator/driver-registration", verifyToken, RegisterDriver);

Router.post("/Operator/Activation/status", verifyToken, getActivation);

Router.post("/Operator/cab-registration", verifyToken, RegisterCab);

Router.get("/Operator/Activate", verifyToken, Activate);

Router.post("/Book-cab", verifyToken, bookcab);

Router.post("/Operator/get-duty", verifyToken, getDuty);

Router.post("/change-password", verifyToken, change_password);

Router.post("/Operator/my-drivers", verifyToken, mydriver);

Router.post("/Operator/my-cabs", verifyToken, myCabs);

Router.get("/Cab/:CabId/:Image", CabImage);

Router.get("/Driver/media/:DriverId/:Image", DriverImage);

Router.post("/Operator/getactive_cd", verifyToken, getactivecd);

Router.post("/Operator/request/offer", verifyToken, postOffer);

Router.get("/get-request", verifyToken, getrequests);

Router.post("/cancel-request", verifyToken, cancelRequest);

Router.post("/cancel-booking", verifyToken, cancelBooking);

Router.get("/Operator/my-wallet", verifyToken, getWallet);

Router.post("/Operator/wallet/topup/create-order", verifyToken, createOrder);

Router.get("/Operator/wallet/topup/razorpay/:UserId/:OrderId", servepay);

Router.post(
  "/Operator/wallet/topup/razorpay/:OrderId/verify",
  verifyToken,
  verifypayment
);

Router.post("/Operator/wallet/topup/razorpay/:OrderId/failed", failedpayment);

Router.post("/request/accept-offer", verifyToken, acceptOffer);

Router.post("/request/reject-offer", verifyToken, rejectOffer);

Router.get("/get-booking", verifyToken, getBookings);

Router.post("/Operator/get-booking", verifyToken, getOBookings);

Router.post("/Driver/get-booking", verifyToken, getDBookings);

Router.get("/Driver/get-profile", verifyToken, DriverProfile);

Router.get("/Driver/verify-profile", verifyToken, verifyProfile);

Router.post("/Driver/booking/otp", verifyToken, genrateOtp);

Router.post("/Driver/booking/start", verifyToken, startTrip);

Router.post("/Driver/booking/end", verifyToken, endTrip);

module.exports = Router;
