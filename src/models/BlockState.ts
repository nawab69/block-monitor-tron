// models/BlockState.ts
import { Schema, model } from "mongoose";

interface IBlockState {
  _id: string; // Use a fixed _id for singleton pattern
  lastBlockNumber: number;
}

const blockStateSchema = new Schema<IBlockState>({
  _id: { type: String, required: true, default: "singleton" },
  lastBlockNumber: { type: Number, required: true },
});

export const BlockState = model<IBlockState>("BlockState", blockStateSchema);
