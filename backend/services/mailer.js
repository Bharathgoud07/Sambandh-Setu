
const sendOtpEmail = async (to, code) => {
    if (!to || !code) {
        throw new Error("OTP email details are missing");
    }

    const provider = process.env.EMAIL_PROVIDER ||
        (process.env.NODE_ENV === "development" ? "placeholder" : "brevo");

    if (provider === "placeholder") {
        console.info("OTP email placeholder provider invoked.");
        return;
    }

    if (provider !== "brevo") {
        throw new Error("Unsupported email provider");
    }

    const apiKey = process.env.EMAIL_API_KEY;
    const senderEmail = process.env.EMAIL_FROM;
    const senderName = process.env.EMAIL_FROM_NAME || "Sambandh Setu";

    if (!apiKey || !senderEmail) {
        throw new Error("Brevo email configuration is incomplete");
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "accept": "application/json",
            "api-key": apiKey,
            "content-type": "application/json"
        },
        body: JSON.stringify({
            sender: {
                name: senderName,
                email: senderEmail
            },
            to: [{ email: to }],
            subject: "Your Sambandh Setu verification code",
            textContent: `Your Sambandh Setu verification code is ${code}. It expires in 10 minutes.`,
            htmlContent: `<p>Your Sambandh Setu verification code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`
        }),
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        // Do not log provider response, email address, or credentials.
        console.error("OTP email provider failed", {
            status: response.status
        });

        throw new Error("OTP email could not be sent");
    }
};

module.exports = { sendOtpEmail };
