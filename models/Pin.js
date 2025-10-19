const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String,
  description: String,
  x_pct: Number,
  y_pct: Number,
  mediaType: String,
  mediaUrl: String,
  likesCount: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],   // list of users who liked

  comments: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      text: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],

  completedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],  // list of users who completed

  timestamp: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Pin', pinSchema);