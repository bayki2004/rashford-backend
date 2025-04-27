
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
<<<<<<< HEAD
              {
                type: "text",
                text: `
  Create an image of a stylized plastic action figure of the depicted person, sealed in a collectible blister pack.
  
  Centered at the top is a fantasy logo like “Masters of the Universe,” titled: ${title}.
  
  Below that, bold yellow letters: ${firstName}, and underneath: "${subTitle}".
  
  Next to the figure: 
  - ${item1}
  - ${item2}
  - ${item3}
  
  Design it in a sharp, hyper-realistic 80s style.`,
              },
=======
              { type: "text", text: "Create an action figure from this picture. It should be an image where the person is an action figure doll and has three items which could fit the person such as football or crossbow or something else. Make it a nice sympathetic action figure and keep it PG13" },
>>>>>>> 6966fe235e64cf3f4b05b06b0f0543eea18a1f3a
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      });
  
      const prompt = vision.choices[0].message.content;
      console.log("🎯 Raw prompt:", prompt);
  
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
