const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
    listNotifications,
    markNotificationRead
} = require("../controllers/notificationController");

const router = express.Router();

router.use(requireAuth);
router.get("/", listNotifications);
router.post("/:notificationId/read", markNotificationRead);

module.exports = router;
