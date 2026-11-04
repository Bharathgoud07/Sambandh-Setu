const Connection = require("../models/Connection");
const ApiError = require("../utils/ApiError");

const getConnectionForUser = async (connectionId, userId) => {
    const connection = await Connection.findById(connectionId);
    if (!connection) {
        throw ApiError.notFound("Connection not found");
    }
    if (!connection.participants.some((participant) => String(participant) === String(userId))) {
        throw ApiError.forbidden("You are not a participant in this connection");
    }
    return connection;
};

const getMatchId = (connection, userId) => {
    const matchId = connection.participants.find(
        (participant) => String(participant) !== String(userId)
    );
    if (!matchId) {
        throw ApiError.forbidden("A connection participant could not be determined");
    }
    return matchId;
};

module.exports = { getConnectionForUser, getMatchId };
