const express = require("express");
const { createDevelopmentSession } = require("../controllers/authController");

const router = express.Router();

router.post("/dev-login", createDevelopmentSession);

module.exports = router;
