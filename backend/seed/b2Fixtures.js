const STAGE_CONTENT = [
    {
        stage: "connect",
        guidance: [
            "Begin with a simple introduction and give each person room to share.",
            "There is no need to rush; focus on a comfortable first conversation."
        ],
        forYou: [
            { title: "Conversation starters", description: "Try a light question about a favorite way to spend a weekend." },
            { title: "Getting to know each other", description: "Share one small detail that helps describe your day-to-day life." }
        ],
        activities: ["Take turns sharing a favorite local place.", "Choose a topic you both enjoy and talk about it for a few minutes."],
        resources: ["A short guide to thoughtful first conversations."]
    },
    {
        stage: "understand",
        guidance: [
            "Explore what matters to each of you without assuming your experiences are the same.",
            "Listen to understand, and ask a follow-up when something is important to your match."
        ],
        forYou: [
            { title: "Values in everyday life", description: "Discuss a value that guides an ordinary daily choice." },
            { title: "Curiosity prompts", description: "Ask about an experience that shaped a point of view." }
        ],
        activities: ["Each person shares a meaningful tradition.", "Compare the routines that help you feel balanced."],
        resources: ["A reflection guide for active listening."]
    },
    {
        stage: "reflect",
        guidance: [
            "Take time to answer each prompt honestly and at your own pace.",
            "Your answers are private by default; choose separately if you want to share one."
        ],
        forYou: [
            { title: "Make space to reflect", description: "Choose a quiet moment and answer one prompt at a time." },
            { title: "Sharing is your choice", description: "Review each answer's sharing setting before you save it." }
        ],
        activities: ["Complete the reflection prompts at your own pace.", "Return later to edit an answer or its sharing choice."],
        resources: ["A guide to choosing what you are comfortable sharing."]
    },
    {
        stage: "discuss",
        guidance: [
            "Talk about areas where your expectations align and where they differ.",
            "Use specific examples and make room for both people to speak."
        ],
        forYou: [
            { title: "Expectation check-in", description: "Discuss what a supportive partnership looks like to each of you." },
            { title: "Shared decisions", description: "Compare how you prefer to approach an important decision." }
        ],
        activities: ["Choose one topic and each describe your perspective.", "Summarize what you heard before responding."],
        resources: ["A conversation guide for comparing expectations."]
    },
    {
        stage: "agree",
        guidance: [
            "Look for practical agreements that respect both people's needs.",
            "It is okay to note a question that needs more time rather than forcing a decision."
        ],
        forYou: [
            { title: "Small agreements", description: "Identify one everyday practice that could work for both of you." },
            { title: "Open questions", description: "Write down a topic you would like to revisit together." }
        ],
        activities: ["Name one shared priority and one individual priority.", "Agree on how you will revisit an unresolved topic."],
        resources: ["A checklist for respectful shared decisions."]
    },
    {
        stage: "family",
        guidance: [
            "Discuss family relationships and involvement with care and without assumptions.",
            "Share only what feels comfortable and respect each person's boundaries."
        ],
        forYou: [
            { title: "Family connections", description: "Talk about the role family plays in your life today." },
            { title: "Healthy boundaries", description: "Compare how you would like to balance family and personal decisions." }
        ],
        activities: ["Share a family tradition you appreciate.", "Discuss how you each prefer to handle family conversations."],
        resources: ["A prompt sheet for talking about family expectations."]
    },
    {
        stage: "reflect_again",
        guidance: [
            "Pause and consider what you have learned from your conversations so far.",
            "Notice what feels clear and what you may want to ask about next."
        ],
        forYou: [
            { title: "What has become clearer?", description: "Name an understanding that has grown during the journey." },
            { title: "What remains open?", description: "Choose a question you would like to explore with care." }
        ],
        activities: ["Each person shares one appreciation and one open question.", "Review any agreements and see whether they still feel right."],
        resources: ["A guide to checking in with yourself."]
    },
    {
        stage: "decision",
        guidance: [
            "Take the time you need to make a thoughtful decision that feels right to you.",
            "Communicate your decision respectfully and allow each person to choose freely."
        ],
        forYou: [
            { title: "Personal check-in", description: "Consider what you need in order to feel ready to decide." },
            { title: "Respectful next steps", description: "Plan how to share your decision clearly and kindly." }
        ],
        activities: ["Write down your own hopes and questions before discussing next steps.", "Make space for each person to share their decision."],
        resources: ["A reminder to make your choice without pressure."]
    }
].map((content) => ({ ...content, isMock: true }));

