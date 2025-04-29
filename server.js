const express = require("express");
const cors = require("cors");
const formidable = require("formidable");
const fs = require("fs");
const path = require("path");
const { OpenAI, toFile } = require("openai");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure "orders" folder exists
const ordersDir = path.join(__dirname, 'orders');
if (!fs.existsSync(ordersDir)) {
  fs.mkdirSync(ordersDir);
}

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// === 1. Image Generation ===
app.post("/generate-image", (req, res) => {
  const form = new formidable.IncomingForm({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("🛑 Form parse error:", err);
      return res.status(500).json({ error: "Form parse failed" });
    }

    try {
      const { title, name, subtitle, item1, item2, item3 } = fields;

      const fileKey = Object.keys(files)[0];
      const file = Array.isArray(files[fileKey]) ? files[fileKey][0] : files[fileKey];
      const fileStream = fs.createReadStream(file.filepath);
      const fileToSend = await toFile(fileStream, file.originalFilename || "uploaded-image.png", {
        type: file.mimetype || "image/png",
      });

      const prompt = `
Create an image of a stylized plastic action figure of the depicted person in the reference picture, featuring exactly the same characteristics as in the photo, sealed in a collectible blister pack.
The background shows a lake with mountains.
Top logo: ${title}
Below: ${name} / ${subtitle}
Three accessories:
- ${item1}
- ${item2}
- ${item3}
`;

      const rsp = await openai.images.edit({
        model: "gpt-image-1",
        image: [fileToSend],
        prompt: prompt,
        n: 2,
      });

      const imagesBase64 = rsp.data.map(img => img.b64_json);
      res.status(200).json({ imagesBase64 });

    } catch (e) {
      console.error("🔥 Error generating:", e);
      res.status(500).json({ error: "Generation failed" });
    }
  });
});

// === 2. Create Stripe Checkout Session ===
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { imageBase64s } = req.body;

    if (!Array.isArray(imageBase64s) || imageBase64s.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }

    const timestamp = Date.now();

    // Save each image locally
    const savedFilenames = imageBase64s.map((base64, index) => {
      const filename = `order-${timestamp}-${index}.png`;
      const filepath = path.join(ordersDir, filename);
      fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
      return filename;
    });

    // Save initial order file (for linking later)
    fs.writeFileSync(
      path.join(ordersDir, `order-${timestamp}.json`),
      JSON.stringify({ images: savedFilenames, paid: false })
    );

    const lineItems = savedFilenames.map((_, idx) => ({
      price_data: {
        currency: "chf",
        product_data: {
          name: `Action Figure #${idx + 1}`,
        },
        unit_amount: 500, // 5 CHF per figure
      },
      quantity: 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}`,
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'FR', 'AT', 'IT'],
      },
      metadata: {
        order_id: `order-${timestamp}`
      }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("🔥 Stripe checkout error:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

// === 3. Stripe Webhook ===
app.post("/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("⚡️ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata.order_id;
    const customerEmail = session.customer_details.email;
    const customerAddress = session.shipping_details.address;

    console.log(`✅ Payment received for ${orderId}`);

    // Update order file
    const orderFilePath = path.join(ordersDir, `${orderId}.json`);
    const orderData = JSON.parse(fs.readFileSync(orderFilePath));
    orderData.paid = true;
    orderData.customerEmail = customerEmail;
    orderData.customerAddress = customerAddress;
    fs.writeFileSync(orderFilePath, JSON.stringify(orderData, null, 2));

    // Send yourself an email
    await transporter.sendMail({
      from: process.env.EMAIL_USERNAME,
      to: process.env.ADMIN_EMAIL,
      subject: `New Action Figure Order: ${orderId}`,
      text: `New order!\nEmail: ${customerEmail}\nAddress: ${JSON.stringify(customerAddress, null, 2)}`,
      attachments: orderData.images.map(filename => ({
        filename,
        path: path.join(ordersDir, filename),
      })),
    });
  }

  res.status(200).end();
});

// === 4. Home Route ===
app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

// === 5. Start Server ===
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
