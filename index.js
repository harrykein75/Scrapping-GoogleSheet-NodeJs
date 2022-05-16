const cron = require("node-cron");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();

const spreadsheetId = process.env.SPREADSHEET_ID;
const sheetName = process.env.SHEET_NAME;
let sheet_id;

const authentication = async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();

  const sheets = google.sheets({
    version: "v4",
    auth: client,
  });

  return {
    sheets,
  };
};

async function main() {
  try {
    const { sheets } = await authentication();
    console.log("Authentication success!");
    // Getting sheet_id
    const request = {
      spreadsheetId,
      ranges: sheetName,
      includeGridData: false,
    };
    await sheets.spreadsheets
      .get(request)
      .then((response) => {
        console.log("Getting sheetId success!"); // Find sheet success
        sheet_id = response.data.sheets[0].properties.sheetId;
      })
      .catch((error) => {
        console.log("Error while getting sheetId");
        return { msg: error };
      });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
      majorDimension: "COLUMNS",
    });
    const shopIds = result.data.values[1].slice(1);

    let stockList = [];
    for (let index = 0; index < shopIds.length; index++) {
      if (shopIds[index] == "") {
        stockList[index] = "Not found";
        continue;
      }
      await axios
        .get(process.env.API_URL + shopIds[index])
        .then((response) => {
          console.log(response.data.store_id, response.data.quantity_on_hand);
          stockList[index] = response.data.quantity_on_hand;
        })
        .catch((error) => {
          console.error(error);
          stockList[index] = "Not found";
        });
    }

    stockList.unshift(new Date().toDateString());

    const batchUpdateRequest = {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: sheet_id,
              dimension: "COLUMNS",
              startIndex: 2,
              endIndex: 3,
            },
            inheritFromBefore: false,
          },
        },
      ],
    };
    await sheets.spreadsheets.batchUpdate(
      {
        spreadsheetId,
        requestBody: batchUpdateRequest,
      },
      async (err) => {
        if (err) {
          console.log(err);
          return { msg: err };
        } else {
          const writeReq = await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!C:C`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              majorDimension: "COLUMNS",
              values: [stockList],
            },
          });

          if (writeReq.status === 200) {
            console.log("Spreadsheet updated!");
            return { msg: "Spreadsheet updated!" };
          } else {
            console.log("Error");
            return { msg: "Error" };
          }
        }
      }
    );
  } catch (error) {
    console.log(error);
    return { msg: "Error" };
  }
}

if (!process.env.SPREADSHEET_ID || !process.env.SHEET_NAME || !process.env.API_URL) {
    console.log("Please set values in .env file");
} else {
    //cron.schedule("* * * * *", function () {  // every minute for testing
    cron.schedule("0 0 * * *", function () { // every day at midnight
        console.log("running every minute seconds");
        main();
    });
}
