require("dotenv").config();

const { MongoClient } = require("mongodb");

async function testConnection() {
   const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000
});
    try {
        await client.connect();

        console.log("MongoDB driver connected!");

        const result = await client.db("admin").command({ ping: 1 });

        console.log("Ping successful:", result);
    } catch (error) {
        console.error("Connection failed:", error.message);

        let cause = error;

        while (cause) {
            console.error("Cause:", cause.message);
            cause = cause.cause;
        }
    } finally {
        await client.close().catch(() => {});
    }
}

testConnection();