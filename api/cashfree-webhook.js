import crypto from "crypto";
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

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    // 1️⃣ Signature verify (real payments ke liye)
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers["x-webhook-signature"];

    const expectedSignature = crypto
      .createHmac("sha256", process.env.CASHFREE_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("base64");

    if (signature !== expectedSignature) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    // 2️⃣ Sirf SUCCESS payment handle karo
    if (event?.data?.payment?.payment_status !== "SUCCESS") {
      return res.status(200).send("Ignored");
    }

    const orderId = event.data.order.order_id;
    const amount = Number(event.data.order.order_amount);

    // 3️⃣ Order fetch karo (SOURCE OF TRUTH)
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(200).send("Order not found");
    }

    // 🔁 Duplicate protection
    if (orderSnap.data().status === "PAID") {
      return res.status(200).send("Already processed");
    }

    // ✅ YAHAN SE USER ID FIX HAI
    const userId = orderSnap.data().userId;

    // 4️⃣ Order PAID mark
    await orderRef.update({
      status: "PAID",
      paidAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 5️⃣ User WALLET increment (sirf isi user ka)
    await db.collection("users").doc(userId).update({
      wallet: admin.firestore.FieldValue.increment(amount)
    });

    // 6️⃣ Transaction history (REAL record)
    await db.collection("transactions").add({
      userId,
      orderId,
      amount,
      type: "deposit",
      status: "Success",
      upi: "Cashfree",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).send("OK");

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("Webhook error");
  }
}