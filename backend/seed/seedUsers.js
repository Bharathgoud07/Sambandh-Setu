require("dotenv").config();

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const Profile = require("../models/Profile");
const seedB2 = require("./seedB2");

const fictionalUsers = [
    {
        username: "aanya",
        firstName: "Aanya",
        age: 27,
        gender: "Woman",
        heightCm: 162,
        bio: "Curious, thoughtful, and happiest over a good book or a long walk.",
        education: "Master's in Design",
        profession: "Product Designer",
        interests: ["Reading", "Art", "Travel"],
        lifestyle: { routine: "A balanced weekday routine with time for friends and fitness.", interests: ["Walking", "Cooking"] },
        family: { background: "Close-knit family that values kindness and learning.", involvement: "Family is an important part of major decisions." }
    },
    {
        username: "rohan",
        firstName: "Rohan",
        age: 29,
        gender: "Man",
        heightCm: 178,
        bio: "Easygoing, optimistic, and always looking for a new trail to explore.",
        education: "Bachelor's in Engineering",
        profession: "Software Engineer",
        interests: ["Hiking", "Music", "Cooking"],
        lifestyle: { routine: "Active mornings and relaxed weekends.", interests: ["Cycling", "Live music"] },
        family: { background: "Supportive family with a warm, practical outlook.", involvement: "Enjoys spending time with family." }
    },
    {
        username: "karthik",
        firstName: "Karthik",
        age: 28,
        gender: "Man",
        heightCm: 175,
        bio: "A patient listener who enjoys solving problems and discovering new cafes.",
        education: "Master's in Business",
        profession: "Business Analyst",
        interests: ["Coffee", "Photography", "Cricket"],
        lifestyle: { routine: "Mostly regular weekdays and social weekends.", interests: ["Photography", "Sports"] },
        family: { background: "Friendly family that enjoys shared meals.", involvement: "Values mutual respect and independence." }
    },
    {
        username: "arjun",
        firstName: "Arjun",
        age: 30,
        gender: "Man",
        heightCm: 181,
        bio: "Creative at heart, grounded by family, and fond of the outdoors.",
        education: "Bachelor's in Architecture",
        profession: "Architect",
        interests: ["Architecture", "Travel", "Gardening"],
        lifestyle: { routine: "A creative workday with outdoor time when possible.", interests: ["Gardening", "Walking"] },
        family: { background: "A close family with a mix of traditions and modern ideas.", involvement: "Family conversations are valued." }
    },
    {
        username: "varun",
        firstName: "Varun",
        age: 29,
        gender: "Man",
        heightCm: 176,
        bio: "Warm, dependable, and happiest when sharing a home-cooked meal.",
        education: "Bachelor's in Finance",
        profession: "Financial Analyst",
        interests: ["Cooking", "Films", "Running"],
        lifestyle: { routine: "Likes a steady routine and an active start to the day.", interests: ["Running", "Movies"] },
        family: { background: "Supportive family with a strong sense of togetherness.", involvement: "Keeps family connected through regular visits." }
    },
    {
        username: "siddharth",
        firstName: "Siddharth",
        age: 31,
        gender: "Man",
        heightCm: 180,
        bio: "Thoughtful and curious, with a soft spot for history and good conversation.",
        education: "Master's in History",
        profession: "Researcher",
        interests: ["History", "Museums", "Board games"],
        lifestyle: { routine: "Quiet weekdays balanced by cultural outings.", interests: ["Museums", "Board games"] },
        family: { background: "A kind family that encourages curiosity.", involvement: "Makes time for family gatherings." }
    },
    {
        username: "aditya",
        firstName: "Aditya",
        age: 28,
        gender: "Man",
        heightCm: 174,
        bio: "Cheerful, open-minded, and enthusiastic about learning new things.",
        education: "Bachelor's in Communications",
        profession: "Marketing Strategist",
        interests: ["Writing", "Food", "Travel"],
        lifestyle: { routine: "Flexible schedule with time for creative projects.", interests: ["Writing", "Trying new food"] },
        family: { background: "A welcoming family that enjoys celebrating together.", involvement: "Family input is appreciated." }
    },
    {
        username: "sai-kiran",
        firstName: "Sai",
        lastName: "Kiran",
        age: 30,
        gender: "Man",
        heightCm: 177,
        bio: "Calm and considerate, with a love for music and weekend road trips.",
        education: "Master's in Computer Science",
        profession: "Data Scientist",
        interests: ["Music", "Road trips", "Fitness"],
        lifestyle: { routine: "Structured workdays and spontaneous weekend plans.", interests: ["Fitness", "Music"] },
        family: { background: "A close and encouraging family.", involvement: "Enjoys staying involved in family life." }
    },
    {
        username: "nikhil",
        firstName: "Nikhil",
        age: 29,
        gender: "Man",
        heightCm: 179,
        bio: "Friendly, sincere, and always up for a thoughtful conversation.",
        education: "Bachelor's in Environmental Science",
        profession: "Environmental Consultant",
        interests: ["Nature", "Reading", "Volunteering"],
        lifestyle: { routine: "Enjoys time outdoors and community activities.", interests: ["Hiking", "Volunteering"] },
        family: { background: "A supportive family that values compassion.", involvement: "Family relationships are a priority." }
    }
].map((user) => ({ ...user, lastName: user.lastName || "" }));

const seedUsers = async () => {
    await connectDB();

    for (const fixture of fictionalUsers) {
        let user = await User.findOne({ username: fixture.username }).select("+passwordHash +isSeeded");
        if (!user) {
            user = new User({
                username: fixture.username,
                email: `${fixture.username}@example.test`,
                firstName: fixture.firstName,
                lastName: fixture.lastName,
                isSeeded: true
            });
            await user.setPassword(crypto.randomBytes(32).toString("hex"));
        } else {
            user.firstName = fixture.firstName;
            user.lastName = fixture.lastName;
            user.isSeeded = true;
        }
        await user.save();

        const { username, firstName, lastName, ...profile } = fixture;
        await Profile.findOneAndUpdate(
            { user: user._id },
            { $set: { user: user._id, ...profile } },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
    }

    await seedB2();
    console.log(`Seeded ${fictionalUsers.length} fictional Sambandh Setu users and profiles.`);
};

seedUsers()
    .catch((error) => {
        console.error(
            "User seeding failed: name=%s code=%s",
            error.name || "Error",
            error.code || "none"
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
