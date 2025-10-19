require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const B2 = require('backblaze-b2');
const mongodb = require('mongodb');
const Pin = require('./models/Pin'); // Load model
const passport = require('passport');
const session = require('express-session');
const LocalStrategy = require('passport-local').Strategy;
const User = require('./models/User');

mongodb.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
// ===== In-memory pin store (replace with DB later) =====
//===let pins = [];
// --- Session & Passport setup ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'some default secret', 
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // secure: true, // only use in production with HTTPS
    sameSite: 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Local Strategy
passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return done(null, false, { message: 'Incorrect username.' });
    }
    const ok = await user.verifyPassword(password);
    if (!ok) {
      return done(null, false, { message: 'Incorrect password.' });
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user._id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// ===== Multer setup for media uploads =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // Max file size = 25MB
  },
});

// ===== Backblaze B2 setup =====
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});

// ===== Upload helper =====
async function uploadToB2(buffer, filename, contentType) {
  await b2.authorize(); // must be done before any call

  const { data: uploadUrlData } = await b2.getUploadUrl({
    bucketId: process.env.B2_BUCKET_ID,
  });

  const { uploadUrl, authorizationToken } = uploadUrlData;

  await b2.uploadFile({
    uploadUrl,
    uploadAuthToken: authorizationToken,
    fileName: filename,
    data: buffer,
    mime: contentType,
  });

  // Construct public URL
  return `https://f000.backblazeb2.com/file/${process.env.B2_BUCKET_ID}/${filename}`;
}

// --- Authentication Routes ---

// Signup
app.post('/auth/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: 'Username already taken.' });
    }
    const user = await User.register(username, password);
    req.login(user, err => {
      if (err) return res.status(500).json({ error: 'Login after signup failed.' });
      return res.json({ message: 'Signup successful', user: { id: user._id, username: user.username } });
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Login
app.post('/auth/login', passport.authenticate('local'), (req, res) => {
  res.json({ message: 'Login successful', user: { id: req.user._id, username: req.user.username } });
});

// Logout
app.post('/auth/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.json({ message: 'Logged out' });
  });
});

// --- Middleware to require authentication for certain routes ---
//function ensureAuthenticated(req, res, next) {
  //if (req.isAuthenticated && req.isAuthenticated()) {
   // return next();
 // }
 // return res.status(401).json({ error: 'Authentication required' });
//}

// --- Pin routes: only authenticated users can post with media ---

const bcrypt = require('bcrypt');
const crypto = require('crypto');

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Authentication required' });
};

app.get('/api/user/profile', ensureAuthenticated, async (req, res) => {
  // you may want to hide sensitive fields
  res.json({ id: req.user._id, username: req.user.username });
});

