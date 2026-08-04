const { MongoMemoryServer } = require('mongodb-memory-server');
const localtunnel = require('localtunnel');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Catbox upload helper
async function uploadToCatbox(filePath) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath));
  
  const response = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    timeout: 60000
  });
  return response.data.trim();
}

async function main() {
  console.log('📦 Starting portable local MongoDB database in-memory...');
  const mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Set environment variables for the server boot
  process.env.MONGODB_URI = mongoUri;
  process.env.PORT = '5000';
  process.env.NODE_ENV = 'development';
  process.env.HF_SPACE = 'false';

  console.log('🔌 Connecting to temporary database to insert your credentials...');
  await mongoose.connect(mongoUri);
  
  // Import the compiled Settings model from the server build to prevent OverwriteModelError
  const Settings = require('./dist/models/Settings').default;

  // Insert settings (valid Meta token and Instagram Business ID)
  // We keep proxyUrl empty because Facebook does not block residential internet connections!
  await Settings.create({
    key: 'global',
    metaAccessToken: 'EAAXy721o5VgBSMujc2NubafL8jNzazTaXb9Fl7kyvnjzHvXPX0ZCwT5TT1zjMf0V1HB8EAZC766qvMWpbjWtquWfWgZBCKYePXniF0FVpS7RSToRgMn0bwFLDS2S7M9atB73jGMI8J4AtIeFRyPPjhLbBAhL5wda8K8WUxm6NyDOZB9Cp7IRYONJnOzl',
    instagramAccountId: '17841424719359477',
    proxyUrl: ''
  });
  console.log('✅ Temporary credentials registered successfully!');
  await mongoose.disconnect();

  console.log('🌐 Opening public localtunnel on port 5000 for routing...');
  const tunnel = await localtunnel({ port: 5000 });
  process.env.PUBLIC_URL = tunnel.url;
  console.log(`🌍 Public Tunnel Address: ${process.env.PUBLIC_URL}`);

  // Mock fetchVideos to return our local vertical video served from localhost
  console.log('🎭 Injecting Mock Media Service...');
  const mediaService = require('./dist/services/mediaService');
  mediaService.fetchVideos = async (query, perPage) => {
    console.log(`🎭 [Mock API] Returning vertical video served locally from localhost...`);
    return [{
      id: 'mock_local_vertical_video',
      url: 'http://localhost:5000/temp/reel_vid_1785731785249.mp4',
      previewUrl: 'https://images.pexels.com/photos/326055/pexels-photo-326055.jpeg',
      source: 'pexels',
      type: 'video'
    }];
  };

  // Mock uploadToPublicHost to upload to Catbox for stable Meta downloads
  console.log('🚀 Injecting Catbox Mock Host...');
  const videoService = require('./dist/services/videoService');
  videoService.uploadToPublicHost = async (filePath) => {
    console.log('🚀 [Mock Host] Uploading processed video to Catbox for stable delivery...');
    try {
      const catboxUrl = await uploadToCatbox(filePath);
      console.log(`✅ [Mock Host] Video uploaded successfully to: ${catboxUrl}`);
      return { url: catboxUrl, fileName: path.basename(filePath) };
    } catch (err) {
      console.error('❌ [Mock Host] Catbox upload failed, falling back to localtunnel:', err.message);
      const fileName = path.basename(filePath);
      const url = `${process.env.PUBLIC_URL}/temp/${fileName}`;
      return { url, fileName };
    }
  };

  console.log('🚀 Booting up the local Express engine...');
  // Require index.js which connects to MONGODB_URI and starts Express
  require('./dist/index.js');

  // Wait 5 seconds for Express to boot up and connect, then trigger the posting cycle
  setTimeout(async () => {
    console.log('\n🎬 Tricking Auto-Pilot to run scrape & post cycle immediately on localhost...');
    try {
      const { runAutoPilot } = require('./dist/services/schedulerService');
      await runAutoPilot(true);
      console.log('✅ Localhost Auto-Pilot run complete.');
    } catch (err) {
      console.error('❌ Localhost Auto-Pilot failed:', err.message);
    }
  }, 5000);
}

main().catch(err => {
  console.error('Initialization failed:', err);
  process.exit(1);
});
