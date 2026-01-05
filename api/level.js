import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_ADMIN_JSON)
    )
  });
}
const db = admin.firestore();

// Level formula
const calcLevel = (xp) => Math.floor(Math.sqrt(xp / 100));

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId, xp } = req.body;
    if (!userId || !Number.isFinite(xp) || xp <= 0) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const userRef = db.collection("users").doc(userId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error("User not found");

      const totalXP = Number(snap.data().totalXP || 0) + xp;
      const level = calcLevel(totalXP);

      tx.update(userRef, {
        totalXP,
        level
      });
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}