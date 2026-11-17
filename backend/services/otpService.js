
const crypto = require("crypto");
const Otp = require("../models/Otp");
const { sendOtpEmail } = require("./mailer");

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_LOCK_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const getOtpHash = (email, code) => {
    const secret = process.env.OTP_HMAC_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error("OTP_HMAC_SECRET is not configured correctly");
    }

    return crypto
        .createHmac("sha256", secret)
        .update(`${email}:${code}`)
        .digest("hex");
};

const safeCompare = (storedHash, submittedHash) => {
    if (
        typeof storedHash !== "string" ||
        typeof submittedHash !== "string" ||
        !/^[a-f0-9]{64}$/i.test(storedHash) ||
        !/^[a-f0-9]{64}$/i.test(submittedHash)
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(storedHash, "hex"),
        Buffer.from(submittedHash, "hex")
    );
};

const requestOtp = async (email) => {
    const now = new Date();
    let record = await Otp.findOne({ email });

    if (record?.lockedUntil && record.lockedUntil > now) {
        return;
    }

    if (
        record &&
        now.getTime() - record.lastSentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
        return;
    }

    const code = crypto.randomInt(100000, 1000000).toString();

    const data = {
        codeHash: getOtpHash(email, code),
        attempts: 0,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
        lockedUntil: null
    };

    if (record) {
        Object.assign(record, data);
        await record.save();
    } else {
        record = await Otp.create({ email, ...data });
    }

    try {
        await sendOtpEmail(email, code);
    } catch (error) {
        await Otp.deleteOne({ _id: record._id });
        throw new Error("OTP email could not be sent");
    }
};

const verifyOtp = async (email, code) => {
    const record = await Otp.findOne({ email }).select("+codeHash");

    if (!record) {
        return { valid: false, reason: "OTP_INVALID" };
    }

    const now = new Date();

    if (record.lockedUntil && record.lockedUntil > now) {
        return { valid: false, reason: "OTP_LOCKED" };
    }

    if (record.attempts >= MAX_ATTEMPTS) {
        return { valid: false, reason: "OTP_LOCKED" };
    }

    if (record.expiresAt <= now) {
        return { valid: false, reason: "OTP_EXPIRED" };
    }

    const submittedHash = getOtpHash(email, code);

    if (!safeCompare(record.codeHash, submittedHash)) {
        const updated = await Otp.findOneAndUpdate(
            {
                _id: record._id,
                codeHash: record.codeHash,
                attempts: { $lt: MAX_ATTEMPTS },
                expiresAt: { $gt: now },
                $or: [
                    { lockedUntil: null },
                    { lockedUntil: { $lte: now } }
                ]
            },
            [
                {
                    $set: {
                        attempts: { $add: ["$attempts", 1] },
                        lockedUntil: {
                            $cond: [
                                { $gte: [{ $add: ["$attempts", 1] }, MAX_ATTEMPTS] },
                                new Date(now.getTime() + OTP_LOCK_MS),
                                "$lockedUntil"
                            ]
                        }
                    }
                }
            ],
            { new: true, updatePipeline: true }
        );

        if (!updated || updated.attempts >= MAX_ATTEMPTS) {
            return { valid: false, reason: "OTP_LOCKED" };
        }

        return { valid: false, reason: "OTP_INVALID" };
    }

    const deleted = await Otp.deleteOne({
        _id: record._id,
        codeHash: record.codeHash,
        attempts: { $lt: MAX_ATTEMPTS },
        expiresAt: { $gt: now },
        $or: [
            { lockedUntil: null },
            { lockedUntil: { $lte: now } }
        ]
    });

    if (deleted.deletedCount !== 1) {
        return { valid: false, reason: "OTP_INVALID" };
    }

    return { valid: true };
};

module.exports = { requestOtp, verifyOtp };
