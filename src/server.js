import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { upsertRestaurants, queryRestaurants } from "./pineconeClient.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Initialize the Google AI Client for the chatbot
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- NEW ENDPOINT TO FIX FRONTEND CORS ---
// In server.js

app.get("/api/get-restaurants", async (req, res) => {
  try {
    // We add a headers object to mimic a real browser request
    const response = await axios.get(
      "https://www.swiggy.com/dapi/restaurants/list/v5?lat=18.002668480081386&lng=79.54484011977911&is-seo-homepage-enabled=true&page_type=DESKTOP_WEB_LISTING",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Failed to fetch from Swiggy API:", error.message);
    res.status(500).json({ error: "Failed to fetch restaurant data" });
  }
});

// Chatbot endpoint
// server.js

app.post("/api/chatbot", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // --- NEW LOGIC: Check for filtering keywords ---
    let relevantRestaurants = await queryRestaurants(message);

    // Example of a simple keyword-based filter for ratings
    const ratingMatch = message.match(/rating above (\d\.\d)/);
    if (ratingMatch) {
      const minRating = parseFloat(ratingMatch[1]);
      relevantRestaurants = relevantRestaurants.filter(
        (r) => r.rating >= minRating
      );
    }

    // You could add more filters here for price, delivery time, etc.

    const restaurantText = relevantRestaurants
      .map(
        (r) =>
          `${r.name} (Rating: ${r.rating}, Cuisines: ${r.cuisines.join(", ")})`
      )
      .join("\n");

    const prompt = `You are a helpful assistant for FoodExpress. User asked: "${message}". Based ONLY on the following data, provide a direct answer. If the data is empty, say you could not find any matching restaurants. Relevant restaurants: ${
      restaurantText || "No relevant restaurant data found."
    }`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const answer = response.text();

    res.json({ answer });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Endpoint for upserting restaurant data
app.post("/api/upsert-restaurants", async (req, res) => {
  try {
    const { restaurants } = req.body;
    await upsertRestaurants(restaurants);
    res.json({ message: "Restaurants upserted successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to upsert restaurants" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
