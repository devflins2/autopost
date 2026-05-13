import axios from 'axios';

const HF_TOKEN = process.env.HF_TOKEN;
const MODEL_URL = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2";

/**
 * Generates a high-engagement nature caption using Hugging Face Inference API.
 * Falls back to template system if API fails or Token is missing.
 */
export const generateSmartCaption = async (keyword: string): Promise<string> => {
  if (HF_TOKEN) {
    try {
      const prompt = `Write a short, poetic, and engaging Instagram Reel caption about "${keyword}". Include emojis. Stay under 30 words. Do not include hashtags yet.`;
      
      const response = await axios.post(
        MODEL_URL,
        { inputs: prompt, parameters: { max_new_tokens: 60, temperature: 0.7 } },
        { headers: { Authorization: `Bearer ${HF_TOKEN}` } }
      );

      let caption = response.data[0]?.generated_text || '';
      caption = caption.replace(prompt, '').trim();
      
      if (caption) {
        const hashtags = [
          '#nature', '#aesthetic', '#flora', '#peaceful', '#wilderness', 
          '#naturelovers', '#earth', '#explore', `#${keyword.replace(/\s+/g, '')}`
        ].join(' ');

        return `${caption}\n.\n.\n${hashtags}`;
      }
    } catch (error: any) {
      console.warn('⚠️ Hugging Face API Error, falling back to templates:', error.message);
    }
  }

  const templates = [
    `The whispers of the wild are calling. 🌿✨ Let the peace of "${keyword}" fill your soul. 🌍💫`,
    `Finding magic in the simple moments of nature. 🌸 "${keyword}" in its most vibrant form. ✨🌿`,
    `Nature doesn't hurry, yet everything is accomplished. 🍃 Capturing the serene essence of "${keyword}". 🌲✨`,
    `Lost in the rhythm of the wild. 🌊 The soul of "${keyword}" is where I find my peace. 🌍💫`
  ];

  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  const hashtags = ['#nature', '#aesthetic', '#flora', `#${keyword.replace(/\s+/g, '')}`, '#explore'].join(' ');

  return `${randomTemplate}\n.\n.\n${hashtags}`;
};
