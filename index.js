const cron = require("node-cron");
const axios = require("axios");
const {
  google
} = require("googleapis");
require("dotenv").config();

const spreadsheetId = process.env.SPREADSHEET_ID;
const sheetName = process.env.SHEET_NAME;

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

async function getProductDataFromAPI(shopId) {
  const response = await axios
    .get(process.env.API_URL + shopId)
  return response.data.quantity_on_hand;
}

async function main() {
  try {
    const {
      sheets
    } = await authentication();
    console.log("Authentication success!");

    // Getting sheetId
    let sheetId;
    try {
      const request = {
        spreadsheetId,
        ranges: sheetName,
        includeGridData: false,
      };
      const response = await sheets.spreadsheets.get(request);
      sheetId = response.data.quantity_on_hand;
    } catch (error) {
      console.log("Error while getting sheetId");
      return {
        msg: error
      };
    }

    // Getting ShopIds
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
      majorDimension: "COLUMNS",
    });
    const shopIds = result.data.values[1].slice(1);

    // Getting Product Data
    let stockList = [];
    for (let index = 0; index < shopIds.length; index++) {
      if (shopIds[index] == "") {
        stockList[index] = "Empty StoreId";
        continue;
      }
      try {
        stockList[index] = await getProductDataFromAPI(shopIds[index]);
      } catch (error) {
        console.error(error);
        stockList[index] = "Invalid StoreId";
      }
    }
    stockList.unshift(new Date().toDateString());

    // Google Sheets Update
    const batchUpdateRequest = {
      requests: [{
        insertDimension: {
          range: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: 2,
            endIndex: 3,
          },
          inheritFromBefore: false,
        },
      }, ],
    };
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: batchUpdateRequest,
      },
      async (err) => {
        if (err) {
          console.log(err);
          return {
            msg: err
          };
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
            return {
              msg: "Spreadsheet updated!"
            };
          } else {
            console.log("Error");
            return {
              msg: "Error"
            };
          }
        }
      }
    );
  } catch (error) {
    console.log(error);
    return {
      msg: "Error"
    };
  }
}

if (!process.env.SPREADSHEET_ID || !process.env.SHEET_NAME || !process.env.API_URL) {
  console.log("Please set values in .env file");
} else {
  //cron.schedule("* * * * *", function () { // every minute for testing
  cron.schedule("0 0 * * *", function () { // every day at midnight
    main();
  });
}