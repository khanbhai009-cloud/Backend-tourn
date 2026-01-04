import crypto from "crypto";
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
    return res.status(405).send("Method not allowed");
  }

  try {
    const payload = JSON.stringify(req.body);
    const signature = req.headers["x-webhook-signature"];

    const expected = crypto
      .createHmac("sha256", process.env.CASHFREE_WEBHOOK_SECRET)
      .update(payload)
      .digest("base64");

    if (signature !== expected) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    if (event?.data?.payment?.payment_status === "SUCCESS") {
      const orderId = event.data.order.order_id;
      const amount = event.data.order.order_amount;

      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();

      // 🔁 Duplicate protection
      if (!orderSnap.exists || orderSnap.data().status === "PAID") {
        return res.status(200).send("Already processed");
      }

      const userId = orderSnap.data().userId;

      // ✅ Mark order PAID
      await orderRef.update({
        status: "PAID",
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // ✅ Add balance to user
      await db.collection("users").doc(userId).set(
        {
          balance: admin.firestore.FieldValue.increment(amount)
        },
        { merge: true }
      );
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error(err);
    return res.status(500).send("Webhook error");
  }
}
