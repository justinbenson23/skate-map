const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username:        { type: String, unique: true, required: true },
  passwordHash:    { type: String, required: true },
  createdAt:       { type: Date, default: Date.now },
  resetToken:      String,
  resetTokenExpiry: Date
});

// Instance method to check password
userSchema.methods.verifyPassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Instance method to set password
userSchema.methods.setPassword = async function (newPassword) {
  const saltRounds = 10;
  this.passwordHash = await bcrypt.hash(newPassword, saltRounds);

  // Clear reset fields
  this.resetToken = undefined;
  this.resetTokenExpiry = undefined;

  return this.save();
};

module.exports = mongoose.model('User', userSchema);
