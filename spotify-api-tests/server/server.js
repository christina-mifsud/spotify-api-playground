/**
 * This is an example of a basic node.js script that performs
 * the Client Credentials oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow
 */

const client_id = "";
const client_secret = "";

// fetches token (which expires after 1hr)
async function getToken() {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    // POST request to the token endpoint URI
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
    // Content-Type header set to the application/x-www-form-urlencoded value
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        // Added a HTTP body containing the Client ID and Client Secret
        Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
  });
  // returns access token valid for 1hr
  return await response.json();
}

// GET Artist endpoint
// // make API call & use the Get Artist endpoint to request info about artist
// async function getTrackInfo(access_token) {
//   const response = await fetch(
//     "https://api.spotify.com/v1/tracks/22VHOlVYBqytsrAqV8yXBK",
//     {
//       // API call must include access token we just got above
//       method: "GET",
//       headers: { Authorization: "Bearer " + access_token },
//     }
//   );
//   return await response.json();
// }
// // if we have a token, then run the getTrackInfo function to get info about artist in the console.log
// getToken().then((response) => {
//   getTrackInfo(response.access_token).then((profile) => {
//     console.log(profile);
//   });
// });

/////////////////////////////////////////////////////////////////////////////

// Get Playlist endpoint -> why is this coming up as an object not like this:
// {
//   "tracks": {
//     "items": [
//       {
//         "added_at": "2024-01-18T20:08:53Z",
//         "added_by": {
//           "id": "31tulwjq2gsomhq5h5xdon2oopnu"
//         }
//       },
//       {
//         "added_at": "2024-01-09T22:05:02Z",
//         "added_by": {
//           "id": "31tulwjq2gsomhq5h5xdon2oopnu"
//         }
//       },}
//     ]
// }}
// make API call & use the Get Playlist endpoint to get playlist owned by user
async function getPlaylist(access_token) {
  const response = await fetch(
    // "https://api.spotify.com/v1/playlists/2RoQkVgIhgQmCZadrMoDLd", // whole playlist
    "https://api.spotify.com/v1/playlists/2RoQkVgIhgQmCZadrMoDLd?fields=tracks.items%28added_at%2Cadded_by.id%29",
    {
      // API call must include access token we just got above
      method: "GET",
      headers: { Authorization: "Bearer " + access_token },
    }
  );
  return await response.json();
}
// if we have a token, then run the getPlaylist function to get playlist info in the console.log
getToken().then((response) => {
  getPlaylist(response.access_token).then((profile) => {
    console.log(profile);
  });
});
