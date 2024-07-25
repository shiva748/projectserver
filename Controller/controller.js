const validator = require("validator");
const User = require("../Database/collection/User");
const TempUser = require("../Database/collection/TempUser");
const Bcrypt = require("bcryptjs");
const { sendOTP, verifyOTP } = require("otpless-node-js-auth-sdk");
const uniqid = require("uniqid");
const { getCurrentRates } = require("./multiplier/fare");
const Driver = require("../Database/collection/Driver");
const Otp = require("../Database/collection/Otp");
const {
  initializeWallet,
  initate_topup,
  verifySignature,
  deductfee,
  refundfee,
  paymentDismiss,
} = require("../Database/transaction/transaction");

exports.login = async (req, res) => {
  try {
    const { PhoneNo, Password } = req.body;
    let filter = {};
    if (!PhoneNo) {
      const error = new Error("PhoneNo is required");
      error.status = 400;
      throw error;
    }
    if (PhoneNo) {
      if (!validator.isMobilePhone(PhoneNo, "en-IN")) {
        const error = new Error("Invalid Credentials");
        error.status = 400;
        throw error;
      }
      filter.PhoneNo = "+91" + PhoneNo;
    }

    if (!validator.isLength(Password, { min: 8, max: 50 })) {
      const error = new Error("Invalid Credentials");
      error.status = 400;
      throw error;
    }
    const user = await User.findOne(filter);
    if (!user) {
      const error = new Error("Invalid Credentials");
      error.status = 400;
      throw error;
    }
    let compare = await Bcrypt.compare(Password, user.Password);
    if (compare) {
      let token = await user.genrateauth(user);
      res.status(200).json({
        success: true,
        token,
        validity: new Date(new Date().getTime() + 1209600000),
        message: "Login Successful",
        data: {
          UserId: user.UserId,
          Name: user.Name,
          EmailId: user.EmailId,
          PhoneNo: user.PhoneNo,
          City: user.City,
          Profile: user.Profile,
          Operator: user.Operator,
        },
      });
    } else {
      const error = new Error("Invalid Credentials");
      error.status = 400;
      throw error;
    }
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal Server Error" });
  }
};

exports.signup = async (req, res) => {
  try {
    let { EmailId, Name, PhoneNo, Password, CPassword } = req.body;

    if (!validator.isEmail(EmailId)) {
      let error = new Error("Please enter a valid email");
      error.status = 400;
      throw error;
    }

    if (!validator.isLength(Name, { min: 3, max: 50 })) {
      let error = new Error("Name should be between 3 and 50 characters long");
      error.status = 400;
      throw error;
    }

    if (!validator.isMobilePhone(PhoneNo, "en-IN")) {
      let error = new Error("Please enter a valid phone number");
      error.status = 400;
      throw error;
    }
    if (!validator.isLength(PhoneNo, { min: 10, max: 10 })) {
      let error = new Error(
        "Please enter a valid phone number without country code"
      );
      error.status = 400;
      throw error;
    }
    if (Password !== CPassword) {
      let error = new Error("Passwords do not match");
      error.status = 400;
      throw error;
    }

    if (!validator.isLength(Password, { min: 8, max: 50 })) {
      let error = new Error(
        "Password should be at least 8 to 50 characters long"
      );
      error.status = 400;
      throw error;
    }
    const existingUser = await User.findOne({
      $or: [{ EmailId: EmailId.toLowerCase() }, { PhoneNo: "+91" + PhoneNo }],
    });
    if (existingUser) {
      let error = new Error(
        "User with given email or phone number already exists"
      );
      error.status = 400;
      throw error;
    }
    await TempUser.findOneAndDelete({
      $or: [{ EmailId: EmailId.toLowerCase() }, { PhoneNo: "+91" + PhoneNo }],
    });

    let OtpId = uniqid("Otp-");
    const tempUser = new TempUser({
      Name,
      Password,
      PhoneNo: "+91" + PhoneNo,
      EmailId: EmailId.toLowerCase(),
      OtpId,
      OTPExpires: new Date().getTime() + 900 * 1000,
    });

    let result = await tempUser.save();
    let response = await sendOTP(
      "+91" + PhoneNo,
      "",
      "",
      "",
      OtpId,
      900,
      "6",
      process.env.OTPCLIENT,
      process.env.OTPSECRET
    );
    if (response.success || !response.errorMessage) {
      res.status(200).json({
        success: true,
        message: "OTP sent to your Phone Number. Please verify your account.",
      });
    } else {
      throw new Error("Failed to send Otp for verification");
    }
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { EmailId, PhoneNo, OTP } = req.body;
    if (!validator.isEmail(EmailId)) {
      let error = new Error("Please enter a valid email");
      error.status = 400;
      throw error;
    }
    if (!validator.isMobilePhone(PhoneNo, "en-IN")) {
      let error = new Error("Please enter a valid phone number");
      error.status = 400;
      throw error;
    }
    if (!validator.isLength(PhoneNo, { min: 10, max: 10 })) {
      let error = new Error(
        "Please enter a valid phone number without country code"
      );
      error.status = 400;
      throw error;
    }
    if (!validator.isLength(OTP, { min: 4, max: 6 })) {
      let error = new Error("Please enter a valid OTP");
      error.status = 400;
      throw error;
    }
    const tempUser = await TempUser.findOne({
      EmailId: EmailId.toLowerCase(),
      PhoneNo: "+91" + PhoneNo,
    });
    let curtime = new Date().getTime();
    if (!tempUser || tempUser.OTPExpires < curtime) {
      let error = new Error("Invalid or expired OTP");
      error.status = 400;
      throw error;
    } else if (tempUser.Try >= 5) {
      return res.status(400).json({
        success: false,
        message: "You have exceeded the maximum number of attempts.",
        close: true,
      });
    }
    const existingUser = await User.findOne({
      $or: [
        { EmailId: tempUser.EmailId.toLowerCase() },
        { PhoneNo: tempUser.PhoneNo },
      ],
    });

    if (existingUser) {
      let error = new Error(
        "User with given email or phone number already exists"
      );
      error.status = 400;
      throw error;
    }

    const verify = await verifyOTP(
      "",
      tempUser.PhoneNo,
      tempUser.OtpId,
      OTP,
      process.env.OTPCLIENT,
      process.env.OTPSECRET
    );
    if (verify.isOTPVerified && !verify.errorMessage) {
      const user = new User({
        UserId: uniqid("User-"),
        Name: tempUser.Name,
        Password: tempUser.Password,
        PhoneNo: tempUser.PhoneNo,
        EmailId: tempUser.EmailId.toLowerCase(),
        verified: true,
      });

      await user.save();
      let token = await user.genrateauth(user);

      await TempUser.deleteOne({ EmailId: tempUser.EmailId });

      res.status(200).json({
        success: true,
        token,
        validity: new Date(new Date().getTime() + 1209600000),
        message: "Registration Successfull",
        data: {
          Name: user.Name,
          EmailId: user.EmailId,
          PhoneNo: user.PhoneNo,
          City: user.City,
        },
      });
    } else {
      tempUser.Try += 1;
      await tempUser.save();
      let error = new Error("Please enter a valid OTP");
      error.status = 400;
      throw error;
    }
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal Server Error" });
  }
};

// === === === genrate login otp === === === //

exports.genratelotp = async (req, res) => {
  try {
    let { PhoneNo } = req.body;
    let filter = {};
    if (!PhoneNo) {
      const error = new Error("PhoneNo is required");
      error.status = 400;
      throw error;
    }
    if (PhoneNo) {
      if (!validator.isMobilePhone(PhoneNo, "en-IN")) {
        const error = new Error("Invalid Credentials");
        error.status = 400;
        throw error;
      }
      filter.PhoneNo = "+91" + PhoneNo;
    }
    let account = await User.findOne(filter);
    if (!account) {
      const error = new Error("Invalid Credentials");
      error.status = 400;
      throw error;
    }
    await Otp.findOneAndDelete(filter);
    let OtpId = uniqid("Otp-");
    const otp = new Otp({
      UserId: account.UserId,
      PhoneNo: account.PhoneNo,
      OtpId,
      OTPExpires: new Date().getTime() + 900 * 1000,
    });

    let result = await otp.save();
    let response = await sendOTP(
      account.PhoneNo,
      "",
      "",
      "",
      OtpId,
      900,
      "6",
      process.env.OTPCLIENT,
      process.env.OTPSECRET
    );
    if (response.success || !response.errorMessage) {
      res.status(200).json({
        success: true,
        message: "OTP sent to your Phone Number.",
      });
    } else {
      const error = new Error("Unable to send OTP. Please try again later.");
      error.status = 400;
      throw error;
    }
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// === === === verify login otp === === === //

exports.verifyloginOTP = async (req, res) => {
  try {
    const { PhoneNo, OTP } = req.body;
    if (!validator.isMobilePhone(PhoneNo, "en-IN")) {
      let error = new Error("Please enter a valid phone number");
      error.status = 400;
      throw error;
    }
    if (!validator.isLength(PhoneNo, { min: 10, max: 10 })) {
      let error = new Error(
        "Please enter a valid phone number without country code"
      );
      error.status = 400;
      throw error;
    }
    if (!validator.isLength(OTP, { min: 6, max: 6 })) {
      let error = new Error("Please enter a valid OTP");
      error.status = 400;
      throw error;
    }
    let account = await User.findOne({ PhoneNo: "+91" + PhoneNo });
    if (!account) {
      const error = new Error("Invalid Credentials");
      error.status = 400;
      throw error;
    }
    let otp = await Otp.findOne({ PhoneNo: account.PhoneNo });
    if (!otp) {
      const error = new Error("Invalid Credentials");
      error.status = 400;
      throw error;
    }
    let curtime = new Date().getTime();
    if (otp.OTPExpires < curtime) {
      let error = new Error("Invalid or expired OTP");
      error.status = 400;
      throw error;
    } else if (otp.Try >= 5) {
      return res.status(400).json({
        success: false,
        message: "You have exceeded the maximum number of attempts.",
        close: true,
      });
    }
    const verify = await verifyOTP(
      "",
      otp.PhoneNo,
      otp.OtpId,
      OTP,
      process.env.OTPCLIENT,
      process.env.OTPSECRET
    );
    if (verify.isOTPVerified && !verify.errorMessage) {
      let token = await account.genrateauth(account);

      res.status(200).json({
        success: true,
        token,
        validity: new Date(new Date().getTime() + 1209600000),
        message: "Login Successfull",
        data: {
          Name: account.Name,
          EmailId: account.EmailId,
          PhoneNo: account.PhoneNo,
          City: account.City,
          Operator: account.Operator,
          Driver: account.Driver,
          UserId: account.UserId,
          Profile: account.Profile,
        },
      });
    } else {
      otp.Try += 1;
      await otp.save();
      let error = new Error("Please enter a valid OTP");
      error.status = 400;
      throw error;
    }
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ message: error.message || "Internal Server Error" });
  }
};

