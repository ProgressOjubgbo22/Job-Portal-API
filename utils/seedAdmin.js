require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to seed an admin.");
    process.exit(1);
  }

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Admin with email ${email} already exists. Skipping.`);
  } else {
    await User.create({
      firstName: "Super",
      lastName: "Admin",
      email,
      password,
      role: "admin",
      status: "active",
      emailVerified: true,
    });
    console.log(`Admin account created for ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
