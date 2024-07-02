require("dotenv").config();
// imports

const express = require("express");
const { createServer } = require("node:http");
const port = 3005 || process.env.PORT;
const Routes = require("./Route/Routes");
const bodyParser = require("body-parser");
const initialize = require("./socket/socket");
const app = express();

require("./Database/connection");

app.use(bodyParser.json());

app.use("/", Routes);

const server = createServer(app);

initialize(server);

server.listen(port, () => {
  console.log(`listining to port ${port}`);
});
