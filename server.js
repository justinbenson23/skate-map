require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const B2 = require('backblaze-b2');
const mongoose = require('mongoose');
const Pin = require('./models/Pin');
const fs = require('fs');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB via Mongoose'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/uploads/';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
// ===== Multer setup for media uploads =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/mp4') {
      cb(null, true);
    } else {
      cb(new Error('Only .mp4 videos are allowed.'));
    }
  }
});

// ===== Backblaze B2 setup =====
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});

// ===== Helper to upload to B2 =====
async function uploadToB2(buffer, filename, contentType) {
  await b2.authorize();
  const { data: uploadUrlData } = await b2.getUploadUrl({ bucketId: process.env.B2_BUCKET_ID });
  const { uploadUrl, authorizationToken } = uploadUrlData;

  await b2.uploadFile({
    uploadUrl,
    uploadAuthToken: authorizationToken,
    fileName: filename,
    data: buffer,
    mime: contentType,
  });

  return `https://f000.backblazeb2.com/file/${process.env.B2_BUCKET_ID}/${filename}`;
}

// ===== API Routes =====

// Get all pins (with optional filtering)
app.get('/api/pins', async (req, res) => {
  const { filter } = req.query;
  let sort = { timestamp: -1 };

  if (filter === 'popular') sort = { likesCount: -1 };
  if (filter === 'newest') sort = { timestamp: -1 };

  try {
    const pins = await Pin.find({ flagged: { $ne: true } }).sort(sort).limit(100);
    res.json(pins);
  } catch (err) {
    console.error('Error fetching pins:', err);
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
});

// Submit pin with media
app.post('/api/pins-with-media', upload.single('video'), async (req, res) => {
  try {
    const { title, description, x_pct, y_pct } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Video file is required.' });
    }

    const pin = new Pin({
      title,
      description,
      x_pct,
      y_pct,
      videoUrl: `/uploads/${req.file.filename}`
    });

    await pin.save();
    res.status(200).json({ message: 'Pin saved successfully', pin });
  } catch (error) {
    console.error('Error saving pin:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// Toggle complete (no auth → use IP or cookie if needed later)
app.post('/api/pin/:id/toggle-complete', async (req, res) => {
  try {
    const pin = await Pin.findById(req.params.id);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });

    pin.completed = !pin.completed;
    await pin.save();
    res.json({ completed: pin.completed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle complete' });
  }
});

// Toggle like (no auth)
app.post('/api/pin/:id/toggle-like', async (req, res) => {
  try {
    const pin = await Pin.findById(req.params.id);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });

    pin.likesCount = (pin.likesCount || 0) + 1;
    await pin.save();
    res.json({ likesCount: pin.likesCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to like pin' });
  }
});

// Add comment
app.post('/api/pin/:id/comment', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Comment required' });

  try {
    const pin = await Pin.findById(req.params.id);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });

    pin.comments.push({ text });
    await pin.save();
    res.json(pin.comments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to comment' });
  }
});

// Report pin
app.post('/api/pin/:id/report', async (req, res) => {
  try {
    const pin = await Pin.findById(req.params.id);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });

    pin.flagged = true;
    await pin.save();

    res.json({ message: 'Pin flagged successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to flag pin' });
  }
});
const adminAuth = (req, res, next) => {
  const adminKey = req.query.key || req.body.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).send('Forbidden: Invalid admin key');
  }
  next();
};

app.get('/admin/flagged-pins', adminAuth, async (req, res) => {
  const pins = await Pin.find({ flagged: true }).sort({ timestamp: -1 });

  const html = `
    <html>
      <head>
        <title>Flagged Pins</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          .pin { border: 1px solid #ccc; padding: 12px; margin-bottom: 10px; }
          img, video { max-width: 300px; display: block; margin-top: 10px; }
          button { margin-right: 10px; }
        </style>
      </head>
      <body>
        <h1>🚩 Flagged Pins</h1>
        ${pins.map(pin => `
          <div class="pin">
            <strong>${pin.title}</strong><br>
            ${pin.description}<br>
            ${pin.mediaType === 'image' 
              ? `<img src="${pin.mediaUrl}" />` 
              : `<video src="${pin.mediaUrl}" controls></video>`}
            <form method="POST" action="/admin/pin/${pin._id}/unflag?key=${req.query.key}" style="display:inline;">
              <button type="submit">✅ Unflag</button>
            </form>
            <form method="POST" action="/admin/pin/${pin._id}/delete?key=${req.query.key}" style="display:inline;">
              <button type="submit">🗑️ Delete</button>
            </form>
          </div>
        `).join('')}
      </body>
    </html>
  `;
  res.send(html);
});

app.post('/admin/pin/:id/unflag', adminAuth, async (req, res) => {
  await Pin.findByIdAndUpdate(req.params.id, { flagged: false });
  res.redirect('/admin/flagged-pins?key=' + req.query.key);
});

app.post('/admin/pin/:id/delete', adminAuth, async (req, res) => {
  await Pin.findByIdAndDelete(req.params.id);
  res.redirect('/admin/flagged-pins?key=' + req.query.key);
});


console.log("Env ADMIN_KEY:", process.env.ADMIN_KEY);

// Admin route middleware
const requireAdmin = (req, res, next) => {
  const key = req.query.key;
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// View all pins
app.get('/api/admin/pins', requireAdmin, async (req, res) => {
  try {
    const pins = await Pin.find().sort({ timestamp: -1 });
    res.json(pins);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get pins' });
  }
});

// Delete pin
app.delete('/api/admin/pin/:id', requireAdmin, async (req, res) => {
  await Pin.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Unflag pin
app.post('/api/admin/pin/:id/unflag', requireAdmin, async (req, res) => {
  await Pin.findByIdAndUpdate(req.params.id, { flagged: false });
  res.json({ success: true });
});


// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
