import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, userId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const orderId = "order_" + Date.now();

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
          customer_id: userId || "guest_user",
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
    console.error("Create order error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
