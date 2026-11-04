const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { getDiscoverUsers } = require("../controllers/discoverController");

const router = express.Router();

router.use(requireAuth);
router.get("/", getDiscoverUsers);

module.exports = router;
