exports.getDuty = async (req, res) => {
  try {
    let { From, To, date } = req.body;

    if (!From) {
      return res.status(400).json({
        success: false,
        message: "From location is required",
      });
    }

    [From, To].forEach((itm) => {
      if (itm) {
        if (["description", "place_id"].some((subitm) => !itm[subitm])) {
          throw new Error("Invalid input");
        }
      }
    });

    From = await getLatLong(From.description);
    if (To) {
      To = await getLatLong(To.description);
    }

    const currentDate = new Date();

    const baseQuery = {
      Status: "pending",
      Date: { $gte: new Date(currentDate.getTime() - 2 * 60 * 60 * 1000) },
    };

    if (date) {
      baseQuery.Date = {
        $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
      };
    }

    const fromQuery = {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: From.location.coordinates,
        },
        distanceField: "distance",
        maxDistance: 50000, // 50 km
        spherical: true,
      },
    };

    const pipeline = [fromQuery, { $match: baseQuery }];

    let bookings = await Booking.aggregate(pipeline);

    if (To) {
      bookings = bookings.filter((booking) => {
        if (
          booking.To &&
          booking.To.location &&
          booking.To.location.coordinates
        ) {
          const toLocation = booking.To.location.coordinates;
          const distanceTo = calculateDistance(
            toLocation,
            To.location.coordinates
          );
          return distanceTo <= 50000;
        }
        return false;
      });
    }

    res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

function calculateDistance(coords1, coords2) {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;

  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;

  return distance;
}
