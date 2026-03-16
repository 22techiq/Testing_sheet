/*ORIGINAL CODE WORKING AS INTENTED*/
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
/*END OF ORIGINAL CODE*/






//To add automatic email notifications for successful and failed payments, you only need to modify two places and add one new function. This will not interfere with your existing logic.
//Your flow remains:


Customer pays
   ↓
IntaSend sends webhook
   ↓
handleWebhook() updates status
   ↓
//Email sent automatically
//Below is exactly where to add the code.
//1️⃣ Add Admin Email at the Top of the Script
//Place this right under your existing constant.
const SHEET_NAME = "PAYMENTS";
const ADMIN_EMAIL = "admin@featherfield.com";
//Replace with your real admin email.
//2️⃣ Modify the Webhook Handler
Inside your handleWebhook() function, locate this section:

sheet.getRange(i+1,7).setValue(status);

/* Store webhook payload for verification */
sheet.getRange(i+1,9).setValue(JSON.stringify(payload));
Immediately after it, insert the email trigger.
Modified section
JavaScript
Copy code
sheet.getRange(i+1,7).setValue(status);

/* Store webhook payload for verification */
sheet.getRange(i+1,9).setValue(JSON.stringify(payload));

/* SEND EMAIL NOTIFICATION */

sendPaymentEmail(
  data[i][1],  // customer name
  data[i][2],  // customer email
  data[i][0],  // order ID
  data[i][4],  // amount
  status
);
//Explanation of the indexes from your sheet:


data[i][0] = OrderID
data[i][1] = Name
data[i][2] = Email
data[i][3] = Phone
data[i][4] = Amount
//3️⃣ Add the Email Function at the Bottom of the Script
//Add this below your json() helper.

function sendPaymentEmail(customerName,email,orderId,amount,status){

let subject="";
let message="";

if(status === "COMPLETE"){

subject = "Payment Successful - Order " + orderId;

message =
"Hello "+customerName+",\n\n"+
"Your payment was successful.\n\n"+
"Order ID: "+orderId+"\n"+
"Amount: KES "+amount+"\n\n"+
"Thank you for shopping with FeatherField.";

}

if(status === "FAILED"){

subject = "Payment Failed - Order " + orderId;

message =
"Hello "+customerName+",\n\n"+
"Your payment attempt failed.\n\n"+
"Order ID: "+orderId+"\n"+
"Amount: KES "+amount+"\n\n"+
"Please try again.";

}

/* Email customer */

MailApp.sendEmail({
to: email,
subject: subject,
body: message
});

/* Email admin */

MailApp.sendEmail({
to: ADMIN_EMAIL,
subject: subject + " (Admin Notification)",
body:
"Customer: "+customerName+"\n"+
"Email: "+email+"\n"+
"Order ID: "+orderId+"\n"+
"Amount: KES "+amount+"\n"+
"Status: "+status
});

}
//4️⃣ Final Script Flow
//Your backend will now automatically:


Customer clicks Pay
        ↓
initiatePayment()
        ↓
STK Push sent
        ↓
Webhook received
        ↓
handleWebhook()
        ↓
Status updated in sheet
        ↓
sendPaymentEmail()
        ↓
Customer + Admin receive email
//5️⃣ Result
Emails will be sent for:
Event
Email
Payment COMPLETE
Customer + Admin
Payment FAILED
Customer + Admin
