const serializeUser = (user) => {
    if (!user) {
        return null;
    }
    const value = typeof user.toObject === "function" ? user.toObject() : user;
    return {
        id: String(value._id || value.id),
        username: value.username,
        firstName: value.firstName,
        lastName: value.lastName,
        displayName: [value.firstName, value.lastName].filter(Boolean).join(" ")
    };
};

const serializeProfile = (profile, user = profile?.user) => {
    if (!profile) {
        return null;
    }
    const value = typeof profile.toObject === "function" ? profile.toObject() : profile;
    return {
        id: String(value._id || value.id),
        user: serializeUser(user),
        age: value.age,
        gender: value.gender,
        heightCm: value.heightCm,
        avatarUrl: value.avatarUrl,
        profileStatus: value.profileStatus,
        bio: value.bio,
        education: value.education,
        profession: value.profession,
        interests: value.interests,
        lifestyle: value.lifestyle,
        family: value.family,
        preferences: value.preferences,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt
    };
};

const serializeNotification = (notification) => ({
    id: String(notification._id || notification.id),
    type: notification.type,
    actor: serializeUser(notification.actor),
    requestId: notification.request ? String(notification.request._id || notification.request) : undefined,
    connectionId: notification.connection
        ? String(notification.connection._id || notification.connection)
        : undefined,
    createdAt: notification.createdAt,
    readAt: notification.readAt || null
});

module.exports = { serializeUser, serializeProfile, serializeNotification };
