const express = require("express");
const cors = require("cors");
const formidable = require("formidable");
const fs = require("fs");
const { OpenAI, toFile } = require("openai");
require("dotenv").config();

const app = express();
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
      const { title, Name, subtitle, item1, item2, item3 } = fields;

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

Below that, in bold yellow letters, it says: ${Name}, and beneath that in white text: "${subtitle}".

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

app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
