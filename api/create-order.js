import admin from "firebase-admin";

// 🔥 Firebase Admin init (once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_ADMIN_JSON)
    )
  });
}
const db = admin.firestore();

export default async function handler(req, res) {

  // ✅ CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, userId } = req.body;

    if (!amount || amount <= 0 || !userId) {
      return res.status(400).json({ error: "Invalid amount or userId" });
    }

    const orderId = "order_" + Date.now();

    // 1️⃣ Save order
    await db.collection("orders").doc(orderId).set({
      orderId,
      userId,
      amount,
      status: "PENDING",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2️⃣ Create Cashfree order (Sandbox)
    const response = await fetch(
      "https://sandbox.cashfree.com/pg/orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET_KEY,
          "x-api-version": "2023-08-01"
        },
        body: JSON.stringify({
          order_id: orderId,
          order_amount: amount,
          order_currency: "INR",
          customer_details: {
            customer_id: userId,
            customer_phone: "9999999999"
          }
        })
      }
    );

    const data = await response.json();

    if (!data.payment_session_id) {
      return res.status(500).json({
        error: "Cashfree order creation failed",
        data
      });
    }

    // 3️⃣ Return session id
    return res.status(200).json({
      orderId,
      payment_session_id: data.payment_session_id
    });

  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}