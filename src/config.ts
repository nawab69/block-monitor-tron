import dotenv from "dotenv";

dotenv.config();

export const config = {
  fullNode: process.env.FULL_NODE,
  apiKey: process.env.API_KEY,
};
