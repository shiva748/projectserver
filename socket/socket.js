const { Server } = require("socket.io");
const { clientvalidate, partnervalidate } = require("../Middleware/socketauth");
const Booking = require("../Database/collection/Booking");
const Operator = require("../Database/collection/Operator");
const User = require("../Database/collection/User");
const { sendNotification } = require("../Controller/fcm");

const axios = require("axios");

const locationsInIndia = [
  // States
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Lakshadweep",
  "Delhi",
  "Puducherry",
  "Ladakh",
  "Jammu and Kashmir",
];
function getCityName(description) {
  const parts = description.split(",").map((part) => part.trim());
  let locationIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (locationsInIndia.includes(parts[i])) {
      locationIndex = i;
      break;
    }
  }

  if (locationIndex !== -1) {
    if (locationIndex > 0) {
      return parts[locationIndex - 1];
    } else {
      return parts[locationIndex];
    }
  } else {
    return parts[0];
  }
}

function initializeSocket(server) {
  const io = new Server(server);

  // Client socket namespace
  const clientio = io.of("/clients");
  clientio.use(clientvalidate);

  const clients = new Map();

  // Partner socket namespace
  const partnerio = io.of("/partner");
  partnerio.use(partnervalidate);

  const partners = new Map();

  // === handeling === //

  clientio.on("connection", (socket) => {
    if (!socket.user.success) {
      socket.emit("unauthorized", "can't validate your token");
      socket.disconnect();
      console.log("invalid connection request");
      return;
    }
    console.log("client connected");
    console.log("ID ", socket.id);

    if (!clients.has(socket.user.UserId)) {
      clients.set(socket.user.UserId, []);
    }
    clients.get(socket.user.UserId).push(socket.id);

    socket.on("disconnect", () => {
      console.log(`client ${socket.id} disconnected`);
      const sockets = clients.get(socket.user.UserId);
      if (sockets) {
        const index = sockets.indexOf(socket.id);
        if (index > -1) {
          sockets.splice(index, 1);
        }
        if (sockets.length === 0) {
          clients.delete(socket.user.UserId);
        }
      }
    });

    socket.on("new_booking", async (data) => {
      try {
        let booking = await Booking.findOne({
          UserId: socket.user.UserId,
          BookingId: data,
        });

        if (!booking) {
          return;
        } else if (booking.Status !== "pending") {
          return;
        }

        let fromLocation =
          booking.From && booking.From.location ? booking.From.location : null;
        let toLocation =
          booking.To && booking.To.location ? booking.To.location : null;

        if (!fromLocation && !toLocation) {
          return;
        }
        let operators = await Operator.find(
          {
            $or: [
              {
                "City.location": {
                  $geoWithin: {
                    $centerSphere: [fromLocation.coordinates, 50 / 6371],
                  },
                },
              },
              {
                "From.location": {
                  $geoWithin: {
                    $centerSphere: [fromLocation.coordinates, 50 / 6371],
                  },
                },
              },
              {
                $and: [
                  {
                    "From.location": {
                      $geoWithin: {
                        $centerSphere: [fromLocation.coordinates, 50 / 6371],
                      },
                    },
                  },
                  {
                    "To.location": {
                      $geoWithin: {
                        $centerSphere: [fromLocation.coordinates, 50 / 6371],
                      },
                    },
                  },
                ],
              },
            ],
            Status: "active",
          },
          { OperatorId: 1 }
        );
        let fcm = [];
        operators.forEach((element) => {
          let ps = partners.get(element.OperatorId);
          if (ps) {
            ps.forEach((socketId) => {
              console.log(`sending to ${socketId}`);
              partnerio
                .to(socketId)
                .emit("newbooking", JSON.stringify(booking));
            });
          } else {
            fcm.push("User-" + element.OperatorId.split("-")[1]);
          }
        });
        let message = `A new ${booking.TripType} request of ₹${
          booking.Offer
        } from ${getCityName(booking.From.description)}${
          booking.TripType != "Rental"
            ? " to " + getCityName(booking.To.description)
            : ""
        }`;
        let oups = await User.find({ UserId: { $in: fcm } }, { tokens: 1 });
        oups.forEach((itm) => {
          itm.tokens.forEach((itm) => {
            if (itm.fcm && itm.expire > new Date().getTime()) {
              try {
                sendNotification(itm.fcm, {
                  title: "New Request",
                  body: message,
                });
              } catch (error) {}
            }
          });
        });
      } catch (error) {
        console.error("Error processing new booking:", error);
      }
    });

    socket.on("request_cancel", async (data) => {
      try {
        let booking = await Booking.findOne({
          UserId: socket.user.UserId,
          BookingId: data,
        });

        if (!booking) {
          return;
        } else if (booking.Status !== "cancelled") {
          return;
        }

        let fromLocation =
          booking.From && booking.From.location ? booking.From.location : null;
        let toLocation =
          booking.To && booking.To.location ? booking.To.location : null;

        if (!fromLocation && !toLocation) {
          return;
        }

        let operators = await Operator.find(
          {
            $or: [
              {
                "City.location": {
                  $geoWithin: {
                    $centerSphere: [fromLocation.coordinates, 50 / 6371],
                  },
                },
              },
              {
                "From.location": {
                  $geoWithin: {
                    $centerSphere: [fromLocation.coordinates, 50 / 6371],
                  },
                },
              },
              {
                $and: [
                  {
                    "From.location": {
                      $geoWithin: {
                        $centerSphere: [fromLocation.coordinates, 50 / 6371],
                      },
                    },
                  },
                  {
                    "To.location": {
                      $geoWithin: {
                        $centerSphere: [fromLocation.coordinates, 50 / 6371],
                      },
                    },
                  },
                ],
              },
            ],
            Status: "active",
          },
          { OperatorId: 1 }
        );

        operators.forEach((element) => {
          let ps = partners.get(element.OperatorId);
          if (ps) {
            ps.forEach((socketId) => {
              console.log(`sending to ${socketId}`);
              partnerio.to(socketId).emit("request_cancel", booking.BookingId);
            });
          }
        });
      } catch (error) {
        console.error("Error processing request cancel:", error);
      }
    });

    socket.on("booking_confirmed", async (data) => {
      try {
        let booking = await Booking.findOne({
          UserId: socket.user.UserId,
          BookingId: data,
        });

        if (!booking) {
          return;
        } else if (booking.Status !== "confirmed") {
          return;
        }

        let fromLocation =
          booking.From && booking.From.location ? booking.From.location : null;
        let toLocation =
          booking.To && booking.To.location ? booking.To.location : null;

        if (!fromLocation && !toLocation) {
          return;
        }

        let operators = await Operator.find(
          {
            $or: [
              {
                "City.location": {
                  $geoWithin: {
                    $centerSphere: [fromLocation.coordinates, 50 / 6371],
                  },
                },
              },
              {
                "From.location": {
                  $geoWithin: {
                    $centerSphere: [fromLocation.coordinates, 50 / 6371],
                  },
                },
              },
              {
                $and: [
                  {
                    "From.location": {
                      $geoWithin: {
                        $centerSphere: [fromLocation.coordinates, 50 / 6371],
                      },
                    },
                  },
                  {
                    "To.location": {
                      $geoWithin: {
                        $centerSphere: [fromLocation.coordinates, 50 / 6371],
                      },
                    },
                  },
                ],
              },
            ],
            Status: "active",
          },
          { OperatorId: 1 }
        );

        operators.forEach((element) => {
          let ps = partners.get(element.OperatorId);
          if (ps) {
            ps.forEach((socketId) => {
              console.log(`sending to ${socketId}`);
              partnerio.to(socketId).emit(
                "booking_confirmed",
                JSON.stringify({
                  BookingId: booking.BookingId,
                  OperatorId: booking.AcceptedBid.OperatorId,
                })
              );
            });
          }
        });
      } catch (error) {
        console.error("Error processing request:", error);
      }
    });

    socket.on("booking_cancelled", async (data) => {
      try {
        let booking = await Booking.findOne({
          UserId: socket.user.UserId,
          BookingId: data,
        });

        if (!booking) {
          return;
        } else if (booking.Status !== "cancelled") {
          return;
        }

        let ps = partners.get(booking.AcceptedBid.OperatorId);
        if (ps) {
          ps.forEach((socketId) => {
            console.log(`sending to ${socketId}`);
            partnerio.to(socketId).emit("booking_cancelled", booking.BookingId);
          });
        } else {
          console.log("fcm");
        }
      } catch (error) {
        console.error("Error processing request:", error);
      }
    });
    socket.on("offer_rejected", async (data) => {
      try {
        data = JSON.parse(data);
        let booking = await Booking.findOne({
          UserId: socket.user.UserId,
          BookingId: data.BookingId,
          Status: "pending",
        });

        if (!booking) {
          return;
        } else if (booking.Status !== "pending") {
          return;
        }
        let bid = booking.Bids.find(
          (itm) => itm.OperatorId == data.OperatorId && itm.rejected
        );
        if (!bid) {
          return;
        }
        let ps = partners.get(bid.OperatorId);
        if (ps) {
          console.log("sending offer rejection");
          partnerio.to(ps).emit("offer_rejected", JSON.stringify(booking));
        } else {
          console.log("fcm");
        }
      } catch (error) {
        console.error("Error processing request:", error);
      }
    });
  });

  partnerio.on("connection", (socket) => {
    if (!socket.user.success) {
      socket.emit("unauthorized", "can't validate your token");
      socket.disconnect();
      console.log("invalid connection request");
      return;
    }
    console.log("partner connected");
    console.log("ID ", socket.id);
    if (!partners.has(socket.user.Operator.OperatorId)) {
      partners.set(socket.user.Operator.OperatorId, []);
    }
    partners.get(socket.user.Operator.OperatorId).push(socket.id);

    socket.on("newbids", async (data) => {
      try {
        let booking = await Booking.findOne({
          BookingId: data,
          Status: "pending",
        });
        let cs = clients.get(booking.UserId);
        if (cs) {
          cs.forEach((socketId) => {
            console.log("Sending");
            clientio.to(socketId).emit("newbids", JSON.stringify(booking));
          });
        }
      } catch (error) {
        console.error("Error processing new bid:", error);
      }
    });

    socket.on("removebids", async (data) => {
      try {
        let booking = await Booking.findOne({
          BookingId: data,
          Status: "pending",
        });
        let cs = clients.get(booking.UserId);
        if (cs) {
          cs.forEach((socketId) => {
            clientio.to(socketId).emit("removebids", JSON.stringify(booking));
          });
        }
      } catch (error) {
        console.error("Error processing new bid:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`partner ${socket.id} disconnected`);
      const sockets = partners.get(socket.user.Operator.OperatorId);
      if (sockets) {
        const index = sockets.indexOf(socket.id);
        if (index > -1) {
          sockets.splice(index, 1);
        }
        if (sockets.length === 0) {
          partners.delete(socket.user.Operator.OperatorId);
        }
      }
    });
  });

  return { clientio, partnerio, clients, partners };
}

module.exports = initializeSocket;