// === === === authenticate === === === //

exports.authenticate = async (req, res) => {
  try {
    let user = req.user;
    res.status(200).json({
      success: true,
      data: {
        UserId: user.UserId,
        Name: user.Name,
        PhoneNo: user.PhoneNo,
        EmailId: user.EmailId,
        City: user.City,
        Operator: user.Operator,
        Profile: user.Profile,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === store fcm === === === //

exports.storefcm = async (req, res) => {
  try {
    let token = req.token;
    let { fcm } = req.body;
    let user = req.user,
      update = false;
    let tokens = user.tokens.map((itm) => {
      if (itm.token == token && itm.fcm != fcm) {
        update = true;
        return { token: itm.token, expire: itm.expire, fcm };
      }
      return itm;
    });
    if (update) {
      await User.updateOne({ UserId: user.UserId }, { tokens });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === change password === === === //

exports.change_password = async (req, res) => {
  try {
    const user = req.user;
    const { Opassword, newPassword } = req.body;

    if (!Opassword || !newPassword) {
      let error = new Error("All fields are required");
      error.status = 400;
      throw error;
    }

    if (!validator.isLength(Opassword, { min: 8, max: 50 })) {
      let error = new Error("Please enter valid credentials");
      error.status = 400;
      throw error;
    }

    if (!validator.isLength(newPassword, { min: 8, max: 50 })) {
      let error = new Error("Password must be 8 to 50 characters long");
      error.status = 400;
      throw error;
    }

    const isMatch = await Bcrypt.compare(Opassword, user.Password);
    if (!isMatch) {
      let error = new Error("Invalid password");
      error.status = 400;
      throw error;
    }

    const hashedPassword = await Bcrypt.hash(newPassword, 10);
    await User.updateOne({ UserId: user.UserId }, { Password: hashedPassword });

    res
      .status(200)
      .json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === search === === === //
const { LRUCache } = require("lru-cache");
const fs = require("fs");
const cacheFilePath = "./cache/cache.json";
let cache;

try {
  const cachedData = fs.readFileSync(cacheFilePath);
  const parsedCache = JSON.parse(cachedData);
  cache = new LRUCache({ max: 400000 });
  Object.entries(parsedCache).forEach(([key, value]) => {
    cache.set(value[0], value[1].value);
  });
} catch (error) {
  console.error("Error loading cache:", error);
  cache = new LRUCache({ max: 400000 });
}

const getSuggestion = async (query) => {
  try {
    if (!query) {
      throw new Error("Search query is required");
    }
    const cachedResult = cache.get(query.toLowerCase());
    if (cachedResult) {
      return cachedResult;
    }
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        query
      )}&key=${process.env.GOOGLE}&components=country:IN&types=geocode`
    );
    const data = await response.json();

    const predictions = data.predictions.map((prediction) => ({
      description: prediction.description,
      place_id: prediction.place_id,
    }));

    cache.set(query.toLowerCase(), predictions);
    return predictions;
  } catch (error) {
    throw error;
  }
};

exports.search = async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).send({ error: "Search query is required" });
  }

  try {
    let predictions = await getSuggestion(query);
    res.status(200).json(predictions);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ error: "An error occurred while searching for places" });
  }
};

// Save cache to file before process exit
const saveCacheToFile = () => {
  try {
    const dump = cache.dump();
    fs.writeFileSync(cacheFilePath, JSON.stringify(dump));
  } catch (error) {
    console.error("Error saving cache:", error);
  }
};

// Handle process exit event
process.on("exit", saveCacheToFile);

// Handle process termination signals
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, () => {
    saveCacheToFile();
    process.exit();
  });
});

// === === === search city === === === //
const citycacheFilePath = "./cache/citycache.json";
let citycache;

try {
  const cachedData = fs.readFileSync(citycacheFilePath);
  const parsedCache = JSON.parse(cachedData);
  citycache = new LRUCache({ max: 400000 });
  Object.entries(parsedCache).forEach(([key, value]) => {
    citycache.set(value[0], value[1].value);
  });
} catch (error) {
  console.error("Error loading cache:", error);
  citycache = new LRUCache({ max: 400000 });
}

const getCity = async (query) => {
  try {
    if (!query) {
      let error = new Error("Search query is required");
      error.status = 400;
      throw error;
    }
    const cachedResult = citycache.get(query.toLowerCase());
    if (cachedResult) {
      return cachedResult;
    }
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        query
      )}&key=${process.env.GOOGLE}&components=country:IN&types=(cities)`
    );
    const data = await response.json();

    const predictions = data.predictions.map((prediction) => ({
      description: prediction.description,
      place_id: prediction.place_id,
    }));

    citycache.set(query.toLowerCase(), predictions);
    return predictions;
  } catch (error) {
    throw error;
  }
};

exports.citysearch = async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).send({ error: "Search query is required" });
  }
  try {
    let predictions = await getCity(query);
    res.status(200).json(predictions);
  } catch (error) {
    res.status(error.status || 500).send({
      error: error.message || "An error occurred while searching for cities",
    });
  }
};

// Save cache to file before process exit
const savecityCacheToFile = () => {
  try {
    const dump = citycache.dump();
    fs.writeFileSync(citycacheFilePath, JSON.stringify(dump));
  } catch (error) {
    console.error("Error saving cache:", error);
  }
};

// Handle process exit event
process.on("exit", savecityCacheToFile);

// Handle process termination signals
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, () => {
    savecityCacheToFile();
    process.exit();
  });
});

// === === === distance === === === //
const distancecache = "./cache/d_cache.json";

let d_cache;

try {
  const cachedData = fs.readFileSync(distancecache);
  const parsedCache = JSON.parse(cachedData);
  d_cache = new LRUCache({ max: 800000 });
  Object.entries(parsedCache).forEach(([key, value]) => {
    d_cache.set(value[0], value[1].value);
  });
} catch (error) {
  d_cache = new LRUCache({ max: 800000 });
}

const getdistance = async (places) => {
  try {
    if (!places || places.length != 2) {
      let error = new Error("two places are required to calculate distance");
      error.status = 400;
      throw error;
    }
    const cachedResult =
      d_cache.get(`${places[0].place_id}${places[1].place_id}`) ||
      d_cache.get(`${places[1].place_id}${places[0].place_id}`);
    if (cachedResult) {
      return { ...cachedResult, rates: getCurrentRates() };
    }
    const origin = {
      placeId: places[0].place_id,
    };

    const destination = {
      placeId: places[1].place_id,
    };

    const requestBody = {
      origin,
      destination,
      travelMode: "DRIVE",
      languageCode: "en-US",
      units: "IMPERIAL",
    };

    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE,
          "X-Goog-FieldMask":
            "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();
    if (data.error) {
      let error = new Error("failed to fetch distance");
      error.status = 400;
      throw error;
    }
    data.routes[0].polyline = null;
    d_cache.set(`${places[0].place_id}${places[1].place_id}`, data.routes[0]);
    return { ...data.routes[0], rates: getCurrentRates() };
  } catch (error) {
    throw error;
  }
};

exports.distance = async (req, res) => {
  try {
    const { places } = req.body;
    if (!places || places.length != 2) {
      return res.status(400).json({
        error: "two places are required to calculate distance",
      });
    }
    let dis = await getdistance(places);
    res.json(dis);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || "An error occurred while processing the request",
    });
  }
};

// Save cache to file before process exit
const savedCacheToFile = () => {
  try {
    const dump = d_cache.dump();
    fs.writeFileSync(distancecache, JSON.stringify(dump));
  } catch (error) {
    console.error("Error saving cache:", error);
  }
};

// Handle process exit event
process.on("exit", savedCacheToFile);

// Handle process termination signals
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, () => {
    savedCacheToFile();
    process.exit();
  });
});

// === === === Rates === === === //

