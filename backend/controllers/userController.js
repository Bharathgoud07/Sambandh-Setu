const User = require("../models/User");
const Profile = require("../models/Profile");
const ApiError = require("../utils/ApiError");
const { requireObjectId } = require("../utils/validation");
const { serializeUser, serializeProfile } = require("../utils/serializers");

const getCurrentUser = async (req, res) => {
    res.json({ data: { user: serializeUser(req.user) } });
};

const getCurrentProfile = async (req, res) => {
    const profile = await Profile.findOne({ user: req.user._id }).populate(
        "user",
        "username firstName lastName"
    );
    if (!profile) {
        throw ApiError.notFound("Profile not found");
    }
    res.json({ data: { profile: serializeProfile(profile) } });
};

const getProfile = async (req, res) => {
    const userId = requireObjectId(req.params.userId, "userId");
    const user = await User.findOne({ _id: userId, isActive: true }).select(
        "_id username firstName lastName"
    );
    if (!user) {
        throw ApiError.notFound("User not found");
    }
    const profile = await Profile.findOne({ user: userId });
    if (!profile) {
        throw ApiError.notFound("Profile not found");
    }
    res.json({ data: { profile: serializeProfile(profile, user) } });
};

module.exports = { getCurrentUser, getCurrentProfile, getProfile };
