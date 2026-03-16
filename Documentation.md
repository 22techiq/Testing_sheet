const SHEET_NAME = "PAYMENTS";


/* ==============================
   MAIN ENTRY
============================== */

function doPost(e){

  try{

    const action = e.parameter.action;

    if(action === "initiatePayment"){
      return initiatePayment(e);
    }

    if(action === "webhook"){
      return handleWebhook(e);
    }

    /* Allow webhook even without action parameter */
    if(e.postData && e.postData.contents){
      return handleWebhook(e);
    }

    return json({error:"Invalid POST request"});

  }catch(err){

    return json({error:err.message});

  }

}


/* ==============================
   GET REQUESTS
============================== */

function doGet(e){

  const action = e.parameter.action;

  if(action === "checkStatus"){
    return checkStatus(e);
  }

  return json({error:"Invalid request"});

}



/* ==============================
   INITIATE PAYMENT
============================== */

function initiatePayment(e){

  const data = JSON.parse(e.postData.contents);

  const props = PropertiesService.getScriptProperties();

  const secretKey = props.getProperty("INTASEND_SECRET_KEY");
  const publicKey = props.getProperty("INTASEND_PUBLISHABLE_KEY");

  if(!secretKey){
    throw new Error("Missing INTASEND_SECRET_KEY in Script Properties");
  }


  const payload = {

    public_key: publicKey,
    currency: "KES",
    amount: data.amount,
    phone_number: data.phone,
    email: data.email,
    first_name: data.name,
    host: "https://script.google.com",
    api_ref: data.orderId

  };


  const options = {

    method: "post",

    headers:{
      Authorization:"Bearer "+secretKey,
      "Content-Type":"application/json"
    },

    payload: JSON.stringify(payload),

    muteHttpExceptions:true

  };


  const response = UrlFetchApp.fetch(
    "https://payment.intasend.com/api/v1/payment/mpesa-stk-push/",
    options
  );


  const result = JSON.parse(response.getContentText());

  if(result.error){
    return json({error: result.error});
  }


  const reference = result.invoice.invoice_id;


  const sheet = SpreadsheetApp
  .getActiveSpreadsheet()
  .getSheetByName(SHEET_NAME);


  sheet.appendRow([

    data.orderId,
    data.name,
    data.email,
    data.phone,
    data.amount,
    reference,
    "PENDING",
    new Date(),
    ""

  ]);


  return json({
    reference: reference
  });

}



/* ==============================
   CHECK PAYMENT STATUS
============================== */

function checkStatus(e){

  const reference = e.parameter.reference;

  const sheet = SpreadsheetApp
  .getActiveSpreadsheet()
  .getSheetByName(SHEET_NAME);

  const data = sheet.getDataRange().getValues();

  for(let i=1;i<data.length;i++){

    if(data[i][5] == reference){

      return json({
        status: data[i][6]
      });

    }

  }

  return json({status:"PENDING"});

}



/* ==============================
   WEBHOOK HANDLER
============================== */

function handleWebhook(e){

  const payload = JSON.parse(e.postData.contents);

  /* Support multiple IntaSend webhook formats */

  const reference =
      (payload.invoice && payload.invoice.invoice_id) ||
      payload.invoice_id ||
      payload.id ||
      "";

  const state = payload.state || payload.status || "";


  const sheet = SpreadsheetApp
  .getActiveSpreadsheet()
  .getSheetByName(SHEET_NAME);

  const data = sheet.getDataRange().getValues();


  for(let i=1;i<data.length;i++){

    if(data[i][5] == reference){

      let status = "PENDING";

      if(state === "COMPLETE"){
        status = "COMPLETE";
      }

      if(state === "FAILED"){
        status = "FAILED";
      }

      /* Update payment status */
      sheet.getRange(i+1,7).setValue(status);

      /* Store webhook payload for verification */
      sheet.getRange(i+1,9).setValue(JSON.stringify(payload));

      break;

    }

  }

  return json({success:true});

}



/* ==============================
   HELPER
============================== */

function json(obj){

  return ContentService
  .createTextOutput(JSON.stringify(obj))
  .setMimeType(ContentService.MimeType.JSON);

}
