const admin = require("firebase-admin");
const serviceAccount = require("../drivesync-e96f8-firebase-adminsdk-lf8c0-f99ffe7fe3.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

exports.sendNotification = async (registrationToken, message) => {
  const messageSend = {
    token: registrationToken,
    notification: message,
    android: {
      priority: "high",
    },
    apns: {
      payload: {
        aps: {
          badge: 42,
        },
      },
    },
  };
  admin
    .messaging()
    .send(messageSend)
    .then((response) => {
      console.log("successfully send message: ", response);
    })
    .catch((error) => {});
};
