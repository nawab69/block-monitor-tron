// models/WatchedAddress.ts
import { Schema, model } from "mongoose";

interface IWatchedAddress {
  address: string;
}

const watchedAddressSchema = new Schema<IWatchedAddress>({
  address: { type: String, required: true, unique: true },
});

export const WatchedAddress = model<IWatchedAddress>(
  "WatchedAddress",
  watchedAddressSchema
);
