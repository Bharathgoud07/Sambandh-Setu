const Connection = require("../models/Connection");
const Profile = require("../models/Profile");
const ApiError = require("../utils/ApiError");
const { requireObjectId } = require("../utils/validation");
const { serializeProfile } = require("../utils/serializers");
const { getJourney } = require("../services/journeyService");
const { getConnectionForUser } = require("../services/connectionAccessService");

const serializeConnection = (connection, profiles) => ({
    id: String(connection._id),
    status: connection.status,
    stage: connection.stage,
    journey: getJourney(connection.stage),
    participants: connection.participants.map((user) => {
        const userId = String(user._id || user);
        const profile = profiles.get(userId);
        return {
            user: {
                id: userId,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                displayName: [user.firstName, user.lastName].filter(Boolean).join(" ")
            },
            profile: profile ? serializeProfile(profile, user) : null
        };
    }),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
});

const withProfiles = async (connections) => {
    const userIds = connections.flatMap((connection) =>
        connection.participants.map((user) => user._id || user)
    );
    const profiles = await Profile.find({ user: { $in: userIds } });
    const profileMap = new Map(profiles.map((profile) => [String(profile.user), profile]));
    return connections.map((connection) => serializeConnection(connection, profileMap));
};

const listActiveConnections = async (req, res) => {
    const { status } = req.query;
    if (status !== undefined && status !== "active") {
        throw ApiError.badRequest("status must be active", [{ field: "status" }]);
    }

    const connections = await Connection.find({
        participants: req.user._id,
        status: "active"
    })
        .populate("participants", "username firstName lastName")
        .sort({ createdAt: -1 });
    res.json({ data: { connections: await withProfiles(connections) } });
};

const getConnection = async (req, res) => {
    const connectionId = requireObjectId(req.params.connectionId, "connectionId");
    const authorizedConnection = await getConnectionForUser(connectionId, req.user._id);
    const connection = await Connection.findById(authorizedConnection._id).populate(
        "participants",
        "username firstName lastName"
    );
    res.json({ data: { connection: (await withProfiles([connection]))[0] } });
};

module.exports = { listActiveConnections, getConnection };
