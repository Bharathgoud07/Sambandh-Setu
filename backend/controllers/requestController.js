const Connection = require("../models/Connection");
const ConnectionRequest = require("../models/ConnectionRequest");
const Notification = require("../models/Notification");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { requireObjectId } = require("../utils/validation");
const { serializeUser } = require("../utils/serializers");

const pairKeyFor = (firstId, secondId) => [String(firstId), String(secondId)].sort().join(":");

const serializeRequest = (request) => ({
    id: String(request._id),
    sender: serializeUser(request.sender),
    recipient: serializeUser(request.recipient),
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
});

const sendRequest = async (req, res) => {
    const recipientId = requireObjectId(req.body?.recipientId, "recipientId");
    if (String(req.user._id) === recipientId) {
        throw ApiError.badRequest("You cannot send a connection request to yourself");
    }

    const recipient = await User.findOne({ _id: recipientId, isActive: true }).select("_id");
    if (!recipient) {
        throw ApiError.notFound("Recipient not found");
    }

    const pairKey = pairKeyFor(req.user._id, recipient._id);
    const [existingConnection, existingRequest] = await Promise.all([
        Connection.exists({ pairKey, status: "active" }),
        ConnectionRequest.exists({ pairKey, status: "pending" })
    ]);
    if (existingConnection) {
        throw ApiError.conflict("You are already connected to this user");
    }
    if (existingRequest) {
        throw ApiError.conflict("A pending connection request already exists for these users");
    }

    const request = await ConnectionRequest.create({
        sender: req.user._id,
        recipient: recipient._id,
        pairKey
    });
    await Notification.create({
        recipient: recipient._id,
        actor: req.user._id,
        type: "connection_request",
        request: request._id
    });

    const populated = await ConnectionRequest.findById(request._id)
        .populate("sender", "username firstName lastName")
        .populate("recipient", "username firstName lastName");
    res.status(201).json({ data: { request: serializeRequest(populated) } });
};

const listRequests = async (req, res) => {
    const { box } = req.query;
    if (box !== "received" && box !== "sent") {
        throw ApiError.badRequest("box must be either received or sent", [{ field: "box" }]);
    }
    const ownerField = box === "received" ? "recipient" : "sender";
    const requests = await ConnectionRequest.find({ [ownerField]: req.user._id, status: "pending" })
        .populate("sender", "username firstName lastName")
        .populate("recipient", "username firstName lastName")
        .sort({ createdAt: -1 });
    res.json({ data: { requests: requests.map(serializeRequest) } });
};

const updateRequest = async (req, res) => {
    const requestId = requireObjectId(req.params.requestId, "requestId");
    const request = await ConnectionRequest.findById(requestId);
    if (!request) {
        throw ApiError.notFound("Connection request not found");
    }

    const action = req.params.action;
    const isRecipientAction = action === "accept" || action === "decline";
    const owner = isRecipientAction ? request.recipient : request.sender;
    if (String(owner) !== String(req.user._id)) {
        throw ApiError.forbidden("You do not own this connection request action");
    }
    if (request.status !== "pending") {
        throw ApiError.conflict("Only pending requests can be updated");
    }

    const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "withdrawn";
    const updated = await ConnectionRequest.findOneAndUpdate(
        { _id: request._id, status: "pending", [isRecipientAction ? "recipient" : "sender"]: req.user._id },
        { $set: { status } },
        { new: true }
    );
    if (!updated) {
        throw ApiError.conflict("The request has already been updated");
    }

    let connection;
    if (action === "accept") {
        try {
            connection = await Connection.create({
                participants: [request.sender, request.recipient],
                pairKey: request.pairKey,
                request: request._id,
                status: "active",
                stage: "connect"
            });
        } catch (error) {
            await ConnectionRequest.updateOne(
                { _id: request._id, status: "accepted" },
                { $set: { status: "pending" } }
            );
            throw error;
        }
    }

    const notificationType = {
        accept: "connection_accepted",
        decline: "connection_declined",
        withdraw: "connection_request_withdrawn"
    }[action];
    const notificationRecipient = action === "withdraw" ? request.recipient : request.sender;
    await Notification.create({
        recipient: notificationRecipient,
        actor: req.user._id,
        type: notificationType,
        request: request._id,
        connection: connection?._id
    });

    const populated = await ConnectionRequest.findById(request._id)
        .populate("sender", "username firstName lastName")
        .populate("recipient", "username firstName lastName");
    res.json({
        data: {
            request: serializeRequest(populated),
            ...(connection ? { connection: { id: String(connection._id), status: "active", stage: "connect" } } : {})
        }
    });
};

module.exports = { sendRequest, listRequests, updateRequest, pairKeyFor };
