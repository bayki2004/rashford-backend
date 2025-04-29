
const express = require("express");
const cors = require("cors");
const formidable = require("formidable");
const fs = require("fs");
const { OpenAI, toFile } = require("openai");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);



const app = express();
app.use(express.json({ limit: '10mb' }));  // or even 20mb if needed
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const path = require('path');

// Ensure "orders" folder exists
const ordersDir = path.join(__dirname, 'orders');
if (!fs.existsSync(ordersDir)) {
  fs.mkdirSync(ordersDir);
}

const port = process.env.PORT || 3000;

app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

The background of the packaging shows a lake with mountains scenery.

Centered at the top is an 80s-inspired fantasy logo in the style of “Masters of the Universe.” Uppercase letters, blocky, three-dimensional with a perspective effect. The letters should have a metallic gradient (e.g., white to blue), with glowing outer lines (e.g., pink or orange) and a subtle glow. The title says: ${title}.

Below that, in bold yellow letters, it says: ${name}, and beneath that in white text: "${subtitle}".

The figure is centered inside a transparent plastic shell – displayed as a full character with head, arms, torso, legs, and feet. The figure should be wearing the same clothing and colors as shown in the reference image.

To the right of the figure are exactly three miniature accessories:
- ${item1}
- ${item2}
- ${item3}

Each floating in its own compartment. The design should be sharp, clean, and hyper-realistic, with a subtle plastic sheen on the figure and a classic 80s-style look.
`;

      const rsp = await openai.images.edit({
        model: "gpt-image-1",
        image: [fileToSend],
        prompt: prompt,
        n:2,
      });

      const imagesBase64 = rsp.data.map(img => img.b64_json); // an array of base64 strings

      

      // Save if you want (optional)
      // fs.writeFileSync("output.png", imageBuffer);

      // Send base64 directly
      res.status(200).json({ imagesBase64 });


    } catch (e) {
      console.error("🔥 Error generating:", e);
      res.status(500).json({ error: "Generation failed" });
    }
  });
});
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { imageBase64s, email } = req.body;

    if (!Array.isArray(imageBase64s) || imageBase64s.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }

    const orderTimestamp = Date.now();
    const savedFilenames = [];

    const lineItems = await Promise.all(
      imageBase64s.map(async (base64, index) => {
        const filename = `order-${orderTimestamp}-${index}.png`;
        const filepath = path.join(ordersDir, filename);
        fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
        savedFilenames.push(filename);

        return {
          price_data: {
            currency: "chf",
            product_data: {
              name: `Action Figure #${index + 1}`,
            },
            unit_amount: 500, // $5.00
          },
          quantity: 1,
        };
      })
    );

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}`,
      ...(email && { customer_email: email }) // attach email if given
    });

    // Save order metadata
    const orderMetadata = {
      checkout_id: session.id,
      email: email || null,
      ordered_files: savedFilenames,
      timestamp: new Date().toISOString(),
    };
    const metadataFilePath = path.join(ordersDir, `order-${orderTimestamp}.json`);
    fs.writeFileSync(metadataFilePath, JSON.stringify(orderMetadata, null, 2));

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("🔥 Stripe checkout error:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});


app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
