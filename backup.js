// socket.js
const { Server } = require("socket.io");
const { clientvalidate, partnervalidate } = require("../Middleware/socketauth");
const Booking = require("../Database/collection/Booking");
const Operator = require("../Database/collection/Operator");
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
    clients.set(socket.user.UserId, socket.id);
    socket.on("disconnect", () => {
      console.log(`client ${socket.id} disconnected`);
      clients.delete(socket.user.UserId);
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
        operators = operators.forEach((element) => {
          let ps = partners.get(element.UserId);
          if (ps) {
            console.log(`sending to ${ps}`);
            partnerio.to(ps).emit("newbooking", JSON.stringify(booking));
          } else {
            console.log("use fcm");
          }
        });
      } catch (error) {
        console.error("Error processing new booking:", error);
      }
    });
    socket.on("request_cancel", async (data) => {
      console.log("hi i am cancel");
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
        operators = operators.forEach((element) => {
          let ps = partners.get(element.UserId);
          if (ps) {
            console.log(`sending to ${ps}`);
            partnerio.to(ps).emit("request_cancel", booking.BookingId);
          }
        });
      } catch (error) {
        console.error("Error processing new booking:", error);
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
    partners.set(socket.user.UserId, socket.id);

    socket.on("newbids", async (data) => {
      try {
        let booking = await Booking.findOne({
          BookingId: data,
          Status: "pending",
        });
        let cs = clients.get(booking.UserId);
        if (cs) {
          console.log("Sending");
          clientio.to(cs).emit("newbids", JSON.stringify(booking));
        }
      } catch (error) {
        console.error("Error processing new bid:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`partner ${socket.id} disconnected`);
      partners.delete(socket.user.UserId);
    });
  });

  return { clientio, partnerio, clients, partners };
}

module.exports = initializeSocket;
