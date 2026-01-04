import fetch from "node-fetch";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_ADMIN_JSON)
    )
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, userId } = req.body;

    if (!amount || amount <= 0 || !userId) {
      return res.status(400).json({ error: "Invalid data" });
    }

    const orderId = "order_" + Date.now();

    // 🔒 Save order as PENDING
    await db.collection("orders").doc(orderId).set({
      userId,
      amount,
      status: "PENDING",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const response = await fetch("https://sandbox.cashfree.com/pg/orders", {
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
    });

    const data = await response.json();

    return res.status(200).json({
      order_id: orderId,
      payment_session_id: data.payment_session_id
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
