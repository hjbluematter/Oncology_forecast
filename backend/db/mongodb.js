const { MongoClient } = require("mongodb");

let client = null;
let db = null;
let connectionState = "disconnected"; // "disconnected" | "connecting" | "connected" | "error"
let connectionError = null;

async function connect() {
  if (connectionState === "connected") return db;
  if (connectionState === "connecting") {
    // Wait for the in-progress connection
    await new Promise(resolve => setTimeout(resolve, 500));
    return db;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("<db_password>") || uri.trim() === "") {
    connectionState = "error";
    connectionError = "MONGODB_URI not configured in backend/.env";
    return null;
  }

  connectionState = "connecting";
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || "oncoforecast");
    connectionState = "connected";
    connectionError = null;
    console.log("✓ MongoDB Atlas connected");
    return db;
  } catch (err) {
    connectionState = "error";
    connectionError = err.message;
    console.error("✗ MongoDB Atlas connection failed:", err.message);
    return null;
  }
}

function getStatus() {
  return { state: connectionState, error: connectionError };
}

function getDb() {
  return db;
}

module.exports = { connect, getStatus, getDb };
