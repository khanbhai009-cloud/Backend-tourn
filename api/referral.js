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

    /**
     * 1️⃣ REGISTER REFERRAL (on signup)
     * userId = new user
     * referrerId = inviter
     */
    if (action === "register") {
      const { userId, referrerId } = req.body;

      if (!userId || !referrerId) throw new Error("Invalid payload");
      if (userId === referrerId) throw new Error("Self referral blocked");

      const refDoc = db.collection("referrals").doc(userId);
      const snap = await refDoc.get();

      if (snap.exists) {
        return res.status(200).json({ message: "Referral already registered" });
      }

      await refDoc.set({
        userId,
        referrerId,
        rewardGiven: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ success: true });
    }

    /**
     * 2️⃣ RELEASE REWARD (after FIRST match join)
     * called internally from join-match.js
     */
    if (action === "reward") {
      const { userId } = req.body;

      const refDoc = db.collection("referrals").doc(userId);
      const snap = await refDoc.get();

      if (!snap.exists) {
        return res.status(200).json({ message: "No referral found" });
      }

      const ref = snap.data();
      if (ref.rewardGiven) {
        return res.status(200).json({ message: "Reward already given" });
      }

      const referrerRef = db.collection("users").doc(ref.referrerId);

      await db.runTransaction(async (tx) => {
        const referrerSnap = await tx.get(referrerRef);
        if (!referrerSnap.exists) throw new Error("Referrer not found");

        // 🔥 REWARD (customize)
        tx.update(referrerRef, {
          wallet: admin.firestore.FieldValue.increment(50), // coins
          totalXP: admin.firestore.FieldValue.increment(20)
        });

        tx.update(refDoc, {
          rewardGiven: true,
          rewardedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        tx.set(db.collection("transactions").doc(), {
          userId: ref.referrerId,
          amount: 50,
          type: "credit",
          reason: "referral_reward",
          status: "Success",
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      return res.status(200).json({ success: true });
    }

    throw new Error("Unknown action");

  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}