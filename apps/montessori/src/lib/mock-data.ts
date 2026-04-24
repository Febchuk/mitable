import type {
    AgentThread,
    AttendanceEntry,
    Classroom,
    Domain,
    MasteryLevel,
    Observation,
    Report,
    School,
    Student,
    Teacher,
    Topic,
} from "@/types";

// ─── School / teachers / classrooms / students ───────────────────────

export const initialSchool: School = {
    id: "school_tlp",
    name: "The Learning Place",
};

export const initialTeachers: Teacher[] = [
    {
        id: "tch_adebomehin",
        name: "Ms. Adebomehin",
        email: "ms.adebomehin@tlp.school",
        classroomIds: ["class_primary"],
    },
    {
        id: "tch_charity",
        name: "Ms. Charity",
        email: "ms.charity@tlp.school",
        classroomIds: ["class_elementary"],
    },
];

export const initialClassrooms: Classroom[] = [
    {
        id: "class_primary",
        name: "Primary Classroom",
        level: "primary",
        ageRange: "3–6",
        teacherId: "tch_adebomehin",
        studentIds: [
            "stu_amara",
            "stu_kofi",
            "stu_temi",
            "stu_zara",
            "stu_emeka",
            "stu_aisha",
            "stu_liam",
            "stu_nadia",
        ],
    },
    {
        id: "class_elementary",
        name: "Elementary Classroom",
        level: "elementary",
        ageRange: "6–12",
        teacherId: "tch_charity",
        studentIds: ["stu_jude", "stu_fatima", "stu_obinna", "stu_sade", "stu_chidi", "stu_yemi"],
    },
];

export const initialStudents: Student[] = [
    { id: "stu_amara", name: "Amara", age: 5, classroomId: "class_primary" },
    { id: "stu_kofi", name: "Kofi", age: 4, classroomId: "class_primary" },
    { id: "stu_temi", name: "Temi", age: 6, classroomId: "class_primary" },
    { id: "stu_zara", name: "Zara", age: 3, classroomId: "class_primary" },
    { id: "stu_emeka", name: "Emeka", age: 5, classroomId: "class_primary" },
    { id: "stu_aisha", name: "Aisha", age: 4, classroomId: "class_primary" },
    { id: "stu_liam", name: "Liam", age: 6, classroomId: "class_primary" },
    { id: "stu_nadia", name: "Nadia", age: 4, classroomId: "class_primary" },
    { id: "stu_jude", name: "Jude", age: 8, classroomId: "class_elementary" },
    { id: "stu_fatima", name: "Fatima", age: 10, classroomId: "class_elementary" },
    { id: "stu_obinna", name: "Obinna", age: 7, classroomId: "class_elementary" },
    { id: "stu_sade", name: "Sade", age: 11, classroomId: "class_elementary" },
    { id: "stu_chidi", name: "Chidi", age: 9, classroomId: "class_elementary" },
    { id: "stu_yemi", name: "Yemi", age: 8, classroomId: "class_elementary" },
];

// ─── Curriculum ──────────────────────────────────────────────────────

interface DomainSeed {
    id: string;
    name: string;
    level: Domain["level"];
    hue: number;
    topics: string[];
}

const PRIMARY_SEEDS: DomainSeed[] = [
    {
        id: "d_practical_life",
        name: "Practical Life",
        level: "primary",
        hue: 28,
        topics: ["Pouring Water", "Sweeping", "Dressing Frames", "Care of Plants", "Hand Washing"],
    },
    {
        id: "d_sensorial",
        name: "Sensorial",
        level: "primary",
        hue: 340,
        topics: [
            "Pink Tower",
            "Brown Stair",
            "Red Rods",
            "Colour Tablets",
            "Geometric Solids",
            "Binomial Cube",
        ],
    },
    {
        id: "d_language",
        name: "Language",
        level: "primary",
        hue: 200,
        topics: [
            "Sandpaper Letters",
            "Moveable Alphabet",
            "Phonetic Object Box",
            "Three Part Cards",
            "Sentence Analysis",
        ],
    },
    {
        id: "d_mathematics",
        name: "Mathematics",
        level: "primary",
        hue: 150,
        topics: [
            "Number Rods",
            "Sandpaper Numbers",
            "Spindle Box",
            "Golden Beads",
            "Stamp Game",
            "Snake Game",
        ],
    },
    {
        id: "d_cultural",
        name: "Cultural",
        level: "primary",
        hue: 90,
        topics: [
            "Continent Globe",
            "Puzzle Maps",
            "Parts of a Plant",
            "Parts of an Animal",
            "Calendar Work",
        ],
    },
];

