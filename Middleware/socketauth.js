const jwt = require("jsonwebtoken");
const Usr = require("../Database/collection/User");

const clientvalidate = async (socket, next) => {
  try {
    let token = socket.handshake.auth.token;
    if (!token) {
      socket.user = { success: false };
      return next();
    }
    const decodedToken = jwt.verify(token, process.env.KEY);

    if (!decodedToken) {
      socket.user = { success: false };
      return next();
    }

    const user = await Usr.findOne({
      UserId: decodedToken.UserId,
      "tokens.token": token,
    });

    if (!user) {
      socket.user = { success: false };
      return next();
    }

    socket.user = {
      success: true,
      UserId: user.UserId,
      Name: user.Name,
      PhoneNo: user.PhoneNo,
      EmailId: user.EmailId,
      City: user.City,
    };
    next();
  } catch (error) {
    socket.user = { success: false };
    return next();
  }
};

const partnervalidate = async (socket, next) => {
  try {
    let token = socket.handshake.auth.token;
    const decodedToken = jwt.verify(token, process.env.KEY);
    if (!decodedToken) {
      socket.user = { success: false };
      return next();
    }

    const user = await Usr.findOne({
      UserId: decodedToken.UserId,
      "tokens.token": token,
    });

    if (!user) {
      socket.user = { success: false };
      return next();
    }
    if (!user.Operator.verified) {
      socket.user = { success: false };
      return next();
    }
    socket.user = {
      success: true,
      UserId: user.UserId,
      Name: user.Name,
      PhoneNo: user.PhoneNo,
      EmailId: user.EmailId,
      City: user.City,
      Operator: user.Operator,
    };
    next();
  } catch (error) {
    socket.user = { success: false };
    return next();
  }
};

module.exports = { clientvalidate, partnervalidate };