exports.getRates = async (req, res) => {
  try {
    res.json({ rates: getCurrentRates() });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === logout === === === //

exports.logout = async (req, res) => {
  try {
    const { UserId, tokens } = req.user;
    const token = req.token;
    let updated = tokens.filter((itm) => itm.token != token);
    await User.updateOne({ UserId }, { tokens: updated });
    res.status(200).json({ success: true, message: "Looged out" });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === longitude & latitude === === === //

const llcache = "./cache/ll_cache.json";

let ll_cache;

try {
  const cachedData = fs.readFileSync(llcache);
  const parsedCache = JSON.parse(cachedData);
  ll_cache = new LRUCache({ max: 800000 });
  Object.entries(parsedCache).forEach(([key, value]) => {
    ll_cache.set(value[0], value[1].value);
  });
} catch (error) {
  ll_cache = new LRUCache({ max: 800000 });
}

async function getLatLong(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${process.env.GOOGLE}`;
  try {
    if (!address) {
      let error = new Error("Please provide an address");
      error.status = 400;
      throw error;
    }
    let ccr = ll_cache.get(address);
    if (ccr) {
      return ccr;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      let res = {
        location: {
          type: "Point",
          coordinates: [location.lng, location.lat],
        },
        description: data.results[0].formatted_address,
        place_id: data.results[0].place_id,
      };
      ll_cache.set(res.description, res);
      return res;
    } else {
      let error = new Error("No result found for the provided address.");
      error.status = 400;
      throw error;
    }
  } catch (error) {
    console.error("Error fetching location from Google Maps:", error);
    throw error;
  }
}

const savellCacheToFile = () => {
  try {
    const dump = ll_cache.dump();
    fs.writeFileSync(llcache, JSON.stringify(dump));
  } catch (error) {
    console.error("Error saving cache:", error);
  }
};

// Handle process exit event
process.on("exit", savellCacheToFile);

// Handle process termination signals
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, () => {
    savellCacheToFile();
    process.exit();
  });
});
exports.updatedetails = async (req, res) => {
  try {
    let user = req.user;
    let { fields, files } = await busboyPromise(req);

    if (!fields.City && !files.Profile) {
      let error = new Error("Invalid Request");
      error.status = 400;
      throw error;
    }
    let update = {};
    if (fields.City) {
      fields.City = JSON.parse(fields.City);
      if (!fields.City.place_id) {
        let error = new Error("Please select a city from list");
        error.status = 400;
        throw error;
      }
      let lola = await getLatLong(fields.City.description);
      update = { City: lola };
    }
    if (files.Profile) {
      let folderpath = path.join(__dirname, "../files/user/", user.UserId);
      let filesave;
      try {
        if (user.Profile) {
          await cleanupFiles(folderpath);
        }
        filesave = await saveFilesToFolder(files, folderpath);
      } catch (error) {
        throw error;
      }
      update = { ...update, Profile: filesave.Profile };
    }
    let result = await User.updateOne({ UserId: user.UserId }, update);
    res.status(200).json({
      success: true,
      message: "details updated successfully",
      data: update,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === user image === === === //

exports.UserImage = async (req, res) => {
  try {
    const { UserId } = req.params;
    let user = await User.findOne({ UserId: UserId });
    let filePath = path.join(
      __dirname,
      `../files/user/${UserId}/${user.Profile}`
    );

    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, `../files/NoProfile.png`);
    }
    return res.status(200).sendFile(filePath);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === Register as operator === === === //

const { busboyPromise } = require("../busboy/busboy");
const {
  saveFilesToFolder,
  cleanupFiles,
  copyRecursive,
} = require("../busboy/savefile");
const path = require("path");
const Operator = require("../Database/collection/Operator");

exports.registerOperator = async (req, res) => {
  try {
    const user = req.user;
    if (user.Operator && user.Operator.OperatorId) {
      let error = new Error(`You already have a Operator profile`);
      error.status = 400;
      throw error;
    }
    const { fields, files } = await busboyPromise(req);
    ["AadhaarFront", "AadhaarRear", "Profile"].forEach((itm) => {
      if (!files[itm]) {
        let error = new Error(`Please select a ${itm} image`);
        error.status = 400;
        throw error;
      }
    });
    if (files.length > 3) {
      let error = new Error("Invalid request");
      error.status = 400;
      throw error;
    }
    const requiredFields = [
      {
        key: "Name",
        validator: (value) => validator.isLength(value, { min: 3, max: 20 }),
        message: "Name must be 3 to 20 characters long",
      },
      {
        key: "Dob",
        validator: (value) => !!value,
        message: "Please enter your date of birth",
      },
      {
        key: "AadhaarNumber",
        validator: (value) => validator.isLength(value, { min: 12, max: 12 }),
        message: "Aadhaar number must be exactly 12 digits long",
      },
      {
        key: "EmergencyNumber",
        validator: (value) => validator.isMobilePhone(value, "en-IN"),
        message: "Please enter a valid Indian mobile number",
      },
    ];
    requiredFields.forEach(({ key, validator, message }) => {
      if (!fields[key]) {
        let error = new Error(`Please enter your ${key}`);
        error.status = 400;
        return error;
      }
      if (validator && !validator(fields[key])) {
        let error = new Error(`${message}`);
        error.status = 400;
        throw error;
      }
    });
    const dobPattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    if (!dobPattern.test(fields.Dob)) {
      let error = new Error("Dob must be in format DD/MM/YYYY.");
      error.status = 400;
      throw error;
    }

    const [day, month, year] = fields.Dob.split("/").map(Number);
    const dob = new Date(year, month - 1, day);

    const age = new Date().getFullYear() - dob.getFullYear();
    const monthDifference = new Date().getMonth() - dob.getMonth();
    const dayDifference = new Date().getDate() - dob.getDate();

    if (
      age < 18 ||
      (age === 18 &&
        (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)))
    ) {
      let error = new Error("User must be at least 18 years old.");
      error.status = 400;
      throw error;
    }

    if (user.PhoneNo === `+91${fields.EmergencyNumber}`) {
      let error = new Error(
        "Please provide a different emergency contact number"
      );
      error.status = 400;
      throw error;
    }

    if (!fields.City) {
      let error = new Error("Please Select a City");
      error.status = 400;
      throw error;
    }
    fields.City = JSON.parse(fields.City);
    if (!fields.City.place_id || !fields.City.description) {
      let error = new Error("Please Select a City");
      error.status = 400;
      throw error;
    }
    fields.City = await getLatLong(fields.City.description);
    const id = "Operator-" + user.UserId.slice(5, user.UserId.length);
    let folderPath = path.join(__dirname, "../files/operator", id);
    let filesave;

    try {
      filesave = await saveFilesToFolder(files, folderPath);
    } catch (error) {
      await cleanupFiles(folderPath);
      throw error;
    }
    const operator = new Operator({
      OperatorId: id,
      Name: fields.Name,
      City: user.City,
      Dob: dob,
      AadhaarCard: {
        Number: fields.AadhaarNumber,
        FrontImage: filesave.AadhaarFront,
        BackImage: filesave.AadhaarRear,
      },
      EmergencyNumber: fields.EmergencyNumber,
      Profile: filesave.Profile,
      City: fields.City,
    });
    try {
      const result = await operator.save();
      const update = await User.updateOne(
        { UserId: user.UserId },
        {
          Operator: {
            OperatorId: id,
            Status: "pending",
            verified: false,
          },
        }
      );
      res.status(201).json({
        success: true,
        message: "Operator profile successfully created.",
        Operator: {
          OperatorId: id,
          Status: "pending",
          verified: false,
        },
      });
    } catch (error) {
      await cleanupFiles(folderPath);
      throw error;
    }
  } catch (error) {
    res.status(res.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === get Operator Profile === === === //

exports.OperatorProfile = async (req, res) => {
  try {
    const user = req.user;
    const id = "Operator-" + user.UserId.slice(5, user.UserId.length);
    let operator = await Operator.findOne({ OperatorId: id });
    if (operator) {
      res.status(200).json({ success: true, data: operator });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid request no operator profile found",
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === Operator Image === === === //

exports.OperatorImage = async (req, res) => {
  try {
    const { OperatorId } = req.params;
    let operator = await Operator.findOne({ OperatorId: OperatorId });
    let filePath = path.join(
      __dirname,
      `../files/operator/${OperatorId}/${operator.Profile}`
    );

    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, `../files/NoProfile.png`);
    }
    return res.status(200).sendFile(filePath);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === Search for Driver === === === //

exports.SearchDriver = async (req, res) => {
  try {
    let user = req.user;
    if (!user.Operator || !user.Operator.verified) {
      return res
        .status(401)
        .json({ success: false, message: "unauthorized access" });
    }
    let { EmailId, PhoneNo } = req.body;
    if (!EmailId || !PhoneNo) {
      let error = new Error("Please Enter Both EmailId and PhoneNo");
      error.status = 400;
      throw error;
    }
    if (!validator.isEmail(EmailId)) {
      let error = new Error("Please enter a valid EmailId");
      error.status = 400;
      throw error;
    }
    if (
      !validator.isMobilePhone(PhoneNo, "en-IN") ||
      !validator.isLength(PhoneNo, { min: 10, max: 10 })
    ) {
      let error = new Error("Please enter a valid 10 digit PhoneNo");
      error.status = 400;
      throw error;
    }
    const driver = await User.findOne({
      EmailId: EmailId.toLowerCase(),
      PhoneNo: "+91" + PhoneNo,
    });
    if (driver) {
      res.status(200).json({
        success: true,
        message: "Found a profile",
        data: { Name: driver.Name, UserId: driver.UserId },
      });
    } else {
      let error = new Error("No Profile Found");
      error.status = 400;
      throw error;
    }
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === Register a Driver === === === //

const isValidFutureDate = (dateString) => {
  const datePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  if (!datePattern.test(dateString)) {
    throw new Error("Date must be in format DD/MM/YYYY.");
  }

  const [day, month, year] = dateString.split("/").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getDate() !== day ||
    date.getMonth() !== month - 1 ||
    date.getFullYear() !== year
  ) {
    throw new Error("Invalid date.");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date < today) {
    throw new Error("DL is Expired");
  }

  return true;
};

exports.RegisterDriver = async (req, res) => {
  try {
    const user = req.user;
    if (!user.Operator || !user.Operator.verified) {
      return res
        .status(401)
        .json({ success: false, message: "unauthorized access" });
    }
    const { fields, files } = await busboyPromise(req);
    let {
      Name,
      Dob,
      AadhaarNumber,
      DLNumber,
      DLValidity,
      PhoneNo,
      EmailId,
      IsDriver,
    } = fields;
    if (IsDriver === undefined) {
      let error = new Error("IsDriver field in required");
      error.status = 400;
      throw error;
    }
    const throwValidationError = (message) => {
      let error = new Error(message);
      error.status = 400;
      throw error;
    };

    if (IsDriver === "true") {
      if (files.length > 2) {
        throwValidationError("Invalid request");
      }
      if (!DLNumber) {
        throwValidationError("DLNumber is required");
      }
      if (!DLValidity) {
        throwValidationError("DLValidity is required");
      }
    } else if (IsDriver === "false") {
      const requiredFields = [
        "Name",
        "Dob",
        "AadhaarNumber",
        "DLNumber",
        "DLValidity",
        "PhoneNo",
        "EmailId",
      ];

      for (const field of requiredFields) {
        if (!fields[field]) {
          throwValidationError(`${field} is required`);
        }
      }

      if (!validator.isLength(Name, { min: 3, max: 50 })) {
        throwValidationError("Name must be between 1 and 50 characters");
      }
      if (!validator.isLength(AadhaarNumber, { min: 12, max: 12 })) {
        throwValidationError("AadhaarNumber must be a 12-digit number");
      }
      if (!validator.isMobilePhone(PhoneNo, "en-IN")) {
        throwValidationError("PhoneNo must be a 10-digit number");
      }
      if (!validator.isEmail(EmailId)) {
        throwValidationError("Invalid email format for EmailId");
      }
      const dobPattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
      if (!dobPattern.test(Dob)) {
        throw new Error("Dob must be in format DD/MM/YYYY.");
      }

      const [day, month, year] = Dob.split("/").map(Number);
      const dob = new Date(year, month - 1, day);

      const age = new Date().getFullYear() - dob.getFullYear();
      const monthDifference = new Date().getMonth() - dob.getMonth();
      const dayDifference = new Date().getDate() - dob.getDate();

      if (
        age < 18 ||
        (age === 18 &&
          (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)))
      ) {
        throw new Error("User must be at least 18 years old.");
      }
      ["AadhaarFront", "AadhaarRear", "Profile"].forEach((itm) => {
        if (!files[itm]) {
          throw new Error(`Please select a ${itm} image`);
        }
      });
      if (files.length > 5) {
        throwValidationError("Invalid request");
      }
    } else {
      throwValidationError("Invalid value for IsDriver");
    }
    if (!DLNumber) {
      throwValidationError("Please enter a DL Number");
    }
    const dlNumberRegex = /^[A-Z]{2}[0-9]{2} ?[0-9]{11}$/;
    if (!dlNumberRegex.test(DLNumber)) {
      throwValidationError("Please enter a valid DL Number");
    }
    isValidFutureDate(DLValidity);
    ["DLFront", "DLRear"].forEach((itm) => {
      if (!files[itm]) {
        let error = new Error(`Please select a ${itm} image`);
        error.status = 400;
        throw error;
      }
    });
    let filter;
    let profile;
    if (IsDriver === "true") {
      filter = { UserId: user.UserId, Status: { $ne: "unlinked" } };
      profile = await Operator.findOne({
        OperatorId: user.Operator.OperatorId,
      });
      if (!profile) {
        throwValidationError("No Profile found");
      }
    } else {
      profile = await User.findOne({
        EmailId: EmailId.toLowerCase(),
        PhoneNo: "+91" + PhoneNo,
      });
      if (!profile) {
        throwValidationError("No Profile found");
      }
      filter = { UserId: profile.UserId, Status: { $ne: "unlinked" } };
    }
    let exist = await Driver.findOne(filter);
    if (exist) {
      throwValidationError("Profile is already linked as driver");
    }
    let id = uniqid("Driver-");
    let folder = path.join(__dirname, "../files/driver/", id);
    if (IsDriver === "true") {
      try {
        copyRecursive(
          path.join(__dirname, "../files/operator/", user.Operator.OperatorId),
          folder
        );
      } catch (error) {
        await cleanupFiles(folder);
        throw error;
      }
    }
    let filesave;
    try {
      filesave = await saveFilesToFolder(files, folder);
    } catch (error) {
      await cleanupFiles(folder);
      throw error;
    }
    IsDriver = IsDriver === "true";
    const newDriver = new Driver({
      DriverId: id,
      UserId: filter.UserId,
      OperatorId: user.Operator.OperatorId,
      Name: IsDriver ? profile.Name : Name,
      Dob: IsDriver ? profile.Dob : Dob,
      PhoneNo: IsDriver ? user.PhoneNo : "+91" + PhoneNo,
      Profile: IsDriver ? profile.Profile : filesave.Profile,
      AadhaarCard: {
        Number: IsDriver ? profile.AadhaarCard.Number : AadhaarNumber,
        FrontImage: IsDriver
          ? profile.AadhaarCard.FrontImage
          : filesave.AadhaarFront,
        BackImage: IsDriver
          ? profile.AadhaarCard.BackImage
          : filesave.AadhaarRear,
      },
      DrivingLicence: {
        Number: DLNumber,
        Expiry: DLValidity,
        FrontImage: filesave.DLFront,
        BackImage: filesave.DLRear,
      },
    });
    try {
      let result = await newDriver.save();
      res.status(201).json({
        success: true,
        message: "Driver Registration in progress",
      });
    } catch (error) {
      await cleanupFiles(folder);
      throw error;
    }
    if (IsDriver == "true") {
      return;
    }
    try {
      profile.tokens.for((itm) => {
        if (itm.fcm && itm.expire > new Date().getTime()) {
          try {
            sendNotification(itm.fcm, {
              title: "Driver Request",
              body: `${user.Name.split(" ")[0]} want's to add you as driver`,
            });
          } catch (error) {}
        }
      });
    } catch (error) {}
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === reject driver request === === === //

