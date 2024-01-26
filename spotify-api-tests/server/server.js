/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/documentation/web-api/tutorials/code-flow
 */

var express = require("express");
var request = require("request");
var crypto = require("crypto");
var cors = require("cors");
var querystring = require("querystring");
var cookieParser = require("cookie-parser");
const { Pool } = require("pg");

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = process.env.REDIRECT_URI;
console.log("CLIENT_ID from variable:", client_id);

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: true,
});
console.log("DB_USER from variable:", process.env.DB_USER);

const generateRandomString = (length) => {
  return crypto.randomBytes(60).toString("hex").slice(0, length);
};

var stateKey = "spotify_auth_state";
var app = express();

app
  .use(express.static(__dirname + "/public"))
  .use(cors())
  .use(cookieParser());

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});

app.get("/", function (req, res) {
  res.send("HALLLLLOOOOO");
});

//// Authentication Routes

//// /login route
// initiates the Spotify authentication process
// route generates random state, stores it in a cookie & redirects user to the Spotify authorization URL
// includes response_type, client_id, scope, redirect_uri, and state in the URL
app.get("/login", function (req, res) {
  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // app requests authorization from user
  var scope = "user-read-private user-read-email";
  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state,
      })
  );
});

//// /callback route
// after user authorized, route checks if received state matches stored state in the cookies
// if so, we go ahead with token exchange(token exchange = exchange the authorization code for access & refresh tokens using a POST request to Spotify's token endpoint)
app.get("/callback", function (req, res) {
  // app requests refresh and access tokens
  // after checking the state parameter
  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect(
      "/#" +
        querystring.stringify({
          error: "state_mismatch",
        })
    );
  } else {
    res.clearCookie(stateKey);
    // request for refresh & access token
    var authOptions = {
      url: "https://accounts.spotify.com/api/token",
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: "authorization_code",
      },
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          new Buffer.from(client_id + ":" + client_secret).toString("base64"),
      },
      json: true,
    };

    // with access token, make a request to Spotify's API to retrieve user info, then redirect the user with the obtained access token and refresh token
    request.post(authOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        // if token exchange successful
        var access_token = body.access_token,
          refresh_token = body.refresh_token;
        // proceed to retrieval of user info
        var options = {
          url: "https://api.spotify.com/v1/me",
          headers: { Authorization: "Bearer " + access_token },
          json: true,
        };

        // store refresh token in DB
        // ON CONFLICT - to overwrite the existing row every time (regardless if refresh token is the same or not) - as we don't actually have a conflict we have to fake one - we are re-setting the id (a primary key so should have unique value) to 1 each time .. thus conflict
        pool.query(
          // "INSERT INTO refresh_tokens_table (refresh_token) VALUES ($1)",
          "INSERT INTO refresh_tokens_table (id, refresh_token) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET refresh_token = $1",
          [refresh_token],
          (error, result) => {
            if (error) {
              console.error("ERROR storing refresh token in DB:", error);
            } else {
              console.log("A-OK - Refresh token stored/updated in DB!");
            }
          }
        );

        console.log("SO FAR WE ARE GETTING:");
        console.log(`access token: ${body.access_token}`);
        console.log(`refresh token: ${body.refresh_token}`);

        // use the access token to access the Spotify Web API
        request.get(options, function (error, response, body) {
          console.log(
            "API call using tokens successful & got back info " +
              body.display_name
          );
          console.log(
            "______________________________________________________________"
          );
        });

        // // we can also pass the token to the browser to make requests from there - this makes the tokens visible in the URL - no bueno
        // res.redirect(
        //   "/#" +
        //     querystring.stringify({
        //       access_token: access_token,
        //       refresh_token: refresh_token,
        //     })
        // );
      } else {
        res.redirect(
          "/#" +
            querystring.stringify({
              error: "invalid_token",
            })
        );
      }
    });
  }
});

//// /refresh_token route
// **in URL - http://localhost:8888/refresh_token?refresh_token=YOUR_REFRESH_TOKEN
// expects a refresh_token query parameter, sends a POST request to Spotify's token endpoint with the refresh token, and responds with the new access and refresh tokens
app.get("/refresh_token", function (req, res) {
  // var refresh_token = req.query.refresh_token;
  // if (!refresh_token) {
  //   return res.status(400).send({ error: "refresh_token must be supplied" });
  // }

  // get refresh token from DB
  pool.query(
    "SELECT refresh_token FROM refresh_tokens_table LIMIT 1",
    (error, result) => {
      if (error) {
        console.error("Error getting refresh token from DB:", error);
        return res.status(500).send({ error: "FAILED to get refresh token" });
      }

      const storedRefreshToken = result.rows[0];

      if (!storedRefreshToken) {
        return res.status(400).send({ error: "No refresh token found in DB" });
      }

      // now take the refresh token which is stored in DB and save THAT as the refresh token to be used in the next steps
      var refresh_token = storedRefreshToken.refresh_token;

      var authOptions = {
        url: "https://accounts.spotify.com/api/token",
        headers: {
          Authorization:
            "Basic " +
            new Buffer.from(client_id + ":" + client_secret).toString("base64"),
        },
        form: {
          grant_type: "refresh_token",
          refresh_token: refresh_token,
        },
        json: true,
      };

      request.post(authOptions, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          var access_token = body.access_token;
          refresh_token = body.refresh_token;

          console.log("NEW ACCESS TOKEN:");
          console.log(`NEW access token: ${body.access_token}`);
          console.log(
            "______________________________________________________________"
          );

          res.send({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
          });
        } else {
          console.error("Error in /refresh_token route:", error);
          console.error("Response status code:", response.statusCode);
          console.error("Response body:", body);
          res
            .status(response.statusCode)
            .send({ error: "Failed to refresh token" });
        }
      });
    }
  );
});

// everytime /login route is hit a new refresh and access token is generated & stored in the db
// everytime /refresh_token is hit a new access token (only) is generated
