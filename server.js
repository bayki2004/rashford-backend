
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
      const firstKey = Object.keys(files)[0];
      const file = Array.isArray(files[firstKey]) ? files[firstKey][0] : files[firstKey];
      const buffer = await bufferFile(file.filepath);
      const base64 = buffer.toString("base64");
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      console.log("🧠 Sending to GPT-4...");
      const vision = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: "Describe this image as a stylized action figure." },
          {
            role: "user",
            content: [
              { type: "text", text: "Create an image of a stylized plastic action figure of the depicted person, featuring exactly the same characteristics as in the photo, sealed in a collectible blister pack.

The background of the packaging shows something special.

Centered at the top is an 80s-inspired fantasy logo in the style of “Masters of the Universe.” Uppercase letters, blocky, three-dimensional with a perspective effect. The letters should have a metallic gradient (e.g., white to blue), with glowing outer lines (e.g., pink or orange) and a subtle glow. The lettering should appear epic, heroic, and retro. The title says: [MAIN TITLE, e.g., Name, Slogan].

Below that, in bold yellow letters, it says: "[FIRST NAME, LAST NAME]", and beneath that in white text with line breaks: "AITOONS".

The figure is centered inside a transparent plastic shell – displayed as a full character with head, arms, torso, legs, and feet. The figure should be wearing the following: (e.g., pants, top, shoes including color)

To the right of the figure are three miniature accessories possibly similar to the theme of the picture:

[ITEM 1, e.g., crossbow]
[ITEM 2, e.g., apple]
[ITEM 3, e.g., quiver with two arrows]
Each floating in its own compartment. The design is sharp, clean, and hyper-realistic, with a subtle plastic sheen on the figure and a classic 80s-style look." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      });

      
      const prompt = vision.choices[0].message.content;
      console.log("🎯 Raw prompt:", prompt);

      // Clean prompt for DALL·E
      const cleanedPrompt = prompt
        .replace(/[*_~`>#-]/g, "")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      console.log("🧼 Cleaned prompt:", cleanedPrompt);

      const imageGen = await openai.images.generate({
        model: "dall-e-3",
        prompt: cleanedPrompt,
        n: 1,
        size: "1024x1024",
      });


      const imageUrl = imageGen.data[0].url;
      console.log("✅ DALL·E image generated:", imageUrl);

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
