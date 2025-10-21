const mongoose = require('mongoose');

const mediaItemSchema = new mongoose.Schema({
  url: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], default: 'video' }
}, { _id: false });

const pinSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  x_pct: { type: Number, required: true },
  y_pct: { type: Number, required: true },

  // Supports multiple media items; accepts strings or objects
  media: {
    type: [mediaItemSchema],
    default: [],
    set: (value) => {
      if (!value) return [];
      if (typeof value === 'string') return [{ url: value, type: 'video' }];
      if (Array.isArray(value)) {
        return value.map(v => typeof v === 'string' ? { url: v, type: 'video' } : v);
      }
      return value;
    }
  },

  timestamp: { type: Date, default: Date.now },
  likesCount: { type: Number, default: 0 },
  comments: [{ text: String, date: { type: Date, default: Date.now } }],
  completed: { type: Boolean, default: false },
  flagged: { type: Boolean, default: false }
});

module.exports = mongoose.model('Pin', pinSchema);
