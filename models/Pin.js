const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema({
  title: String,
  description: String,
  x_pct: Number,
  y_pct: Number,
  mediaUrl: String,
  mediaType: String,
  timestamp: { type: Date, default: Date.now },
  likesCount: { type: Number, default: 0 },
  comments: [{ text: String, date: { type: Date, default: Date.now } }],
  completed: { type: Boolean, default: false },
  flagged: { type: Boolean, default: false }  // NEW FIELD
});

module.exports = mongoose.model('Pin', pinSchema);