const ELEMENTARY_SEEDS: DomainSeed[] = [
    {
        id: "d_lang_arts",
        name: "Language Arts",
        level: "elementary",
        hue: 200,
        topics: [
            "Reading Analysis",
            "Creative Writing",
            "Grammar Symbols",
            "Sentence Analysis",
            "Research Skills",
        ],
    },
    {
        id: "d_math_elem",
        name: "Mathematics",
        level: "elementary",
        hue: 150,
        topics: ["Bead Chains", "Long Division", "Fraction Work", "Decimal Board", "Geometry Cabinet"],
    },
    {
        id: "d_geometry",
        name: "Geometry",
        level: "elementary",
        hue: 340,
        topics: ["Triangle Box", "Constructive Triangles", "Area of Figures", "Volume Work"],
    },
    {
        id: "d_hist_geo",
        name: "History & Geography",
        level: "elementary",
        hue: 28,
        topics: ["Timeline of Life", "Clock of Eras", "Land and Water Forms", "Political Maps"],
    },
    {
        id: "d_science",
        name: "Science",
        level: "elementary",
        hue: 90,
        topics: [
            "Classification of Living Things",
            "Experiments with Air",
            "Experiments with Water",
            "Plant Biology",
        ],
    },
];

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const allTopics: Topic[] = [];
const allDomains: Domain[] = [];
let domainOrder = 0;

for (const seeds of [PRIMARY_SEEDS, ELEMENTARY_SEEDS]) {
    for (const seed of seeds) {
        const topicIds: string[] = [];
        for (const topicName of seed.topics) {
            const topicId = `t_${seed.id}_${slugify(topicName)}`;
            topicIds.push(topicId);
            allTopics.push({
                id: topicId,
                name: topicName,
                domainId: seed.id,
                level: seed.level,
                active: true,
            });
        }
        allDomains.push({
            id: seed.id,
            name: seed.name,
            level: seed.level,
            order: domainOrder++,
            colorHue: seed.hue,
            active: true,
            topicIds,
        });
    }
}

export const initialDomains: Domain[] = allDomains;
export const initialTopics: Topic[] = allTopics;

// ─── Deterministic "random" helpers ──────────────────────────────────

function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
    return Math.abs(h >>> 0);
}

function pseudoLevel(studentId: string, topicId: string): MasteryLevel | null {
    const h = hashStr(studentId + "::" + topicId);
    const bucket = h % 100;
    // ~25% empty, ~20% introduced, ~30% practising, ~25% mastered
    if (bucket < 25) return null;
    if (bucket < 45) return "introduced";
    if (bucket < 75) return "practising";
    return "mastered";
}

function daysAgo(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(14 - (n % 5), 12, 0, 0);
    return d.toISOString();
}

function dateStr(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
}

const NOTE_SAMPLES: Partial<Record<MasteryLevel, string[]>> = {
    introduced: [
        "Shown the work during group time today. Curious, watched intently.",
        "First presentation today — stayed focused for the whole lesson.",
        "Introduced individually this morning.",
    ],
    practising: [
        "Chose this work twice this week. Carrying the tray carefully.",
        "Making progress — still needs support on the last step.",
        "Repeating the cycle on their own, refining control.",
    ],
    mastered: [
        "Completing independently and offering to show a younger child.",
        "Confident and precise — ready for the extension.",
        "Works through the full cycle without interruption.",
    ],
};

function pickSample(level: MasteryLevel, seed: string): string | null {
    const list = NOTE_SAMPLES[level];
    if (!list) return null;
    return list[hashStr(seed) % list.length]!;
}

// ─── Observations ────────────────────────────────────────────────────