exports.rejectdriverrequest = async (req, res) => {
  try {
    let user = req.user;
    let profile = await Driver.findOne({
      UserId: user.UserId,
      Status: { $in: ["approved", "pending"] },
    });
    await Driver.deleteOne({ DriverId: profile.DriverId });
    res.status(200).json({ success: true, message: "request rejected" });
    let oup = await User.findOne({
      UserId: "User-" + profile.OperatorId.split("-")[1],
    });
    oup.tokens.forEach((itm) => {
      if (itm.fcm && itm.expire > new Date().getTime()) {
        try {
          sendNotification(itm.fcm, {
            title: "Request Rejected",
            body: `${
              user.Name.split(" ")[0]
            } has rejected the request to be your driver`,
          });
        } catch (error) {}
      }
    });
    let folder = path.join(__dirname, "../files/driver/", profile.DriverId);
    try {
      await cleanupFiles(folder);
    } catch (error) {}
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === Activation status === === === //

exports.getActivation = async (req, res) => {
  try {
    const user = req.user;
    if (!user.Operator || !user.Operator.verified) {
      return res
        .status(401)
        .json({ success: false, message: "unauthorized access" });
    }
    const driver = await Driver.findOne({
      OperatorId: user.Operator.OperatorId,
      Status: { $ne: "unlinked" },
    });
    const cab = await Cab.findOne({
      OperatorId: user.Operator.OperatorId,
      Status: { $ne: "unlinked" },
    });
    res.status(200).json({
      success: true,
      data: { driver: driver ? driver.Status : "", cab: cab ? cab.Status : "" },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
// === === === Activate === === === //

exports.Activate = async (req, res) => {
  try {
    const user = req.user;

    if (
      !user.Operator ||
      !user.Operator.verified ||
      user.Operator.Status !== "verified"
    ) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized access" });
    }

    const [driver, cab] = await Promise.all([
      Driver.findOne({
        OperatorId: user.Operator.OperatorId,
        Status: "verified",
      }),
      Cab.findOne({ OperatorId: user.Operator.OperatorId, Status: "verified" }),
    ]);

    if (!driver || !cab) {
      let error = new Error(
        !driver && !cab
          ? "Please add a cab and driver"
          : !cab
          ? "Please add a cab"
          : "Please add a driver"
      );
      error.status = 400;
      throw error;
    }

    await Operator.updateOne(
      { OperatorId: user.Operator.OperatorId },
      { Status: "active" }
    );

    await User.updateOne(
      { UserId: user.UserId },
      {
        $set: {
          "Operator.Status": "active",
          "Operator.verified": true,
        },
      }
    );
    await initializeWallet(user.Operator.OperatorId);
    res
      .status(201)
      .json({ success: true, message: "Profile activation was successful" });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === Register a Cab === === === //

const Cab = require("../Database/collection/Cab");
const Booking = require("../Database/collection/Booking");
const Wallet = require("../Database/collection/Wallet");
const { error } = require("console");
const { sendNotification } = require("./fcm");
const { title } = require("process");

exports.RegisterCab = async (req, res) => {
  try {
    const user = req.user;
    if (!user.Operator || !user.Operator.verified) {
      return res
        .status(401)
        .json({ success: false, message: "unauthorized access" });
    }
    const { fields, files } = await busboyPromise(req);
    let { Model, CabNumber } = fields;
    ["Photo", "Permit", "Authorization", "RegistrationCertificate"].forEach(
      (itm) => {
        if (!files[itm]) {
          let error = new Error(
            `Please select a ${itm === "Photo" ? "Cab" : itm} image`
          );
          error.status = 400;
          throw error;
        }
      }
    );
    if (Model == undefined || CabNumber == undefined) {
      let error = new Error(`All fields are required`);
      error.status = 400;
      throw error;
    }
    if (!validator.isLength(CabNumber, { max: 14, min: 9 })) {
      let error = new Error("please enter a valid Cab Number");
      error.status = 400;
      throw error;
    }
    Model = JSON.parse(Model);
    ["name", "manufacturer", "segment"].forEach((itm) => {
      if (!Model[itm]) {
        let error = new Error(`${itm} of cab is required`);
        error.status = 400;
        throw error;
      }
    });
    const exist = await Cab.findOne({ CabNumber, status: { $ne: "unlinked" } });
    if (exist) {
      let error = new Error("Cab Aleready linked with other operator");
      error.status = 400;
      throw error;
    }
    let id = uniqid("Cab-");
    let folderpath = await path.join(__dirname, "../files/cab/", id);
    let filesave;
    try {
      filesave = await saveFilesToFolder(files, folderpath);
    } catch (error) {
      await cleanupFiles(folderpath);
      throw error;
    }
    const newcab = new Cab({
      CabNumber,
      CabId: id,
      Manufacturer: Model.manufacturer,
      Model: Model.name,
      Category: Model.segment,
      Photo: filesave.Photo,
      Document: {
        Authorization: filesave.Authorization,
        Permit: filesave.Permit,
        RegistrationCertificate: filesave.RegistrationCertificate,
      },
      OperatorId: user.Operator.OperatorId,
    });
    try {
      let result = await newcab.save();
      res.status(201).json({
        success: true,
        message: "Cab Registration in progress",
      });
    } catch (error) {
      await cleanupFiles(folderpath);
      throw error;
    }
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === book outstation === === === //

exports.bookcab = async (req, res) => {
  try {
    const user = req.user;
    let {
      From,
      To,
      Dat,
      Time,
      Category,
      TripType,
      Offer,
      Hour,
      Km,
      Operator,
      returndate,
    } = req.body;
    [
      "From",
      "Dat",
      "Time",
      "Category",
      "TripType",
      "Offer",
      "Operator",
    ].forEach((itm) => {
      if (!req.body[itm]) {
        let error = new Error("Invalid Request all fields are required 1");
        error.status = 400;
        throw error;
      }
    });
    if (!["Yes", "No"].includes(Operator)) {
      let error = new Error("Invalid input");
      error.status = 400;
      throw error;
    }
    if (Operator == "Yes") {
      if (
        !user.Operator ||
        !user.Operator.verified ||
        user.Operator.Status !== "active"
      ) {
        throw new Error("Unauthorized access: you are not a operator");
      }
    }
    if (!["Roundtrip", "Oneway", "Rental"].some((itm) => itm == TripType)) {
      let error = new Error("Invalid input");
      error.status = 400;
      throw error;
    }

    if (!["Micro", "Sedan", "MUV", "SUV"].some((itm) => itm == Category)) {
      let error = new Error("Invalid input");
      error.status = 400;
      throw error;
    }

    if (TripType != "Rental" && !To) {
      let error = new Error("Invalid Request all fields are required");
      error.status = 400;
      throw error;
    }
    [From, To].forEach((itm) => {
      if (itm) {
        if (
          ["description", "place_id", "query"].some((subitm) => !itm[subitm])
        ) {
          let error = new Error("Invalid input");
          error.status = 400;
          throw error;
        }
      }
    });
    if (TripType !== "Rental") {
      let suggest = await getSuggestion(From.query);
      From = suggest.filter((itm) => itm.place_id == From.place_id)[0];
      if (!From) {
        let error = new Error("Please select a location from list");
        error.status = 400;
        throw error;
      }
      suggest = await getSuggestion(To.query);
      To = suggest.filter((itm) => itm.place_id == To.place_id)[0];
      if (!To) {
        let error = new Error("Please select a location from list");
        error.status = 400;
        throw error;
      }
    } else {
      let suggest = await getCity(From.query);
      From = suggest.filter((itm) => itm.place_id == From.place_id)[0];
      if (!From) {
        let error = new Error("Please select a City from list");
        error.status = 400;
        throw error;
      }
    }
    let t_d = new Date(Time);
    let thf = new Date(new Date().getTime() + 1.75 * 3600 * 1000);
    let d_t = new Date(Dat);
    d_t.setHours(t_d.getHours());
    d_t.setMinutes(t_d.getMinutes());
    if (thf > d_t) {
      let error = new Error(
        "Select a date and time at least 2 hours in the future."
      );
      error.status = 400;
      throw error;
    }
    if (TripType == "Roundtrip") {
      if (returndate < Dat) {
        let error = new Error(
          "The return date must be the same as or later than the pickup date."
        );
        error.status = 400;
        throw error;
      }
    }
    Dat = d_t;
    if (TripType !== "Rental") {
      From = await getLatLong(From.description);
      To = await getLatLong(To.description);
      let result = await getdistance([From, To]);
      const rates = result.rates[Category];
      const distanceKm = result.distanceMeters / 1000;
      const hour = parseInt(result.duration.replace("s", ""), 10);
      if (TripType === "Roundtrip") {
        Km = Math.ceil(distanceKm * 2);
        Hour = Math.ceil((hour / 3600) * 2);
      } else {
        Km = Math.ceil(distanceKm);
        Hour = Math.ceil(hour / 3600);
      }
      let baseFare = Math.ceil(distanceKm * rates[TripType] * 0.84);

      if (TripType === "Roundtrip") {
        baseFare *= 2;
      }
      if (Offer < baseFare) {
        let error = new Error(`Minimum fare is ₹ ${baseFare}`);
        error.status = 400;
        throw error;
      }
    } else {
      From = await getLatLong(From.description);
      if (Hour > 12 || Km > 200) {
        let error = new Error("Invalid Input");
        error.status = 400;
        throw error;
      }
      if (Km / 10 < Hour) {
        let error = new Error("Invalid Input");
        error.status = 400;
        throw error;
      }
      const result = getCurrentRates();
      const rates = result[Category];

      if (!rates || !rates["Roundtrip"]) {
        let error = new Error("Invalid carType or tripType");
        error.status = 400;
        throw error;
      }

      let baseFare = Math.ceil(
        (Km * rates["Roundtrip"] + Hour * rates["Waitingcharges"]) * 0.94
      );
      if (Offer < baseFare) {
        let error = new Error(`Minimum fare is ₹ ${baseFare}`);
        error.status = 400;
        throw error;
      }
    }

    let booking = {
      BookingId: uniqid("booking-"),
      Name: user.Name,
      PhoneNo: user.PhoneNo,
      From,
      Category,
      Date: Dat,
      TripType,
      Offer,
      Km,
      Hour,
      UserId: user.UserId,
      PublishOn: new Date().getTime(),
      Operator: Operator == "Yes",
    };
    if (TripType !== "Rental") {
      booking = { ...booking, To };
    }
    if (TripType == "Roundtrip") {
      booking = { ...booking, ReturnDate: new Date(returndate) };
    }
    booking = new Booking(booking);
    const result = await booking.save();
    return res.status(201).json({
      success: true,
      message: "You'll start receiving offers from drivers shortly.",
      data: booking.BookingId,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getDuty = async (req, res) => {
  try {
    let user = req.user;
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
          let error = new Error("Invalid input");
          error.status = 400;
          throw error;
        }
      }
    });

    From = await getLatLong(From.description);
    if (To) {
      To = await getLatLong(To.description);
    }

    const fromLocation = From ? From.location : null;
    const toLocation = To ? To.location : null;

    if (!fromLocation && !toLocation) {
      return res.status(400).json({
        success: false,
        message: "Either from or to location must be provided",
      });
    }

    const currentDate = new Date();

    const locationQuery = {
      $or: [
        fromLocation && toLocation
          ? {
              $and: [
                {
                  "From.location": {
                    $geoWithin: {
                      $centerSphere: [fromLocation.coordinates, 50 / 6371], // 50 km radius
                    },
                  },
                },
                {
                  "To.location": {
                    $geoWithin: {
                      $centerSphere: [toLocation.coordinates, 50 / 6371], // 50 km radius
                    },
                  },
                },
              ],
            }
          : {
              "From.location": {
                $geoWithin: {
                  $centerSphere: [fromLocation.coordinates, 50 / 6371], // 50 km radius
                },
              },
            },
      ],
    };

    const dateQuery = date
      ? {
          Date: {
            $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
            $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
          },
        }
      : {};

    const query = {
      Status: "pending",
      Date: {
        $gte: new Date(currentDate.getTime() - 2 * 60 * 60 * 1000),
        ...(date ? dateQuery.Date : {}),
      },
      ...locationQuery,
    };

    const bookings = await Booking.find(query, { PhoneNo: 0 });
    const update = await Operator.updateOne(
      { OperatorId: user.Operator.OperatorId },
      To ? { From, To } : { From }
    );
    res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.mydriver = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.Operator || !user.Operator.verified) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access: Operator verification required",
      });
    }

    const drivers = await Driver.find({ OperatorId: user.Operator.OperatorId });

    return res.status(200).json({
      success: true,
      data: drivers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error: Unable to fetch drivers",
      error: error.message,
    });
  }
};

exports.myCabs = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.Operator || !user.Operator.verified) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access: Operator verification required",
      });
    }

    const drivers = await Cab.find({ OperatorId: user.Operator.OperatorId });

    return res.status(200).json({
      success: true,
      data: drivers,
    });
  } catch (error) {
    console.error("Error fetching Cabs:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error: Unable to fetch cabs",
      error: error.message,
    });
  }
};

