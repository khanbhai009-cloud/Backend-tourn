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
    const { matchId, userId, uids } = req.body;
    if (!matchId || !userId || !Array.isArray(uids) || uids.length === 0) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const matchRef = db.collection("matches").doc(matchId);
    const userRef = db.collection("users").doc(userId);
    const joinRef = matchRef.collection("joins").doc(userId);

    await db.runTransaction(async (tx) => {
      const [matchSnap, userSnap, joinSnap] = await Promise.all([
        tx.get(matchRef),
        tx.get(userRef),
        tx.get(joinRef)
      ]);

      if (!matchSnap.exists) throw new Error("Match not found");
      if (!userSnap.exists) throw new Error("User not found");
      if (joinSnap.exists) throw new Error("Already joined");

      const match = matchSnap.data();
      if (match.status !== "upcoming") throw new Error("Join closed");

      const entryFee = Number(match.entryFee || 0);
      const wallet = Number(userSnap.data().wallet || 0);
      if (wallet < entryFee) throw new Error("Insufficient wallet");

      // Duplicate UID check
      const unique = new Set(uids);
      if (unique.size !== uids.length) throw new Error("Duplicate UIDs");

      // Wallet deduct
      tx.update(userRef, {
        wallet: admin.firestore.FieldValue.increment(-entryFee),
        matchesPlayed: admin.firestore.FieldValue.increment(1),
        totalXP: admin.firestore.FieldValue.increment(10) // JOIN XP
      });

      // Join record
      tx.set(joinRef, {
        userId,
        uids,
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Transaction ledger
      tx.set(db.collection("transactions").doc(), {
        userId,
        amount: entryFee,
        type: "debit",
        reason: "match_join",
        matchId,
        status: "Success",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}