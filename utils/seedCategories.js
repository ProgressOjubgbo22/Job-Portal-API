require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../models/Category");

const DEFAULT_CATEGORIES = [
  "Information Technology",
  "Engineering",
  "Sales & Marketing",
  "Finance & Accounting",
  "Human Resources",
  "Customer Service",
  "Healthcare",
  "Education & Training",
  "Legal",
  "Administration",
  "Design & Creative",
  "Logistics & Supply Chain",
  "Construction & Real Estate",
  "Manufacturing",
  "Agriculture",
  "Hospitality & Tourism",
  "Media & Communications",
  "Oil & Gas",
  "Banking & Insurance",
  "Retail",
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB. Seeding categories...");

  for (const name of DEFAULT_CATEGORIES) {
    await Category.findOneAndUpdate(
      { name },
      { name, status: "active" },
      { upsert: true, new: true }
    );
  }

  console.log(`Seeded ${DEFAULT_CATEGORIES.length} categories.`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