// === === === Cab Image === === === //

exports.CabImage = async (req, res) => {
  try {
    let { CabId, Image } = req.params;
    if (!CabId && !Image) {
      return res.status(404).send("Not found");
    }
    if (!Image || Image.toLowerCase() == "image") {
      let cab = await Cab.findOne({ CabId });
      if (!cab) {
        return res.status(404).send("Not found");
      }
      Image = cab.Photo;
    }
    let filePath = path.join(__dirname, `../files/cab/${CabId}/${Image}`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Not found");
    }
    return res.status(200).sendFile(filePath);
  } catch (error) {
    res.status(404).send("Not found");
  }
};

// === === === Driver Image === === === //

exports.DriverImage = async (req, res) => {
  try {
    let { DriverId, Image } = req.params;
    if (!DriverId && !Image) {
      return res.status(404).send("Not found");
    }
    if (!Image || Image.toLowerCase() == "image") {
      let driver = await Driver.findOne({ DriverId });
      if (!driver) {
        return res.status(404).send("Not found");
      }
      Image = driver.Profile;
    }
    let filePath = path.join(__dirname, `../files/driver/${DriverId}/${Image}`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Not found");
    }
    return res.status(200).sendFile(filePath);
  } catch (error) {
    res.status(404).send("Not found");
  }
};

