const express = require("express");
const cors = require("cors");
const formidable = require("formidable");
const fs = require("fs");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function bufferFile(filePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

app.post("/generate-image", (req, res) => {
  const form = new formidable.IncomingForm({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("🛑 Form parse error:", err);
      return res.status(500).json({ error: "Form parse failed" });
    }

    try {
      const { title, firstName, subTitle, item1, item2, item3 } = fields;

      if (!files || Object.keys(files).length === 0) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      const firstKey = Object.keys(files)[0];
      const file = Array.isArray(files[firstKey]) ? files[firstKey][0] : files[firstKey];
      const buffer = await bufferFile(file.filepath);

      const prompt = `
Create an image of a stylized plastic action figure of the depicted person in the reference picture, featuring exactly the same characteristics as in the photo, sealed in a collectible blister pack.

The background of the packaging shows a lake with mountains scenery.

Centered at the top is an 80s-inspired fantasy logo in the style of “Masters of the Universe.” Uppercase letters, blocky, three-dimensional with a perspective effect. The letters should have a metallic gradient (e.g., white to blue), with glowing outer lines (e.g., pink or orange) and a subtle glow. The title says: ${title}.

Below that, in bold yellow letters, it says: ${firstName}, and beneath that in white text with line breaks: "${subTitle}".

The figure is centered inside a transparent plastic shell – displayed as a full character with head, arms, torso, legs, and feet. The figure should be wearing the same clothing and colors as shown in the reference image.

To the right of the figure are three miniature accessories:
- ${item1}
- ${item2}
- ${item3}

Each floating in its own compartment. The design should be sharp, clean, and hyper-realistic, with a subtle plastic sheen on the figure and a classic 80s-style look.
      `.trim();

      console.log("🎯 Sending to GPT-Image-1...");

      const result = await openai.images.edit({
        model: "gpt-image-1",
        prompt: prompt,
        image: [buffer],
        response_format: "url", // 📢 Tell OpenAI we want a simple image URL
      });

      const imageUrl = result.data[0].url; // <- now it's a URL!

      console.log("✅ Image generated:", imageUrl);

      res.status(200).json({ prompt, imageUrl });

    } catch (e) {
      console.error("🔥 Error generating:", e);
      res.status(500).json({ error: "Generation failed" });
    }
  });
});

app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
