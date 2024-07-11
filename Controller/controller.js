const validator = require("validator");
const User = require("../Database/collection/User");
const TempUser = require("../Database/collection/TempUser");
const Bcrypt = require("bcryptjs");
const { sendOTP, verifyOTP } = require("otpless-node-js-auth-sdk");
const uniqid = require("uniqid");
const { getCurrentRates } = require("./multiplier/fare");
const Driver = require("../Database/collection/Driver");
const {
  initializeWallet,
  initate_topup,
  verifySignature,
} = require("../Database/transaction/transaction");

exports.login = async (req, res) => {
  try {
    const { EmailId, PhoneNo, Password } = req.body;
    let filter = {};
    if (!EmailId && !PhoneNo) {
      const error = new Error("either Email or PhoneNo is required");
      error.status = 400;
      throw error;
    }
    if (EmailId) {
      if (!validator.isEmail(EmailId)) {
        const error = new Error("Invalid Credentials");
        error.status = 400;
        throw error;
      }
      filter.EmailId = EmailId.toLowerCase();
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
      throw new Error("Please enter a valid email");
    }

    if (!validator.isLength(Name, { min: 3, max: 50 })) {
      throw new Error("Name should be between 3 and 50 characters long");
    }

    if (!validator.isMobilePhone(PhoneNo, "en-IN")) {
      throw new Error("Please enter a valid phone number");
    }
    if (!validator.isLength(PhoneNo, { min: 10, max: 10 })) {
      throw new Error("Please enter a valid phone number without country code");
    }
    if (Password !== CPassword) {
      throw new Error("Passwords do not match");
    }

    if (!validator.isLength(Password, { min: 8, max: 50 })) {
      throw new Error("Password should be at least 8 to 50 characters long");
    }
    const existingUser = await User.findOne({
      $or: [{ EmailId: EmailId.toLowerCase() }, { PhoneNo: "+91" + PhoneNo }],
    });
    if (existingUser) {
      throw new Error("User with given email or phone number already exists");
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
      EmailId.toLowerCase(),
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
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { EmailId, PhoneNo, OTP } = req.body;
    if (!validator.isEmail(EmailId)) {
      throw new Error("Please enter a valid email");
    }
    if (!validator.isMobilePhone(PhoneNo, "en-IN")) {
      throw new Error("Please enter a valid phone number");
    }
    if (!validator.isLength(PhoneNo, { min: 10, max: 10 })) {
      throw new Error("Please enter a valid phone number without country code");
    }
    if (!validator.isLength(OTP, { min: 4, max: 6 })) {
      throw new Error("Please enter a valid OTP");
    }
    const tempUser = await TempUser.findOne({
      EmailId: EmailId.toLowerCase(),
      PhoneNo: "+91" + PhoneNo,
    });
    let curtime = new Date().getTime();
    if (!tempUser || tempUser.OTPExpires < curtime) {
      throw new Error("Invalid or expired OTP");
    }
    const existingUser = await User.findOne({
      $or: [
        { EmailId: tempUser.EmailId.toLowerCase() },
        { PhoneNo: tempUser.PhoneNo },
      ],
    });

    if (existingUser) {
      throw new Error("User with given email or phone number already exists");
    }

    const verify = await verifyOTP(
      tempUser.EmailId,
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
      throw new Error("Please enter a valid OTP");
    }
  } catch (error) {
    res.status(400).json({ message: error.message || "Internal Server Error" });
  }
};

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
// === === === change password === === === //

exports.change_password = async (req, res) => {
  try {
    const user = req.user;
    const { Opassword, newPassword } = req.body;

    if (!Opassword || !newPassword) {
      throw new Error("All fields are required");
    }

    if (!validator.isLength(Opassword, { min: 8, max: 50 })) {
      throw new Error("Please enter valid credentials");
    }

    if (!validator.isLength(newPassword, { min: 8, max: 50 })) {
      throw new Error("Password must be 8 to 50 characters long");
    }

    const isMatch = await Bcrypt.compare(Opassword, user.Password);
    if (!isMatch) {
      throw new Error("Invalid password");
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
      throw new Error("Search query is required");
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
    res
      .status(500)
      .send({ error: "An error occurred while searching for cities" });
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
      throw new Error("two places are required to calculate distance");
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
    res
      .status(500)
      .json({ error: "An error occurred while processing the request" });
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

// async function getLatLong(placeId) {
//   const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${process.env.GOOGLE}`;
//   try {
//     if (!placeId) {
//       if (!response.ok) {
//         throw new Error(`please provide a placeId`);
//       }
//     }
//     const response = await fetch(url);
//     if (!response.ok) {
//       throw new Error(`HTTP error! Status: ${response.status}`);
//     }
//     const data = await response.json();
//     const result = data.result;
//     if (result) {
//       const location = result.geometry.location;
//       return {
//         latitude: location.lat,
//         longitude: location.lng,
//         description: result.formatted_address,
//         place_id: result.place_id,
//       };
//     } else {
//       throw new Error("No result found for the provided place_id.");
//     }
//   } catch (error) {
//     console.error("Error fetching location:", error);
//     return null;
//   }
// }

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
      throw new Error("Please provide an address");
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
      throw new Error("No result found for the provided address.");
    }
  } catch (error) {
    console.error("Error fetching location from Google Maps:", error);
    return null;
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
      throw new Error("Invalid Request");
    }
    let update = {};
    if (fields.City) {
      fields.City = JSON.parse(fields.City);
      if (!fields.City.place_id) {
        throw new Error("Please select a city from list");
      }
      let lola = await getLatLong(fields.City.description);
      update = { City: lola };
    }
    if (files.Profile) {
      let folderpath = path.join(__dirname, "../files/user/", user.UserId);
      let filesave;
      try {
        await cleanupFiles(folderpath);
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
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === user image === === === //

exports.UserImage = async (req, res) => {
  try {
    console.log("hi there");
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
      throw new Error(`You already have a Operator profile`);
    }
    const { fields, files } = await busboyPromise(req);
    ["AadhaarFront", "AadhaarRear", "Profile"].forEach((itm) => {
      if (!files[itm]) {
        throw new Error(`Please select a ${itm} image`);
      }
    });
    if (files.length > 3) {
      throw new Error("Invalid request");
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
        throw new Error(`Please enter your ${key}`);
      }
      if (validator && !validator(fields[key])) {
        throw new Error(`${message}`);
      }
    });
    const dobPattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    if (!dobPattern.test(fields.Dob)) {
      throw new Error("Dob must be in format DD/MM/YYYY.");
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
      throw new Error("User must be at least 18 years old.");
    }

    if (user.PhoneNo === `+91${fields.EmergencyNumber}`) {
      throw new Error("Please provide a different emergency contact number");
    }

    if (!fields.City) {
      throw new Error("Please Select a City");
    }
    fields.City = JSON.parse(fields.City);
    if (!fields.City.place_id || !fields.City.description) {
      throw new Error("Please Select a City");
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
      Dob: fields.Dob,
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
    res.status(400).json({
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
      throw new Error("Please Enter Both EmailId and PhoneNo");
    }
    if (!validator.isEmail(EmailId)) {
      throw new Error("Please enter a valid EmailId");
    }
    if (
      !validator.isMobilePhone(PhoneNo, "en-IN") ||
      !validator.isLength(PhoneNo, { min: 10, max: 10 })
    ) {
      throw new Error("Please enter a valid 10 digit PhoneNo");
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
      throw new Error("No Profile Found");
    }
  } catch (error) {
    res.status(400).json({
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
      throw new Error("IsDriver field in required");
    }
    const throwValidationError = (message) => {
      throw new Error(message);
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
        throw new Error(`Please select a ${itm} image`);
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
      throw new Error(
        !driver && !cab
          ? "Please add a cab and driver"
          : !cab
          ? "Please add a cab"
          : "Please add a driver"
      );
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
    console.log(error.message);
    res.status(400).json({
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
          throw new Error(
            `Please select a ${itm === "Photo" ? "Cab" : itm} image`
          );
        }
      }
    );
    if (Model == undefined || CabNumber == undefined) {
      throw new Error(`All fields are required`);
    }
    if (!validator.isLength(CabNumber, { max: 14, min: 9 })) {
      throw new Error("please enter a valid Cab Number");
    }
    Model = JSON.parse(Model);
    ["name", "manufacturer", "segment"].forEach((itm) => {
      if (!Model[itm]) {
        throw new Error(`${itm} of cab is required`);
      }
    });
    const exist = await Cab.findOne({ CabNumber, status: { $ne: "unlinked" } });
    if (exist) {
      throw new Error("Cab Aleready linked with other operator");
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
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === book outstation === === === //

exports.bookcab = async (req, res) => {
  try {
    const user = req.user;
    let { From, To, Dat, Time, Category, TripType, Offer, Hour, Km } = req.body;
    ["From", "Dat", "Time", "Category", "TripType", "Offer"].forEach((itm) => {
      if (!req.body[itm]) {
        throw new Error("Invalid Request all fields are required");
      }
    });

    if (!["Roundtrip", "Oneway", "Rental"].some((itm) => itm == TripType)) {
      throw new Error("Invalid input 1");
    }

    if (!["Micro", "Sedan", "MUV", "SUV"].some((itm) => itm == Category)) {
      throw new Error("Invalid input 2");
    }

    if (TripType != "Rental" && !To) {
      throw new Error("Invalid Request all fields are required");
    }
    [From, To].forEach((itm) => {
      if (itm) {
        if (
          ["description", "place_id", "query"].some((subitm) => !itm[subitm])
        ) {
          throw new Error("Invalid input");
        }
      }
    });
    if (TripType !== "Rental") {
      let suggest = await getSuggestion(From.query);
      From = suggest.filter((itm) => itm.place_id == From.place_id)[0];
      if (!From) {
        throw new Error("Please select a location from list");
      }
      suggest = await getSuggestion(To.query);
      To = suggest.filter((itm) => itm.place_id == To.place_id)[0];
      if (!To) {
        throw new Error("Please select a location from list");
      }
    } else {
      let suggest = await getCity(From.query);
      From = suggest.filter((itm) => itm.place_id == From.place_id)[0];
      if (!From) {
        throw new Error("Please select a City from list");
      }
    }
    let t_d = new Date(Time);
    let thf = new Date(new Date().getTime() + 1.75 * 3600 * 1000);
    let d_t = new Date(Dat);
    d_t.setHours(t_d.getHours());
    d_t.setMinutes(t_d.getMinutes());
    if (thf > t_d) {
      throw new Error("Select a date and time at least 2 hours in the future.");
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
        throw new Error(`Minimum fare is ₹ ${baseFare}`);
      }
    } else {
      From = await getLatLong(From.description);
      if (Hour > 12 || Km > 200) {
        throw new Error("Invalid Input");
      }
      if (Km / 10 < Hour) {
        throw new Error("Invalid Input");
      }
      const result = getCurrentRates();
      const rates = result[Category];

      if (!rates || !rates["Roundtrip"]) {
        throw new Error("Invalid carType or tripType");
      }

      let baseFare = Math.ceil(
        (Km * rates["Roundtrip"] + Hour * rates["Waitingcharges"]) * 0.84
      );
      if (Offer < baseFare) {
        throw new Error(`Minimum fare is ₹ ${baseFare}`);
      }
    }

    let booking = {
      BookingId: uniqid("booking-"),
      Name: user.Name,
      From,
      Category,
      Date: Dat,
      TripType,
      Offer,
      Km,
      Hour,
      UserId: user.UserId,
      PublishOn: new Date().getTime(),
    };
    if (TripType !== "Rental") {
      booking = { ...booking, To };
    }
    booking = new Booking(booking);
    const result = await booking.save();
    return res.status(201).json({
      success: true,
      message: "You'll start receiving offers from drivers shortly.",
      data: booking.BookingId,
    });
  } catch (error) {
    res.status(400).json({
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
          throw new Error("Invalid input");
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

    const bookings = await Booking.find(query);
    const update = await Operator.updateOne(
      { OperatorId: user.Operator.OperatorId },
      To ? { From, To } : { From }
    );
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
    console.error("Error fetching drivers:", error);

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

    const { BookingId, CabId, DriverId, Offer } = req.body;
    if (!CabId || !DriverId || !Offer || !BookingId) {
      throw new Error(
        "Please provide a valid offer with cab and driver details."
      );
    }

    let cab = await Cab.findOne({
      CabId,
      OperatorId: user.Operator.OperatorId,
      Status: "verified",
    });
    if (!cab) {
      throw new Error("Invalid request: Cab not found.");
    }

    let driver = await Driver.findOne({
      DriverId,
      OperatorId: user.Operator.OperatorId,
      Status: "verified",
    });
    if (!driver) {
      throw new Error("Invalid request: Driver not found.");
    }

    let booking = await Booking.findOne({ BookingId, Status: "pending" });
    if (!booking) {
      throw new Error("Booking is either accepted or canceled.");
    }
    let wallet = await Wallet.findOne({ OperatorId: user.Operator.OperatorId });
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
    booking.Bids = booking.Bids.filter(
      (itm) => itm.OperatorId != user.Operator.OperatorId
    );
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
    await booking.save();
    res.status(200).json({
      success: true,
      message: "Offer successfully posted.",
      data: booking,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error.",
    });
  }
};

// === === === get requests === === === //

exports.getrequests = async (req, res) => {
  try {
    let user = req.user;
    let bookings = await Booking.find({
      UserId: user.UserId,
      Status: "pending",
    });
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
      throw new Error("No Wallet found");
    }
    res.status(200).json({ success: true, data: wallet });
  } catch (error) {
    res.status(400).json({
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
      amount < 300 ||
      amount > 2000
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid amount. Amount must be an integer between 300 and 2000.",
      });
    }
    let order = await initate_topup(user.Operator.OperatorId, amount);
    if (!order) {
      throw new Error("Order creation failed");
    }
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error.",
    });
  }
};

// === === === serve pay === === === //

exports.servepay = async (req, res) => {
  try {
    const { UserId, OrderId } = req.params;

    // Validate Operator
    const user = await User.findOne({ UserId });
    if (
      !user ||
      !user.Operator ||
      !user.Operator.verified ||
      ["pending", "verified"].includes(user.Operator.Status)
    ) {
      return res.status(404).send("Wallet not found");
    }

    // Check Operator's Wallet
    const wallet = await Wallet.findOne({
      OperatorId: user.Operator.OperatorId,
    });
    if (!wallet) {
      return res.status(404).send("Wallet not found");
    }

    // Find Order in Wallet Transactions
    const order = wallet.Transactions.find((item) => item.orderId === OrderId);
    if (!order || order.status !== "pending") {
      return res.status(404).send("Order not found or not pending");
    }

    // Serve Razorpay Payment Page
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Razorpay Payment</title>
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <style>
        /* Add your custom styles here */
        body {
          font-family: Arial, sans-serif;
          background-color: #f0f0f0;
          padding: 20px;
        }
        /* Additional styles as needed */
      </style>
    </head>
    <body>
      <div id="payment-container">
        <!-- Razorpay integration script -->
      </div>

      <script>
        const key = 'rzp_test_TZAshUrYdjeY7N';
        const orderId = '${OrderId}';
        const amount = ${order.amount * 100};

        var options = {
          key: key,
          amount: amount,
          currency: 'INR',
          name: 'Drive Sync',
          description: 'Wallet Topup ₹${order.amount}',
          image: 'https://example.com/logo.png',
          order_id: orderId,
          handler: function(response) {
            alert('Your payment was successful. Please head back to the app.');
    
            // Send payment response to server
            fetch('/Operator/wallet/topup/razorpay/${user.UserId}/${
      order.orderId
    }/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                operatorId:'${user.Operator.OperatorId}'
              })
            })
            .then(res => res.json())
            .then(data => {
              console.log(data.message);
            })
            .catch(err => {
              console.error('Error:', err);
            });
          },
          prefill: {
            email: '${user.EmailId}',
            contact: '${user.PhoneNo.slice(3)}',
            name: '${user.Name}'
          },
          theme: {
            color: '#53a20e'
          }
        };

        // Automatically load Razorpay checkout on page load
        var rzp = new Razorpay(options);
        rzp.open();
        document.addEventListener("visibilitychange", function() {
          if (document.visibilityState === 'hidden') {
              // Display a message or take action when the page is hidden
              alert('Please wait while your payment is being processed.');
          }
      });
      
      </script>
    </body>
    </html>
    `;

    res.status(200).send(html);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// === === === verify payment === === === //

exports.verifypayment = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.acceptOffer = async (req, res) => {
  try {
    const { BookingId, OperatorId } = req.body;
    const user = req.user;
    if (!BookingId || !OperatorId) {
      throw new Error("Invalid request");
    }
    let booking = await Booking.findOne({
      BookingId,
      UserId: user.UserId,
      Status: "pending",
    });
    if (!booking) {
      throw new error("Invalid request");
    }
    let bid = await booking.Bids.find((itm) => itm.OperatorId === OperatorId);
    if (!bid) {
      throw new Error("can't find the offer");
    }
    let driver = await Driver.findOne({
      OperatorId,
      DriverId: bid.DriverId,
      Status: { $ne: "unlinked" },
    });
    if (!driver) {
      throw new Error("can't find the specified driver");
    }
    let cab = await Cab.findOne({
      OperatorId,
      CabId: bid.CabId,
      Status: { $ne: "unlinked" },
    });
    if (!cab) {
      throw new Error("can't find the specified cab");
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
    let wallet = await Wallet.findOne({ OperatorId });
    if (!wallet) {
      booking.Bids = booking.Bids.filter(
        (itm) => itm.OperatorId !== OperatorId
      );
      await booking.save();
      throw new Error("Can't process this request");
    } else if (wallet.Balance < process.env.BIDFEE) {
      booking.Bids = booking.Bids.filter(
        (itm) => itm.OperatorId !== OperatorId
      );
      await booking.save();
      throw new Error("Can't process this request");
    }
    let result = await Booking.updateOne({ BookingId: BookingId }, update);
    res.status(200).json({
      success: true,
      message: "Offer accepted successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