// === === === get Active cab and driver === === === //

exports.getactivecd = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.Operator || !user.Operator.verified) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access: Operator verification required",
      });
    }
    const cabs = await Cab.find(
      {
        OperatorId: user.Operator.OperatorId,
        Status: "verified",
      },
      { CabNumber: 1, CabId: 1, Category: 1 }
    );
    const drivers = await Driver.find(
      {
        OperatorId: user.Operator.OperatorId,
        Status: "verified",
      },
      { DriverId: 1, Name: 1 }
    );
    return res.status(200).json({
      success: true,
      data: { drivers, cabs },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === post offer === === === //

exports.postOffer = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.Operator || !user.Operator.verified) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access: Operator verification required.",
      });
    }

    const { BookingId, CabId, DriverId, Offer, remove } = req.body;
    if (!BookingId) {
      let error = new Error(
        "Please provide a valid offer with cab and driver details."
      );
      error.status = 400;
      throw error;
    }
    if (!remove) {
      if (!CabId || !DriverId || !Offer) {
        let error = new Error(
          "Please provide a valid offer with cab and driver details."
        );
        error.status = 400;
        throw error;
      }
    }
    let cab, driver, booking;
    booking = await Booking.findOne(
      { BookingId, Status: "pending" },
      { PhoneNo: 0 }
    );
    if (!booking) {
      let error = new Error("Booking is either accepted or canceled.");
      error.status = 400;
      throw error;
    }
    if (booking.UserId == user.UserId) {
      let error = new Error("you can't bid on your own request");
      error.status = 400;
      throw error;
    }
    if (!remove) {
      cab = await Cab.findOne({
        CabId,
        OperatorId: user.Operator.OperatorId,
        Status: "verified",
      });
      if (!cab) {
        let error = new Error("Invalid request: Cab not found.");
        error.status = 400;
        throw error;
      }

      driver = await Driver.findOne({
        DriverId,
        OperatorId: user.Operator.OperatorId,
        Status: "verified",
      });
      if (!driver) {
        let error = new Error("Invalid request: Driver not found.");
        error.status = 400;
        throw error;
      }

      let prev = booking.Bids.find(
        (itm) => itm.OperatorId == user.Operator.OperatorId
      );

      if (
        prev &&
        prev.CabId == cab.CabId &&
        prev.DriverId == driver.DriverId &&
        prev.Offer == Offer
      ) {
        let error = new Error("You cannot submit the same offer again.");
        error.status = 400;
        throw error;
      }
      let wallet = await Wallet.findOne({
        OperatorId: user.Operator.OperatorId,
      });
      if (wallet.Balance < process.env.BIDFEE) {
        return res.status(200).json({
          success: false,
          message:
            wallet.Balance >= 0
              ? "Unable to post bid. Please Recharge your wallet"
              : "Unable to post bid. Please pay your dues",
          wallet: true,
        });
      }
    }
    booking.Bids = booking.Bids.filter(
      (itm) => itm.OperatorId != user.Operator.OperatorId
    );
    if (!remove) {
      booking.Bids = [
        {
          OperatorId: user.Operator.OperatorId,
          DriverId,
          CabId,
          Offer,
          Model: cab.Model,
          Name: driver.Name,
          Manufacturer: cab.Manufacturer,
        },
        ...booking.Bids,
      ];
    }
    await booking.save();
    if (!remove) {
      let { tokens } = await User.findOne(
        { UserId: booking.UserId },
        { tokens: 1 }
      );
      tokens.forEach((itm) => {
        try {
          sendNotification(itm.fcm, {
            title: "New Offer",
            body: `${driver.Name} is offering ₹${Offer} for your ${booking.TripType} request`,
          });
        } catch (error) {}
      });
    }
    res.status(200).json({
      success: true,
      message: remove
        ? "Offer removed successfully"
        : "Offer successfully posted.",
      data: booking,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error.",
    });
  }
};

// === === === get requests === === === //

exports.getrequests = async (req, res) => {
  try {
    let user = req.user;
    let bookings = await Booking.find(
      {
        UserId: user.UserId,
        Status: "pending",
      },
      { PhoneNo: 0 }
    );
    return res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error.",
    });
  }
};

// === === === cancel request === === === //
exports.cancelRequest = async (req, res) => {
  try {
    const user = req.user;
    const { BookingId } = req.body;

    if (!BookingId) {
      return res.status(400).json({
        success: false,
        message: "BookingId is required.",
      });
    }

    let booking = await Booking.findOne({
      BookingId,
      Status: "pending",
      UserId: user.UserId,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or already cancelled.",
      });
    }

    booking.Status = "cancelled";
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Booking request cancelled successfully.",
    });
  } catch (error) {
    console.error("Error cancelling booking request:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error.",
    });
  }
};

// === === === Operator Wallet === === === //

exports.getWallet = async (req, res) => {
  try {
    let user = req.user;
    if (
      !user ||
      !user.Operator ||
      !user.Operator.verified ||
      ["pending", "verified"].includes(user.Operator.Status)
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access: Operator verification required.",
      });
    }
    let wallet = await Wallet.findOne({ OperatorId: user.Operator.OperatorId });
    if (!wallet) {
      let error = new Error("No Wallet found");
      error.status = 400;
      throw error;
    }
    res.status(200).json({ success: true, data: wallet });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error.",
    });
  }
};

// === === === create topup order === === === //

exports.createOrder = async (req, res) => {
  try {
    const user = req.user;
    if (
      !user ||
      !user.Operator ||
      !user.Operator.verified ||
      ["pending", "verified"].includes(user.Operator.Status)
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access: Operator verification required.",
      });
    }

    const { amount } = req.body;

    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 2000
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid amount. Amount must be an integer between 100 and 2000.",
      });
    }
    let order = await initate_topup(user.Operator.OperatorId, amount);
    if (!order) {
      let error = new Error("Order creation failed");
      error.status = 400;
      throw error;
    }
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error.",
    });
  }
};

// === === === verify payment === === === //

