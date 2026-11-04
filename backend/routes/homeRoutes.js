const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { getHome } = require("../controllers/homeController");

const router = express.Router();

router.use(requireAuth);
router.get("/", getHome);

module.exports = router;
