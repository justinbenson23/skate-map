const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  x_pct: { type: Number, required: true },
  y_pct: { type: Number, required: true },

  // Updated: Support multiple media files
  media: [
    {
      url: String,       // link to uploaded file
      type: String       // 'image' or 'video'
    }
  ],

  timestamp: { type: Date, default: Date.now },
  likesCount: { type: Number, default: 0 },
  comments: [{ text: String, date: { type: Date, default: Date.now } }],
  completed: { type: Boolean, default: false },
  flagged: { type: Boolean, default: false } // moderation field
});

module.exports = mongoose.model('Pin', pinSchema);