exports.verifypayment = async (req, res) => {
  try {
    let user = req.user;
    let {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      operatorId,
    } = req.body;
    let verify = await verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      operatorId
    );
    if (verify.success) {
      user.tokens.forEach((itm) => {
        try {
          sendNotification(itm.fcm, {
            title: `hi ${user.Name.split(" ")[0]}`,
            body: `Your operator wallet has been successfully topped up with ₹${verify.amount}`,
          });
        } catch (error) {}
      });
    }
    res.status(200).json(verify);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
// === === === payment failed === === === //
exports.failedpayment = async (req, res) => {
  try {
    let { orderId, operatorId } = req.body;
    let failed = await paymentDismiss(operatorId, orderId);
    res.status(200).json(failed);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === accept offer === === === //
exports.acceptOffer = async (req, res) => {
  try {
    const { BookingId, OperatorId } = req.body;
    const user = req.user;
    if (!BookingId || !OperatorId) {
      let error = new Error("Invalid request");
      error.status = 400;
      throw error;
    }
    let booking = await Booking.findOne({
      BookingId,
      UserId: user.UserId,
      Status: "pending",
    });
    if (!booking) {
      let error = new error("Invalid request");
      error.status = 400;
      throw error;
    }
    let bid = await booking.Bids.find((itm) => itm.OperatorId === OperatorId);
    if (!bid) {
      let error = new Error("can't find the offer");
      error.status = 400;
      throw error;
    }
    let driver = await Driver.findOne({
      OperatorId,
      DriverId: bid.DriverId,
      Status: { $ne: "unlinked" },
    });
    if (!driver) {
      let error = new Error("can't find the specified driver");
      error.status = 400;
      throw error;
    }
    let cab = await Cab.findOne({
      OperatorId,
      CabId: bid.CabId,
      Status: { $ne: "unlinked" },
    });
    if (!cab) {
      let error = new Error("can't find the specified cab");
      error.status = 400;
      throw error;
    }
    let update = {
      Status: "confirmed",
      AcceptedBid: {
        OperatorId,
        Offer: bid.Offer,
        CabId: bid.CabId,
        DriverId: bid.DriverId,
      },
      CabDetails: {
        CabId: cab.CabId,
        Number: cab.CabNumber,
        Model: cab.Model,
      },
      DriverDetails: {
        DriverId: driver.DriverId,
        Name: driver.Name,
        PhoneNo: driver.PhoneNo,
      },
    };
    if (!booking.Operator) {
      update = { ...update, Fee: process.env.BIDFEE };
      if (process.env.BIDFEE > 0) {
        let deduction = await deductfee(
          OperatorId,
          process.env.BIDFEE,
          booking.BookingId
        );
        if (!deduction.result) {
          let error = new Error("Can't accept this offer");
          error.status = 400;
          throw error;
        }
      }
    } else {
      if (!booking.OPF.deducted) {
        update = {
          ...update,
          OPF: {
            deducted: true,
            amount: process.env.OPFEE,
          },
        };
        if (process.env.OPFEE > 0) {
          let deduction = await deductfee(
            user.Operator.OperatorId,
            process.env.OPFEE,
            booking.BookingId
          );
          if (!deduction.result) {
            let error = new Error("Please recharge your operator wallet");
            error.status = 400;
            throw error;
          }
        }
      }
    }
    let result = await Booking.updateOne({ BookingId: BookingId }, update);
    res.status(200).json({
      success: true,
      message: "Offer accepted successfully",
    });
    try {
      let oup = await User.findOne({
        UserId: "User-" + OperatorId.split("-")[1],
      });
      oup.tokens.forEach((itm) => {
        if (itm.fcm && itm.expire > new Date().getTime()) {
          try {
            sendNotification(itm.fcm, {
              title: "New Booking",
              body: `${user.Name.split(" ")[0]} has accepted your offer of ₹${
                bid.Offer
              }`,
            });
          } catch (error) {}
        }
      });
      if (oup.Driver.DriverId != driver.DriverId) {
        oup = await User.findOne({ UserId: driver.UserId });
        oup.tokens.forEach((itm) => {
          if (itm.fcm && itm.expire > new Date().getTime()) {
            try {
              sendNotification(itm.fcm, {
                title: "New Booking",
                body: `You have a new Booking on ${booking.Date.toLocaleDateString(
                  "en-IN"
                )}`,
              });
            } catch (error) {}
          }
        });
      }
    } catch (error) {
      console.log(error);
    }
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
// === === === reject offer === === === //

exports.rejectOffer = async (req, res) => {
  try {
    const { UserId } = req.user;
    const { BookingId, OperatorId } = req.body;

    if (!BookingId || !OperatorId) {
      let error = new Error("Invalid request: Missing BookingId or OperatorId");
      error.status = 400;
      throw error;
    }

    const booking = await Booking.findOne({
      BookingId,
      UserId,
      Status: "pending",
    });
    if (!booking) {
      let error = new Error("Invalid request: Booking not found");
      error.status = 404;
      throw error;
    }
    let update = false;
    const updatedBids = booking.Bids.map((bid) => {
      if (bid.OperatorId == OperatorId) {
        update = true;
        return { ...bid, rejected: true };
      }
      return bid;
    });
    if (!update) {
      let error = new Error("Invalid request: No Offer found");
      error.status = 400;
      throw error;
    }
    booking.Bids = updatedBids;
    await booking.save();

    return res
      .status(200)
      .json({ success: true, message: "Offer rejected successfully" });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === get booking client === === === //

exports.getBookings = async (req, res) => {
  try {
    let user = req.user;
    let booking = await Booking.find(
      {
        UserId: user.UserId,
        Status: { $ne: "pending" },
      },
      { Bids: 0, PhoneNo: 0 }
    );
    booking = booking.map((itm) => {
      if (!["confirmed", "ongoing"].some((it) => it == itm.Status)) {
        itm.DriverDetails = {};
        return itm;
      }
      return itm;
    });
    return res.status(200).json({ success: true, data: booking });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === get booking operator === === === //

exports.getOBookings = async (req, res) => {
  try {
    let user = req.user;
    if (
      !user ||
      !user.Operator ||
      !user.Operator.verified ||
      !["suspended", "verified", "active"].includes(user.Operator.Status)
    ) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid request" });
    }
    let { type } = req.body;
    if (!["current", "completed", "cancelled"].some((itm) => itm == type)) {
      let error = new Error("Invalid request");
      error.status = 400;
      throw error;
    }
    let filter = {
      "AcceptedBid.OperatorId": user.Operator.OperatorId,
    };
    if (type == "current") {
      filter = { ...filter, Status: { $in: ["confirmed", "ongoing"] } };
    } else {
      filter = { ...filter, Status: type };
    }
    let booking = await Booking.find(filter, { Bids: 0 });
    booking = booking.map((itm) => {
      if (!["confirmed", "ongoing"].some((it) => it == itm.Status)) {
        itm.PhoneNo = "";
        return itm;
      }
      return itm;
    });
    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
// === === === get booking operator === === === //

exports.getDBookings = async (req, res) => {
  try {
    let user = req.user;
    if (
      !user ||
      !user.Driver ||
      !["suspended", "verified"].includes(user.Driver.Status)
    ) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid request" });
    }
    let { type } = req.body;
    if (!["current", "completed", "cancelled"].some((itm) => itm == type)) {
      let error = new Error("Invalid request");
      error.status = 400;
      throw error;
    }
    let filter = {
      "DriverDetails.DriverId": user.Driver.DriverId,
    };
    if (type == "current") {
      filter = { ...filter, Status: { $in: ["confirmed", "ongoing"] } };
    } else {
      filter = { ...filter, Status: type };
    }
    let booking = await Booking.find(filter, { Bids: 0 });
    booking = booking.map((itm) => {
      if (!["confirmed", "ongoing"].some((it) => it == itm.Status)) {
        itm.PhoneNo = "";
        return itm;
      }
      return itm;
    });
    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
// === === === cancel bookings === === == //
const reasons = [
  "Increased fare",
  "Delayed arrival",
  "Driver declined",
  "Unclean vehicle",
  "Plan changed",
  "Requested cancellation",
  "Driver behavior issue",
];

exports.cancelBooking = async (req, res) => {
  try {
    const user = req.user;
    const { BookingId, Reasons } = req.body;

    if (
      !Array.isArray(Reasons) ||
      Reasons.length == 0 ||
      !Reasons.every(
        (reason) => typeof reason === "string" && reasons.includes(reason)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid reasons provided. Please provide valid cancellation reasons.",
      });
    }

    const booking = await Booking.findOne({
      UserId: user.UserId,
      BookingId,
    });

    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "No Booking found" });
    }

    if (booking.Status !== "confirmed") {
      return res.status(400).json({
        success: false,
        message: "Booking can't be cancelled in this stage",
      });
    }

    if (
      !booking.Operator &&
      booking.Fee > 0 &&
      Reasons.length == 1 &&
      Reasons[0] == "Plan changed"
    ) {
      let refund = await refundfee(booking.BookingId, user.UserId);
      if (!refund.success) {
        let error = new Error("Request failed, unable to cancel the booking.");
        error.status = 400;
        throw error;
      }
    } else {
      booking.Status = "cancelled";
      booking.Reasons = Reasons;
      await booking.save();
    }

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      booking,
    });
    let oup = await User.findOne({
      UserId: "User-" + booking.AcceptedBid.OperatorId.split("-")[1],
    });
    oup.tokens.forEach((itm) => {
      if (itm.fcm && itm.expire > new Date().getTime()) {
        try {
          sendNotification(itm.fcm, {
            title: "Booking cancelled",
            body: `${user.Name.split(" ")[0]} has cancelled his ${
              booking.TripType
            } booking of ₹${booking.AcceptedBid.Offer}`,
          });
        } catch (error) {}
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === driver profile === === === //

exports.DriverProfile = async (req, res) => {
  try {
    const user = req.user;
    let driver = await Driver.findOne(
      {
        UserId: user.UserId,
        Status: { $ne: "unlinked" },
      },
      { AadhaarCard: 0, DrivingLicence: 0 }
    );
    if (driver) {
      res.status(200).json({ success: true, data: driver });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid request no driver profile found",
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === verify driver profile === === === //

exports.verifyProfile = async (req, res) => {
  try {
    let user = req.user;
    let driver = await Driver.findOne({ UserId: user.UserId });
    if (!driver) {
      let error = new Error(
        "No driver profile found associated with this account"
      );
      error.status = 400;
      throw error;
    }
    if (driver.Status != "approved") {
      let error = new Error("can't verify profile at this stage");
      error.status = 400;
      throw error;
    }
    driver.Status = "verified";
    await driver.save();
    await User.updateOne(
      { UserId: user.UserId },
      { Driver: { Status: "verified", DriverId: driver.DriverId } }
    );
    return res
      .status(200)
      .json({ success: true, message: "profile verified successfully" });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === genrate trip otp === === === //
function gOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
exports.genrateOtp = async (req, res) => {
  try {
    let user = req.user;
    if (!user || !user.Driver || user.Driver.Status != "verified") {
      let error = new Error("Invalid request: Unauthorized access1");
      error.status = 401;
      throw error;
    }
    let { BookingId } = req.body;
    if (!BookingId) {
      let error = new Error("No valid BookingId provided");
      error.status = 400;
      throw error;
    }
    let booking = await Booking.findOne({ BookingId });
    if (booking.DriverDetails.DriverId != user.Driver.DriverId) {
      let error = new Error("Invalid request: Unauthorized access2");
      error.status = 401;
      throw error;
    }
    if (!booking || !["confirmed", "ongoing"].includes(booking.Status)) {
      let error = new Error("No valid BookingId provided");
      error.status = 400;
      throw error;
    }
    if (booking.Date.getTime() > new Date().getTime() + 1800000) {
      return res.status(200).json({
        success: true,
        message: "OTP can only be sent 30 minutes before the scheduled time.",
      });
    }
    let otp = "";
    if (booking.Status == "confirmed") {
      if (!booking.Billing.Otp.Start) {
        otp = gOtp();
        booking.Billing = {
          ...booking.Billing,
          Otp: {
            Start: otp,
          },
        };
      }
    } else {
      if (!booking.Billing.Otp.End) {
        otp = gOtp();
        booking.Billing = {
          ...booking.Billing,
          Otp: {
            ...booking.Billing.Otp,
            End: otp,
          },
        };
      }
    }
    if (otp) {
      await booking.save();
    }
    let message =
      booking.Status == "confirmed"
        ? `${
            user.Name.split(" ")[0]
          } is starting the trip. Please provide the OTP ${
            booking.Billing.Otp.Start
          } to the driver.`
        : `${
            user.Name.split(" ")[0]
          } is ending the trip. Please provide the OTP ${
            booking.Billing.Otp.End
          } to the driver.`;
    let client = await User.findOne({ UserId: booking.UserId }, { tokens: 1 });
    client.tokens.forEach((itm) => {
      if (itm.fcm && itm.expire > new Date().getTime()) {
        try {
          sendNotification(itm.fcm, {
            title:
              booking.Status == "confirmed"
                ? "Driver Starting the Trip"
                : "Driver ending the Trip",
            body: message,
          });
        } catch (error) {}
      }
    });
    return res
      .status(200)
      .json({ success: true, message: "OTP sent to client" });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === start trip === === === //

exports.startTrip = async (req, res) => {
  try {
    let user = req.user;
    if (!user || !user.Driver || user.Driver.Status != "verified") {
      let error = new Error("Invalid request: Unauthorized access");
      error.status = 401;
      throw error;
    }
    let { BookingId, OTP } = req.body;
    if (!BookingId || !OTP || !validator.isLength(OTP, { min: 6, max: 6 })) {
      let error = new Error("No valid BookingId and OTP provided");
      error.status = 400;
      throw error;
    }
    let booking = await Booking.findOne({ BookingId });
    if (!booking || !["confirmed"].includes(booking.Status)) {
      let error = new Error("No valid BookingId provided");
      error.status = 400;
      throw error;
    }
    if (booking.Date.getTime() > new Date().getTime() + 1800000) {
      return res.status(200).json({
        success: true,
        message:
          "Trip can be started only 30 minutes before the scheduled time.",
      });
    }
    if (!booking.Billing.Otp.Start) {
      let error = new Error("Please genarate a OTP first");
      error.status = 400;
      throw error;
    }
    if (booking.Billing.Otp.Start != OTP) {
      let error = new Error("Invalid otp");
      error.status = 400;
      throw error;
    }
    booking.Status = "ongoing";
    booking.Billing.StartTime = new Date();
    await booking.save();
    res.status(200).json({ success: true, message: "Trip started" });
    try {
      let message = `${user.Name.split(" ")[0]} has started the trip.`;
      let client = await User.findOne(
        { UserId: booking.UserId },
        { tokens: 1 }
      );
      client.tokens.forEach((itm) => {
        if (itm.fcm && itm.expire > new Date().getTime()) {
          try {
            sendNotification(itm.fcm, {
              title: "Driver Started the Trip",
              body: message,
            });
          } catch (error) {}
        }
      });
      if (booking.AcceptedBid.OperatorId == user.Operator.OperatorId) {
        return;
      }
      let operator = await Operator.findOne(
        {
          UserId: "User-" + booking.AcceptedBid.OperatorId.split("-")[1],
        },
        { tokens: 1 }
      );
      operator.tokens.forEach((itm) => {
        if (itm.fcm && itm.expire > new Date().getTime()) {
          try {
            sendNotification(itm.fcm, {
              title: "Driver Started the Trip",
              body: message,
            });
          } catch (error) {}
        }
      });
    } catch (error) {}
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === end trip === === === //

exports.endTrip = async (req, res) => {
  try {
    let user = req.user;
    if (!user || !user.Driver || user.Driver.Status != "verified") {
      let error = new Error("Invalid request: Unauthorized access");
      error.status = 401;
      throw error;
    }
    let { BookingId, OTP } = req.body;
    if (!BookingId || !OTP || !validator.isLength(OTP, { min: 6, max: 6 })) {
      let error = new Error("No valid BookingId and OTP provided");
      error.status = 400;
      throw error;
    }
    let booking = await Booking.findOne({ BookingId });
    if (!booking || !["ongoing"].includes(booking.Status)) {
      let error = new Error("No valid BookingId provided");
      error.status = 400;
      throw error;
    }
    if (booking.Date.getTime() > new Date().getTime() + 1800000) {
      return res.status(200).json({
        success: true,
        message:
          "Trip can be started only 30 minutes before the scheduled time.",
      });
    }
    if (booking.Billing.Otp.End != OTP) {
      let error = new Error("Invalid otp");
      error.status = 400;
      throw error;
    }
    booking.Status = "completed";
    booking.Billing.EndTime = new Date();
    await booking.save();
    res.status(200).json({ success: true, message: "Trip ended" });
    try {
      let message = `${user.Name.split(" ")[0]} has ended the trip.`;
      let client = await User.findOne(
        { UserId: booking.UserId },
        { tokens: 1 }
      );
      client.tokens.forEach((itm) => {
        if (itm.fcm && itm.expire > new Date().getTime()) {
          try {
            sendNotification(itm.fcm, {
              title: "Driver Ended the Trip",
              body: message,
            });
          } catch (error) {}
        }
      });
      if (booking.AcceptedBid.OperatorId == user.Operator.OperatorId) {
        return;
      }
      let operator = await Operator.findOne(
        {
          UserId: "User-" + booking.AcceptedBid.OperatorId.split("-")[1],
        },
        { tokens: 1 }
      );
      operator.tokens.forEach((itm) => {
        if (itm.fcm && itm.expire > new Date().getTime()) {
          try {
            sendNotification(itm.fcm, {
              title: "Driver ended the Trip",
              body: message,
            });
          } catch (error) {}
        }
      });
    } catch (error) {}
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === call operator === === === //

exports.callOperator = async (req, res) => {
  try {
    let user = req.user;
    if (!user || !user.Operator || user.Operator.Status != "active") {
      let error = new Error("Invalid request: Unauthorized access 1");
      error.status = 400;
      throw error;
    }
    let { BookingId, OperatorId } = req.body;
    let booking = await Booking.findOne({
      BookingId,
      Status: "pending",
      UserId: user.UserId,
    });
    if (!booking.Operator) {
      let error = new Error("Invalid request: Invalid Booking type");
      error.status = 400;
      throw error;
    }
    if (!booking) {
      let error = new Error("No valid BookingId provided");
      error.status = 400;
      throw error;
    }
    let bid = booking.Bids.find((itm) => itm.OperatorId == OperatorId);
    if (!bid) {
      let error = new Error("No offer on this booking from selected Operator");
    }
    let update;
    if (!booking.OPF.deducted) {
      update = {
        OPF: {
          deducted: true,
          amount: process.env.OPFEE,
        },
      };
      if (process.env.OPFEE > 0) {
        let deduction = await deductfee(
          user.Operator.OperatorId,
          process.env.OPFEE,
          booking.BookingId
        );
        if (!deduction.result) {
          let error = new Error("Please recharge your operator wallet");
          error.status = 400;
          throw error;
        }
        await Booking.updateOne({ BookingId, UserId: user.UserId }, update);
      }
    }
    let operator = await User.findOne({
      UserId: "User-" + OperatorId.split("-")[1],
    });
    return res.status(200).json({ success: true, data: operator.PhoneNo });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
