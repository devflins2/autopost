import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
  key: string;
  metaAccessToken?: string;
  instagramAccountId?: string;
  facebookPageId?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  hfToken?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
  songLinks?: string;
  proxyUrl?: string;
  metaBaseUrl?: string;
  telegramBaseUrl?: string;
}

const SettingsSchema: Schema = new Schema({
  key: { type: String, required: true, unique: true, default: 'global' },
  metaAccessToken: { type: String, default: '' },
  instagramAccountId: { type: String, default: '' },
  facebookPageId: { type: String, default: '' },
  telegramBotToken: { type: String, default: '' },
  telegramChatId: { type: String, default: '' },
  hfToken: { type: String, default: '' },
  pexelsApiKey: { type: String, default: '' },
  pixabayApiKey: { type: String, default: '' },
  songLinks: { type: String, default: '' },
  proxyUrl: { type: String, default: '' },
  metaBaseUrl: { type: String, default: '' },
  telegramBaseUrl: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model<ISettings>('Settings', SettingsSchema);
