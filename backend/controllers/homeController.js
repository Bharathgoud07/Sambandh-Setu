const Connection = require("../models/Connection");
const ConnectionRequest = require("../models/ConnectionRequest");
const Notification = require("../models/Notification");
const { serializeProfile } = require("../utils/serializers");
const Profile = require("../models/Profile");
const { getJourney } = require("../services/journeyService");

const getHome = async (req, res) => {
    const [receivedRequests, sentRequests, unreadNotifications, connections, ownProfile] =
        await Promise.all([
            ConnectionRequest.countDocuments({ recipient: req.user._id, status: "pending" }),
            ConnectionRequest.countDocuments({ sender: req.user._id, status: "pending" }),
            Notification.countDocuments({ recipient: req.user._id, readAt: null }),
            Connection.find({ participants: req.user._id, status: "active" })
                .populate("participants", "username firstName lastName")
                .sort({ createdAt: -1 })
                .limit(1),
            Profile.findOne({ user: req.user._id })
        ]);

    let currentConnection = null;
    if (connections.length) {
        const connection = connections[0];
        const otherUser = connection.participants.find(
            (user) => String(user._id) !== String(req.user._id)
        );
        const profile = otherUser ? await Profile.findOne({ user: otherUser._id }) : null;
        currentConnection = {
            id: String(connection._id),
            status: connection.status,
            stage: connection.stage,
            journey: getJourney(connection.stage),
            user: otherUser
                ? {
                    id: String(otherUser._id),
                    username: otherUser.username,
                    firstName: otherUser.firstName,
                    lastName: otherUser.lastName,
                    displayName: [otherUser.firstName, otherUser.lastName].filter(Boolean).join(" ")
                }
                : null,
            profile: profile ? serializeProfile(profile, otherUser) : null
        };
    }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const displayName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ");

    res.json({
        data: {
            greeting: `${greeting}, ${displayName}`,
            profileComplete: Boolean(ownProfile),
            needsYourAttention: { receivedRequests, sentRequests },
            currentConnection,
            journey: currentConnection
                ? {
                    stage: currentConnection.stage,
                    stageNumber: currentConnection.journey.stageNumber,
                    totalStages: currentConnection.journey.totalStages,
                    currentStage: currentConnection.journey.currentStage,
                    completed: currentConnection.journey.completed,
                    stages: currentConnection.journey.stages
                }
                : null,
            unreadNotifications
        }
    });
};

module.exports = { getHome };