const observations: Observation[] = [];
for (const student of initialStudents) {
    for (const topic of initialTopics) {
        // only seed observations for topics matching the student's classroom level
        const classroom = initialClassrooms.find((c) => c.id === student.classroomId)!;
        if (classroom.level !== topic.level) continue;
        const level = pseudoLevel(student.id, topic.id);
        if (!level) continue;
        const ageDays = (hashStr(student.id + topic.id + "age") % 40) + 1;
        const method: Observation["inputMethod"] =
            hashStr(student.id + topic.id + "m") % 5 === 0
                ? "voice"
                : hashStr(student.id + topic.id + "m") % 7 === 0
                  ? "agent"
                  : "grid";
        const note = pickSample(level, student.id + topic.id);
        observations.push({
            id: `obs_${student.id}_${topic.id}`,
            studentId: student.id,
            topicId: topic.id,
            level,
            note,
            summary: note,
            createdAt: daysAgo(ageDays),
            inputMethod: method,
            authorType: method === "agent" ? "agent" : "teacher",
            authorId: method === "agent" ? "agent" : classroom.teacherId,
        });
    }
}

// sort newest first
observations.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

export const initialObservations: Observation[] = observations;

// ─── Attendance (3 weeks) ────────────────────────────────────────────

const attendance: AttendanceEntry[] = [];
for (const student of initialStudents) {
    for (let i = 0; i < 21; i++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        const weekday = d.getUTCDay();
        if (weekday === 0 || weekday === 6) continue; // skip weekends
        const h = hashStr(student.id + "att" + i) % 20;
        const status: AttendanceEntry["status"] = h === 3 ? "absent" : "present";
        attendance.push({
            id: `att_${student.id}_${i}`,
            studentId: student.id,
            date: dateStr(i),
            status,
        });
    }
}
export const initialAttendance: AttendanceEntry[] = attendance;

// ─── Reports ─────────────────────────────────────────────────────────

export const initialReports: Report[] = [
    {
        id: "rep_amara_eot",
        studentId: "stu_amara",
        classroomId: "class_primary",
        type: "end-of-term",
        status: "approved",
        createdAt: daysAgo(12),
        approvedAt: daysAgo(10),
        summary:
            "Amara has had a strong term — deepening her focus in Sensorial and showing early readiness for written language.",
        sections: [
            {
                domainId: "d_practical_life",
                narrative:
                    "Amara chooses Practical Life works independently and is especially drawn to Care of Plants, tending the classroom herbs each morning.",
            },
            {
                domainId: "d_sensorial",
                narrative:
                    "She has completed the Pink Tower and Brown Stair with ease and is now exploring the Binomial Cube.",
            },
            {
                domainId: "d_language",
                narrative:
                    "Sandpaper Letters are becoming familiar; she is beginning to build phonetic three-letter words with the Moveable Alphabet.",
            },
            {
                domainId: "d_mathematics",
                narrative:
                    "Amara works confidently with the Number Rods and is starting to associate the Sandpaper Numbers with their quantities.",
            },
            {
                domainId: "d_cultural",
                narrative:
                    "Her favourite Cultural work is the Continent Globe — she can name each continent unprompted.",
            },
        ],
    },
    {
        id: "rep_kofi_update",
        studentId: "stu_kofi",
        classroomId: "class_primary",
        type: "activity-update",
        status: "draft",
        createdAt: daysAgo(3),
        summary:
            "Kofi continues to settle well into the classroom and is beginning to repeat chosen works.",
        sections: [
            {
                domainId: "d_practical_life",
                narrative: "Kofi is practising Pouring Water each day and his control is improving.",
            },
            {
                domainId: "d_sensorial",
                narrative: "He has been introduced to the Red Rods this week.",
            },
        ],
    },
    {
        id: "rep_jude_eot",
        studentId: "stu_jude",
        classroomId: "class_elementary",
        type: "end-of-term",
        status: "sent",
        createdAt: daysAgo(18),
        approvedAt: daysAgo(16),
        sentAt: daysAgo(14),
        summary: "Jude has made steady progress across Language Arts and Mathematics this term.",
        sections: [
            {
                domainId: "d_lang_arts",
                narrative: "Jude's Creative Writing shows a growing vocabulary and clear voice.",
            },
            {
                domainId: "d_math_elem",
                narrative: "Fraction Work is now solid; Long Division is next.",
            },
        ],
    },
];

