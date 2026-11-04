const Chat = require("../models/Chat");
const Connection = require("../models/Connection");
const Message = require("../models/Message");
const ApiError = require("../utils/ApiError");
const { getConnectionForUser } = require("../services/connectionAccessService");
const { requireObjectId, requireString } = require("../utils/validation");
const { serializeUser } = require("../utils/serializers");

const PAGE_SIZE = 30;
const CHAT_FILTERS = new Set(["all", "active", "new", "muted"]);

const ensureChats = async (connections) => {
    for (const connection of connections) {
        try {
            await Chat.updateOne(
                { connection: connection._id },
                { $setOnInsert: { connection: connection._id } },
                { upsert: true, setDefaultsOnInsert: true }
            );
        } catch (error) {
            if (error.code !== 11000) {
                throw error;
            }
        }
    }
};

const serializeMessage = (message, userId) => ({
    id: String(message._id),
    senderId: String(message.sender),
    text: message.text,
    createdAt: message.createdAt,
    isReadByMe: message.readBy.some((reader) => String(reader) === String(userId))
});

const getAuthorizedChat = async (chatId, userId) => {
    const id = requireObjectId(chatId, "chatId");
    const chat = await Chat.findById(id);
    if (!chat) {
        throw ApiError.notFound("Chat not found");
    }
    const connection = await getConnectionForUser(chat.connection, userId);
    if (connection.status !== "active") {
        throw ApiError.notFound("Chat not found");
    }
    return { chat, connection };
};

const listChats = async (req, res) => {
    const filter = req.query.filter || "all";
    if (!CHAT_FILTERS.has(filter)) {
        throw ApiError.badRequest("filter must be all, active, new, or muted", [{ field: "filter" }]);
    }

    const connections = await Connection.find({
        participants: req.user._id,
        status: "active"
    })
        .populate("participants", "username firstName lastName")
        .sort({ updatedAt: -1 });
    await ensureChats(connections);

    const chats = await Chat.find({
        connection: { $in: connections.map(({ _id }) => _id) }
    }).lean();
    if (chats.length === 0) {
        return res.json({ data: { chats: [] } });
    }

    const chatIds = chats.map(({ _id }) => _id);
    const unreadCounts = await Message.aggregate([
        {
            $match: {
                chat: { $in: chatIds },
                sender: { $ne: req.user._id },
                readBy: { $ne: req.user._id }
            }
        },
        { $group: { _id: "$chat", count: { $sum: 1 } } }
    ]);
    const unreadByChat = new Map(unreadCounts.map(({ _id, count }) => [String(_id), count]));
    const chatByConnection = new Map(chats.map((chat) => [String(chat.connection), chat]));

    let results = connections.map((connection) => {
        const chat = chatByConnection.get(String(connection._id));
        const match = connection.participants.find(
            (participant) => String(participant._id) !== String(req.user._id)
        );
        const unreadCount = unreadByChat.get(String(chat._id)) || 0;
        const muted = chat.mutedBy.some((userId) => String(userId) === String(req.user._id));
        return {
            id: String(chat._id),
            connectionId: String(connection._id),
            participant: serializeUser(match),
            stage: connection.stage,
            muted,
            unreadCount,
            lastMessageAt: chat.lastMessageAt || null
        };
    });

    if (filter === "active") {
        results = results.filter(({ muted }) => !muted);
    } else if (filter === "muted") {
        results = results.filter(({ muted }) => muted);
    } else if (filter === "new") {
        results = results.filter(({ unreadCount }) => unreadCount > 0);
    }

    res.json({ data: { chats: results } });
};

const listMessages = async (req, res) => {
    const { chat } = await getAuthorizedChat(req.params.chatId, req.user._id);
    const query = { chat: chat._id };
    if (req.query.cursor !== undefined) {
        query._id = { $lt: requireObjectId(req.query.cursor, "cursor") };
    }

    const messages = await Message.find(query).sort({ _id: -1 }).limit(PAGE_SIZE + 1).lean();
    const hasMore = messages.length > PAGE_SIZE;
    const page = messages.slice(0, PAGE_SIZE);
    const nextCursor = hasMore ? String(page[page.length - 1]._id) : null;

    res.json({
        data: {
            messages: page.reverse().map((message) => serializeMessage(message, req.user._id)),
            nextCursor
        }
    });
};

const sendMessage = async (req, res) => {
    const { chat } = await getAuthorizedChat(req.params.chatId, req.user._id);
    const text = requireString(req.body?.text, "text", { maxLength: 2000 });
    const message = await Message.create({
        chat: chat._id,
        sender: req.user._id,
        text,
        readBy: [req.user._id]
    });
    await Chat.updateOne({ _id: chat._id }, { $max: { lastMessageAt: message.createdAt } });

    res.status(201).json({ data: { message: serializeMessage(message, req.user._id) } });
};

const markMessagesRead = async (req, res) => {
    const { chat } = await getAuthorizedChat(req.params.chatId, req.user._id);
    const result = await Message.updateMany(
        {
            chat: chat._id,
            sender: { $ne: req.user._id },
            readBy: { $ne: req.user._id }
        },
        { $addToSet: { readBy: req.user._id } }
    );
    res.json({ data: { markedRead: result.modifiedCount } });
};

const setMuted = async (req, res) => {
    const { chat } = await getAuthorizedChat(req.params.chatId, req.user._id);
    if (typeof req.body?.muted !== "boolean" || Object.keys(req.body).length !== 1) {
        throw ApiError.badRequest("muted must be a boolean", [{ field: "muted" }]);
    }
    await Chat.updateOne(
        { _id: chat._id },
        req.body.muted
            ? { $addToSet: { mutedBy: req.user._id } }
            : { $pull: { mutedBy: req.user._id } }
    );
    res.json({ data: { chatId: String(chat._id), muted: req.body.muted } });
};

module.exports = { listChats, listMessages, sendMessage, markMessagesRead, setMuted };
