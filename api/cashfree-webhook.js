import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const payload = JSON.stringify(req.body);
    const signature = req.headers["x-webhook-signature"];

    const expectedSignature = crypto
      .createHmac("sha256", process.env.CASHFREE_WEBHOOK_SECRET)
      .update(payload)
      .digest("base64");

    if (signature !== expectedSignature) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    console.log("Webhook received:", event);

    if (event?.data?.payment?.payment_status === "SUCCESS") {
      const orderId = event.data.order.order_id;
      const amount = event.data.order.order_amount;

      // 🔒 YAHAN DB UPDATE AAYEGA
      // markOrderPaid(orderId)
      // addBalance(userId, amount)
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("Webhook error");
  }
}
