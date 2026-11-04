const Notification = require("../models/Notification");
const ApiError = require("../utils/ApiError");
const { requireObjectId } = require("../utils/validation");
const { serializeNotification } = require("../utils/serializers");

const listNotifications = async (req, res) => {
    const notifications = await Notification.find({ recipient: req.user._id })
        .populate("actor", "username firstName lastName")
        .sort({ createdAt: -1 })
        .limit(100);
    res.json({ data: { notifications: notifications.map(serializeNotification) } });
};

const markNotificationRead = async (req, res) => {
    const notificationId = requireObjectId(req.params.notificationId, "notificationId");
    const notification = await Notification.findOne({
        _id: notificationId,
        recipient: req.user._id
    }).populate("actor", "username firstName lastName");
    if (!notification) {
        const exists = await Notification.exists({ _id: notificationId });
        if (exists) {
            throw ApiError.forbidden("You cannot update another user's notification");
        }
        throw ApiError.notFound("Notification not found");
    }

    if (!notification.readAt) {
        notification.readAt = new Date();
        await notification.save();
    }
    res.json({ data: { notification: serializeNotification(notification) } });
};

module.exports = { listNotifications, markNotificationRead };