// ─── Agent chat history ──────────────────────────────────────────────

export const initialAgentThreads: AgentThread[] = [
    {
        id: "thread_primary_today",
        role: "teacher-primary",
        title: "Today",
        createdAt: daysAgo(0),
        messages: [],
    },
    {
        id: "thread_primary_yesterday",
        role: "teacher-primary",
        title: "Yesterday morning",
        createdAt: daysAgo(1),
        messages: [
            {
                id: "m1",
                role: "user",
                createdAt: daysAgo(1),
                text: "Amara mastered the Pink Tower today and Kofi is practising Pouring Water.",
                inputMethod: "text",
            },
            {
                id: "m2",
                role: "agent",
                createdAt: daysAgo(1),
                card: {
                    kind: "confirmation",
                    heading: "Here's what I'm going to update",
                    status: "confirmed",
                    committedAt: daysAgo(1),
                    changes: [
                        {
                            kind: "observation",
                            summary: "Amara — Pink Tower → Mastered",
                            payload: {
                                studentId: "stu_amara",
                                topicId: "t_d_sensorial_pink_tower",
                                level: "mastered",
                            },
                        },
                        {
                            kind: "observation",
                            summary: "Kofi — Pouring Water → Practising",
                            payload: {
                                studentId: "stu_kofi",
                                topicId: "t_d_practical_life_pouring_water",
                                level: "practising",
                            },
                        },
                    ],
                },
            },
        ],
    },
    {
        id: "thread_primary_attendance",
        role: "teacher-primary",
        title: "Monday register",
        createdAt: daysAgo(3),
        messages: [
            {
                id: "a1",
                role: "user",
                createdAt: daysAgo(3),
                text: "Kofi and Temi are absent today, everyone else is present.",
                inputMethod: "voice",
            },
            {
                id: "a2",
                role: "agent",
                createdAt: daysAgo(3),
                card: {
                    kind: "confirmation",
                    heading: "Here's today's register",
                    status: "confirmed",
                    committedAt: daysAgo(3),
                    changes: [
                        {
                            kind: "attendance",
                            summary: "Marking Kofi and Temi absent — 6 of 8 students present",
                            payload: {
                                absentIds: ["stu_kofi", "stu_temi"],
                                date: dateStr(3),
                            },
                        },
                    ],
                },
            },
        ],
    },
    {
        id: "thread_primary_progress",
        role: "teacher-primary",
        title: "Amara's progress",
        createdAt: daysAgo(5),
        messages: [
            {
                id: "p1",
                role: "user",
                createdAt: daysAgo(5),
                text: "Show me Amara's progress",
                inputMethod: "text",
            },
            {
                id: "p2",
                role: "agent",
                createdAt: daysAgo(5),
                text: "Here's Amara's grid — she's strongest in Sensorial and Cultural, and just starting Language.",
                card: {
                    kind: "grid-preview",
                    studentId: "stu_amara",
                },
            },
        ],
    },
    {
        id: "thread_admin_today",
        role: "admin",
        title: "Today",
        createdAt: daysAgo(0),
        messages: [],
    },
    {
        id: "thread_admin_curriculum",
        role: "admin",
        title: "Curriculum change",
        createdAt: daysAgo(7),
        messages: [
            {
                id: "c1",
                role: "user",
                createdAt: daysAgo(7),
                text: "Add a new domain called Social-Emotional Development to the Primary curriculum",
                inputMethod: "text",
            },
            {
                id: "c2",
                role: "agent",
                createdAt: daysAgo(7),
                card: {
                    kind: "confirmation",
                    heading: "Here's what I'm going to update",
                    status: "confirmed",
                    committedAt: daysAgo(7),
                    changes: [
                        {
                            kind: "curriculum",
                            summary: "Add domain: Social-Emotional Development (Primary)",
                            payload: {
                                domainName: "Social-Emotional Development",
                                level: "primary",
                                topics: ["Turn-taking", "Conflict Resolution", "Emotional Regulation"],
                            },
                        },
                    ],
                },
            },
        ],
    },
    {
        id: "thread_elementary_today",
        role: "teacher-elementary",
        title: "Today",
        createdAt: daysAgo(0),
        messages: [],
    },
];
