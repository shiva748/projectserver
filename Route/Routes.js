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
} = require("../Controller/controller");
const verifyToken = require("../Middleware/auth");

Router.get("/", (req, res) => {
  res.json({ message: "we are live" });
});

Router.post("/login", login);

Router.post("/register", signup);

Router.post("/verify-otp", verifyOTP);

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

module.exports = Router;
