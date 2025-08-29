import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Initialize the Google AI Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initialize Pinecone
const pineconeClient = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});
const index = pineconeClient.index("restaurants");

const embeddingModel = genAI.getGenerativeModel({
  model: "text-embedding-004",
});

// --- REWRITTEN to use Google's Official Library ---
export async function createEmbedding(text) {
  try {
    // This now uses the embeddingModel defined at the top of the file
    const result = await embeddingModel.embedContent(text);
    const embedding = result.embedding;
    return embedding.values;
  } catch (error) {
    console.error("Error creating Gemini embedding:", error);
    throw error;
  }
}

// --- Upsert Restaurants into Pinecone ---
// In pineconeClient.js

export async function upsertRestaurants(restaurants) {
  try {
    // This mapping is now safer and handles missing data
    const texts = restaurants.map(
      (rest) =>
        `${rest.name || ""} - ${(rest.cuisines || []).join(
          ", "
        )} - Delivery time: ${
          rest.deliveryTime || "N/A"
        } mins - Cost for two: ${rest.costForTwo || "N/A"}`
    );

    const result = await embeddingModel.batchEmbedContents({
      requests: texts.map((text) => ({ content: { parts: [{ text }] } })),
    });
    const embeddings = result.embeddings;

    if (embeddings.length !== restaurants.length) {
      throw new Error(
        "Mismatch between number of restaurants and embeddings received."
      );
    }

    const vectors = restaurants.map((rest, i) => ({
      id: rest.id.toString(),
      values: embeddings[i].values,
      metadata: rest,
    }));

    await index.upsert(vectors);
    console.log(
      `Successfully upserted ${vectors.length} vectors in a single batch.`
    );
  } catch (error) {
    // For debugging, let's see the full error on the server
    console.error("Full error in batch upsert process:", error);
    throw error;
  }
}

// --- Query Pinecone for Matching Restaurants ---
export async function queryRestaurants(userQuery) {
  try {
    const queryEmbedding = await createEmbedding(userQuery);
    const queryResponse = await index.query({
      topK: 5,
      includeMetadata: true,
      vector: queryEmbedding,
    });
    return queryResponse.matches.map((match) => match.metadata);
  } catch (error) {
    console.error("Pinecone query error:", error);
    throw error;
  }
}
