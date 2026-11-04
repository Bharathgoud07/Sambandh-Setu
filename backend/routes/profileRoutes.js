const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { getProfile } = require("../controllers/userController");

const router = express.Router();

router.use(requireAuth);
router.get("/:userId", getProfile);

module.exports = router;
