const Connection = require("../models/Connection");
const ConnectionRequest = require("../models/ConnectionRequest");
const Profile = require("../models/Profile");
const ApiError = require("../utils/ApiError");
const { parseFilters, requireString, escapeRegex } = require("../utils/validation");
const { serializeProfile } = require("../utils/serializers");

const getDiscoverUsers = async (req, res) => {
    const query = requireString(req.query.query, "query", { maxLength: 100, optional: true });
    const filters = parseFilters(req.query.filters);
    const related = await Promise.all([
        Connection.find({ participants: req.user._id, status: "active" }).select("participants"),
        ConnectionRequest.find({
            status: "pending",
            $or: [{ sender: req.user._id }, { recipient: req.user._id }]
        }).select("sender recipient")
    ]);

    const excludedIds = new Set([String(req.user._id)]);
    for (const connection of related[0]) {
        connection.participants.forEach((id) => excludedIds.add(String(id)));
    }
    for (const request of related[1]) {
        excludedIds.add(String(request.sender));
        excludedIds.add(String(request.recipient));
    }

    const profileQuery = { user: { $nin: [...excludedIds] } };
    if (filters.gender) {
        profileQuery.gender = filters.gender;
    }
    for (const field of ["education", "profession"]) {
        if (filters[field]) {
            profileQuery[field] = new RegExp(escapeRegex(filters[field]), "i");
        }
    }
    if (query) {
        const search = new RegExp(escapeRegex(query), "i");
        profileQuery.$or = [{ bio: search }, { education: search }, { profession: search }];
    }

    const profiles = await Profile.find(profileQuery)
        .populate("user", "username firstName lastName")
        .sort({ createdAt: 1 })
        .limit(50);

    res.json({ data: { users: profiles.map((profile) => serializeProfile(profile)) } });
};

module.exports = { getDiscoverUsers };