app.get('/api/pins', async (req, res) => {
  try {
    const pins = await Pin.find().sort({ timestamp: -1 });
    res.json(pins);
  } catch (err) {
    console.error('Fetch pins error:', err);
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
});
// User’s pins
app.get('/api/user/pins', ensureAuthenticated, async (req, res) => {
  try {
    const pins = await Pin.find({ userId: req.user._id }).sort({ timestamp: -1 });
    res.json(pins);
  } catch (err) {
    console.error('Error fetching user pins:', err);
    res.status(500).json({ error: 'Failed to fetch your pins' });
  }
});

app.post('/api/pins-with-media', ensureAuthenticated, upload.single('media'), async (req, res) => {
  try {
    // reuse your file handling logic
    const file = req.file;
    const { title, description, x_pct, y_pct } = req.body;
    if (!file) return res.status(400).json({ error: 'Media file required' });

    const mime = file.mimetype;
    let mediaType;
    if (mime.startsWith('image/')) {
      if (file.size > 1 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image too large' });
      }
      mediaType = 'image';
    } else if (mime.startsWith('video/')) {
      mediaType = 'video';
    } else {
      return res.status(400).json({ error: 'Unsupported media type' });
    }

    // Create a unique filename
    const ext = path.extname(file.originalname);
    const filename = `pins/${Date.now()}_${Math.random().toString(36).substring(2)}${ext}`;

    // Upload to B2
    const mediaUrl = await uploadToB2(file.buffer, filename, mime);

    // Create pin object
    const newPin = new Pin({
      userId: req.user._id,
      title,
      description,
      x_pct: parseFloat(x_pct),
      y_pct: parseFloat(y_pct),
      mediaType,
      mediaUrl
  });

    const savedPin = await new Pin(newPin).save();
    res.json(savedPin);
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});
// Change password
app.post('/api/user/change-password', ensureAuthenticated, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  try {
    const user = await User.findById(req.user._id);
    const match = await user.verifyPassword(currentPassword);
    if (!match) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const saltRounds = 10;
    user.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Password change failed' });
  }
});

// Request reset
app.post('/auth/request-reset', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }
  const user = await User.findOne({ username });
  // Whether or not user exists, respond with success to avoid enumeration
  if (user) {
    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 3600 * 1000; // 1 hour

    user.resetToken = token;
    user.resetTokenExpiry = new Date(expiry);
    await user.save();

    // In real: send token via email link
    // For now, return token so user can test
    res.json({ message: 'If account exists, reset link is available', token });
    return;
  }
  // Always respond success
  res.json({ message: 'If account exists, reset link is available' });
});

// Serve reset‑password UI (could be static page)
app.get('/reset-password', (req, res) => {
  // Serve your reset-password.html (in public folder)
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Perform reset
app.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token & new password required' });
  }
  const user = await User.findOne({
    resetToken: token,
    resetTokenExpiry: { $gt: Date.now() }
  });
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  await user.setPassword(newPassword);
  res.json({ message: 'Password reset successful' });
});

// Delete a pin
app.delete('/api/pin/:id', ensureAuthenticated, async (req, res) => {
  const pinId = req.params.id;
  try {
    const pin = await Pin.findById(pinId);
    if (!pin) {
      return res.status(404).json({ error: 'Pin not found' });
    }
    if (!pin.userId.equals(req.user._id)) {
      return res.status(403).json({ error: 'Not authorized to delete this pin' });
    }
    await pin.deleteOne();
    res.json({ message: 'Pin deleted' });
  } catch (err) {
    console.error('Delete pin error:', err);
    res.status(500).json({ error: 'Failed to delete pin' });
  }
});

// Toggle “completed” for a pin
app.post('/api/pin/:id/toggle-complete', ensureAuthenticated, async (req, res) => {
  const pinId = req.params.id;
  const userId = req.user._id;
  try {
    const pin = await Pin.findById(pinId);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });

    const idx = pin.completedBy.findIndex(uid => uid.equals(userId));
    if (idx >= 0) {
      // already completed, so remove
      pin.completedBy.splice(idx, 1);
    } else {
      pin.completedBy.push(userId);
    }
    await pin.save();
    res.json({ completedBy: pin.completedBy });
  } catch (err) {
    console.error('toggle-complete error', err);
    res.status(500).json({ error: 'Failed to toggle completed' });
  }
});

// Like / unlike a pin
app.post('/api/pin/:id/toggle-like', ensureAuthenticated, async (req, res) => {
  const pinId = req.params.id;
  const userId = req.user._id;
  try {
    const pin = await Pin.findById(pinId);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });

    const idx = pin.likedBy.findIndex(uid => uid.equals(userId));
    if (idx >= 0) {
      // already liked → unlike
      pin.likedBy.splice(idx, 1);
      pin.likesCount = pin.likedBy.length;
    } else {
      pin.likedBy.push(userId);
      pin.likesCount = pin.likedBy.length;
    }
    await pin.save();
    res.json({ likesCount: pin.likesCount });
  } catch (err) {
    console.error('toggle-like error', err);
    res.status(500).json({ error: 'Failed to like/unlike' });
  }
});