const REFLECTION_QUESTIONS = [
    {
        key: "reflection-01",
        order: 1,
        category: "Values & Outlook",
        prompt: "[MOCK] Which value most often guides your everyday choices?",
        type: "single_select",
        options: [
            { value: "kindness", label: "Kindness" },
            { value: "growth", label: "Learning and growth" },
            { value: "stability", label: "Stability" },
            { value: "community", label: "Community" },
            { value: "other", label: "Other" }
        ],
        allowOther: true,
        otherTextMaxLength: 100
    },
    {
        key: "reflection-02",
        order: 2,
        category: "Lifestyle",
        prompt: "[MOCK] Which activities help you feel recharged? Choose up to three.",
        type: "multi_select",
        options: [
            { value: "quiet_time", label: "Quiet time" },
            { value: "friends", label: "Time with friends" },
            { value: "outdoors", label: "Being outdoors" },
            { value: "creative", label: "Creative activities" },
            { value: "exercise", label: "Exercise" }
        ],
        minSelections: 1,
        maxSelections: 3
    },
    {
        key: "reflection-03",
        order: 3,
        category: "Communication",
        prompt: "[MOCK] How comfortable are you raising a concern in a relationship?",
        type: "rating",
        minRating: 1,
        maxRating: 5
    },
    {
        key: "reflection-04",
        order: 4,
        category: "Family",
        prompt: "[MOCK] What is one family tradition or gathering you enjoy?",
        type: "free_text",
        maxLength: 500
    },
    {
        key: "reflection-05",
        order: 5,
        category: "Partnership",
        prompt: "[MOCK] What helps you feel supported by a partner?",
        type: "free_text",
        maxLength: 500
    },
    {
        key: "reflection-06",
        order: 6,
        category: "Lifestyle",
        prompt: "[MOCK] Which parts of a balanced week matter most to you? Select all that apply.",
        type: "multi_select",
        options: [
            { value: "rest", label: "Time to rest" },
            { value: "family", label: "Time with family" },
            { value: "work", label: "Focus on work or study" },
            { value: "hobbies", label: "Personal hobbies" },
            { value: "social", label: "Social activities" }
        ],
        minSelections: 1,
        maxSelections: 5
    },
    {
        key: "reflection-07",
        order: 7,
        category: "Values & Outlook",
        prompt: "[MOCK] Which quality do you most appreciate in a conversation?",
        type: "single_select",
        options: [
            { value: "listening", label: "Careful listening" },
            { value: "honesty", label: "Honesty" },
            { value: "patience", label: "Patience" },
            { value: "humor", label: "A sense of humor" }
        ]
    },
    {
        key: "reflection-08",
        order: 8,
        category: "Communication",
        prompt: "[MOCK] How important is regular time to talk through decisions?",
        type: "rating",
        minRating: 1,
        maxRating: 5
    },
    {
        key: "reflection-09",
        order: 9,
        category: "Future",
        prompt: "[MOCK] What is one hope you have for the next few years?",
        type: "free_text",
        maxLength: 500
    },
    {
        key: "reflection-10",
        order: 10,
        category: "Partnership",
        prompt: "[MOCK] Which habits help build trust? Select all that apply.",
        type: "multi_select",
        options: [
            { value: "follow_through", label: "Following through" },
            { value: "open_talk", label: "Open conversations" },
            { value: "respect", label: "Respecting boundaries" },
            { value: "reliability", label: "Being reliable" },
            { value: "time", label: "Making time for each other" }
        ],
        minSelections: 1,
        maxSelections: 5
    }
].map((question) => ({ ...question, isMock: true }));

module.exports = { STAGE_CONTENT, REFLECTION_QUESTIONS };
