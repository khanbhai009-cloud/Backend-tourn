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
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { action } = req.body;

    // 1️⃣ USER → create withdrawal request
    if (action === "request_withdraw") {
      const { userId, amount, upi } = req.body;
      if (!userId || !amount || amount <= 0) throw new Error("Invalid request");

      const userRef = db.collection("users").doc(userId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new Error("User not found");

        const wallet = Number(snap.data().wallet || 0);
        if (wallet < amount) throw new Error("Insufficient wallet");

        tx.update(userRef, {
          wallet: admin.firestore.FieldValue.increment(-amount)
        });

        tx.set(db.collection("withdrawals").doc(), {
          userId,
          amount,
          upi,
          status: "PENDING",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      return res.status(200).json({ success: true });
    }

    // 2️⃣ ADMIN → approve / reject withdrawal
    if (action === "admin_update") {
      const { withdrawalId, status } = req.body;
      if (!withdrawalId || !["APPROVED", "REJECTED"].includes(status)) {
        throw new Error("Invalid admin action");
      }

      const ref = db.collection("withdrawals").doc(withdrawalId);
      await ref.update({
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ success: true });
    }

    throw new Error("Unknown action");

  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}