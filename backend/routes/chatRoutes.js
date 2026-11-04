const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
    listChats,
    listMessages,
    markMessagesRead,
    sendMessage,
    setMuted
} = require("../controllers/chatController");

const router = express.Router();

router.use(requireAuth);
router.get("/", listChats);
router.get("/:chatId/messages", listMessages);
router.post("/:chatId/messages", sendMessage);
router.post("/:chatId/read", markMessagesRead);
router.put("/:chatId/mute", setMuted);

module.exports = router;
