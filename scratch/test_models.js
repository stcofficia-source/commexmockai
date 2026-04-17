const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  try {
    console.log("Checking gemini-2.0-flash...");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent("test");
    console.log("gemini-2.0-flash works!");
  } catch (err) {
    console.error("gemini-2.0-flash failed:", err.message);
  }

  try {
    console.log("Checking gemini-pro...");
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("test");
    console.log("gemini-pro works!");
  } catch (err) {
    console.error("gemini-pro failed:", err.message);
  }
}

listModels();