// Add comment to pin
app.post('/api/pin/:id/comment', ensureAuthenticated, async (req, res) => {
  const pinId = req.params.id;
  const userId = req.user._id;
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Comment text required' });
  }
  try {
    const pin = await Pin.findById(pinId);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });

    pin.comments.push({ userId, text });
    await pin.save();
    // You may want to return the newly added comment or full pin
    res.json(pin.comments);
  } catch (err) {
    console.error('comment error', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Delete comment (only if user is author)
app.delete('/api/pin/:pinId/comment/:cmtId', ensureAuthenticated, async (req, res) => {
  const { pinId, cmtId } = req.params;
  const userId = req.user._id;
  try {
    const pin = await Pin.findById(pinId);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });

    const cmt = pin.comments.id(cmtId);
    if (!cmt) return res.status(404).json({ error: 'Comment not found' });
    if (!cmt.userId.equals(userId)) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    cmt.remove();  // remove subdocument
    await pin.save();
    res.json({ comments: pin.comments });
  } catch (err) {
    console.error('delete comment error', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Get pins with filtering (owner / popular / newest)
app.get('/api/pins', async (req, res) => {
  const { filter } = req.query;  // e.g. filter = "mine", "popular", "newest"
  let query = {};
  let sort = { timestamp: -1 };

  if (filter === 'mine' && req.user) {
    query.userId = req.user._id;
  }
  if (filter === 'popular') {
    sort = { likesCount: -1 };
  }
  if (filter === 'newest') {
    sort = { timestamp: -1 };
  }
  try {
    const pins = await Pin.find(query).sort(sort).limit(100);
    res.json(pins);
  } catch (err) {
    console.error('fetch filtered pins error', err);
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
});

function createPinMarker(pin) {
  const y = pin.y_pct * mapHeight;
  const x = pin.x_pct * mapWidth;

  const marker = L.marker([y, x]).addTo(map);

  // Build popup HTML
  let popupHtml = `<strong>${pin.title}</strong><br>${pin.description}<br>`;
  popupHtml += `Likes: <span id="likes-${pin._id}">${pin.likesCount}</span>`;
  popupHtml += ` <button onclick="toggleLike('${pin._id}')">👍</button><br>`;
  
  const done = pin.completedBy && pin.completedBy.includes(currentUserId);
  popupHtml += `<button onclick="toggleComplete('${pin._id}')">
                  ${done ? 'Unmark Complete' : 'Mark Complete'}
                </button><br>`;

  // Comments
  popupHtml += `<div>`;
  pin.comments.forEach(c => {
    popupHtml += `<div><strong>${c.userId}</strong>: ${c.text}</div>`;
  });
  popupHtml += `</div>`;
  popupHtml += `<input type="text" id="comment-input-${pin._id}" placeholder="Add comment" />`;
  popupHtml += `<button onclick="addComment('${pin._id}')">Comment</button>`;

  marker.bindPopup(popupHtml);
}

async function loadPins() {
  const filter = document.getElementById('filter-select').value;
  const res = await fetch('/api/pins?' + new URLSearchParams({ filter }));
  const pins = await res.json();
  // then render them as before
}

async function toggleLike(pinId) {
  await fetch(`/api/pin/${pinId}/toggle-like`, { method: 'POST' });
  loadPins();  // reload to refresh counts
}

async function toggleComplete(pinId) {
  await fetch(`/api/pin/${pinId}/toggle-complete`, { method: 'POST' });
  loadPins();
}

async function addComment(pinId) {
  const input = document.getElementById(`comment-input-${pinId}`);
  const text = input.value;
  if (!text) return;
  await fetch(`/api/pin/${pinId}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  loadPins();
}

// ===== Start server =====
app.listen(PORT, () => {
  console.log(`✅ Server running at: http://localhost:${PORT}`);
});
