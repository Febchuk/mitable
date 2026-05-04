/**
 * Default Montessori scope-and-sequence preloaded for new schools.
 *
 * Hierarchy (4 levels):
 *   Curriculum  — Level (e.g. "Primary 3–6")
 *     Subject   — Domain (e.g. "Mathematics")
 *       Topic   — Sub-Domain (e.g. "Decimal System")
 *         Subtopic — Lesson / Material (e.g. "Intro to Golden Beads")
 *
 * Subtopic strings are kept short so the list stays scannable. Admins can
 * rename, add, or remove anything freely from the curriculum admin page.
 */

export interface DefaultTopic {
  name: string;
  subtopics: string[];
}

export interface DefaultSubject {
  name: string;
  topics: DefaultTopic[];
}

export interface DefaultCurriculum {
  id: string;
  name: string;
  ageRange: string;
  subjects: DefaultSubject[];
}

export const DEFAULT_CURRICULA: DefaultCurriculum[] = [
  {
    id: "infant-toddler",
    name: "Infant & Toddler",
    ageRange: "0–3 years",
    subjects: [
      {
        name: "Practical Life",
        topics: [
          {
            name: "Care of Person",
            subtopics: [
              "Washing hands",
              "Brushing teeth",
              "Nose blowing",
              "Putting on a coat (flip over head)",
              "Dressing frames (Velcro, large button, zipper)",
              "Undressing & dressing",
            ],
          },
          {
            name: "Care of Environment",
            subtopics: [
              "Dusting a shelf",
              "Watering a plant",
              "Folding cloths",
              "Sweeping (small broom)",
              "Mopping a spill",
              "Arranging flowers",
            ],
          },
          {
            name: "Food Preparation",
            subtopics: [
              "Peeling a banana",
              "Slicing a banana (dull knife)",
              "Spreading (butter or jam)",
              "Pouring water (small pitcher)",
              "Setting a placemat",
            ],
          },
          {
            name: "Grace and Courtesy",
            subtopics: ["Greeting a teacher", "Waiting for a turn", "Offering a snack"],
          },
        ],
      },
      {
        name: "Psychomotor (Movement)",
        topics: [
          {
            name: "Gross Motor",
            subtopics: [
              "Walking a line",
              "Carrying a tray",
              "Climbing stairs",
              "Pushing a wagon",
            ],
          },
          {
            name: "Fine Motor",
            subtopics: [
              "Bead stringing",
              "Pegs in a board",
              "Coin box (object permanence)",
              "Using a screwdriver (toy)",
              "Opening & closing containers",
            ],
          },
        ],
      },
      {
        name: "Language",
        topics: [
          {
            name: "Oral Language",
            subtopics: [
              "Object-to-object matching",
              "Object-to-picture matching",
              "Parts of the body",
              "Animal nomenclature",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "primary",
    name: "Primary",
    ageRange: "3–6 years",
    subjects: [
      {
        name: "Practical Life",
        topics: [
          {
            name: "Preliminary",
            subtopics: ["Carrying a mat", "Rolling & unrolling a mat", "Walking around a mat"],
          },
          {
            name: "Control of Movement",
            subtopics: [
              "Pouring (rice → beans → water)",
              "Spooning",
              "Tweezing",
              "Using a funnel",
              "The silence game",
              "Walking on the line",
            ],
          },
          {
            name: "Care of Self",
            subtopics: [
              "Dressing frames (safety pin, bow tying, lacing)",
              "Hand washing",
              "Polishing shoes",
            ],
          },
          {
            name: "Care of Environment",
            subtopics: [
              "Table scrubbing",
              "Metal polishing",
              "Wood polishing",
              "Sweeping dust to a square",
            ],
          },
        ],
      },
      {
        name: "Sensorial",
        topics: [
          {
            name: "Visual",
            subtopics: [
              "Pink Tower",
              "Brown Stair",
              "Red Rods",
              "Knobbed Cylinders",
              "Knobless Cylinders",
              "Color Tablets (1, 2, 3)",
              "Geometric Cabinet",
              "Botany Cabinet",
              "Binomial Cube",
              "Trinomial Cube",
            ],
          },
          {
            name: "Tactile",
            subtopics: [
              "Rough/Smooth Boards",
              "Touch Tablets",
              "Fabric Box",
              "Thermic Tablets",
              "Baric Tablets",
            ],
          },
          {
            name: "Auditory",
            subtopics: ["Sound Cylinders", "Musical Bells (matching & grading)"],
          },
          {
            name: "Olfactory & Gustatory",
            subtopics: ["Smelling Bottles", "Tasting Jars"],
          },
          {
            name: "Stereognostic",
            subtopics: ["Mystery Bag", "Sorting Grains", "Geometric Solids"],
          },
        ],
      },
      {
        name: "Mathematics",
        topics: [
          {
            name: "Numbers 1–10",
            subtopics: ["Number Rods", "Sandpaper Numbers", "Spindle Box", "Cards & Counters"],
          },
          {
            name: "Decimal System",
            subtopics: [
              "Intro to Golden Beads (Unit, Ten, Hundred, Thousand)",
              "Formation of Numbers (Bird's Eye View)",
              "45-Layout",
              "Change Game",
            ],
          },
          {
            name: "Operations (Golden Beads)",
            subtopics: [
              "Addition (static & dynamic)",
              "Subtraction (static & dynamic)",
              "Multiplication",
              "Division",
            ],
          },
          {
            name: "Linear Counting",
            subtopics: [
              "Teen Board (quantity & symbols)",
              "Ten Board",
              "Bead Chains (100 & 1000)",
            ],
          },
          {
            name: "Memorization",
            subtopics: [
              "Addition Snake Game",
              "Subtraction Snake Game",
              "Addition Strip Board",
              "Multiplication Bead Board",
              "Unit Division Board",
            ],
          },
          {
            name: "Fractions",
            subtopics: ["Intro to Fraction Circles (1/1 to 1/10)"],
          },
        ],
      },
      {
        name: "Language",
        topics: [
          {
            name: "Pre-Writing",
            subtopics: ["Metal Insets", "Sandpaper Letters", "Sand Tray"],
          },
          {
            name: "Writing & Reading",
            subtopics: [
              "Large Movable Alphabet",
              "Phonetic Object Box",
              "Green Series (phonograms)",
              "Puzzle Words (sight words)",
            ],
          },
          {
            name: "Function of Word",
            subtopics: ["Noun Game (symbol)", "Adjective Game", "Verb Game (actions)"],
          },
        ],
      },
    ],
  },
  {
    id: "lower-elementary",
    name: "Lower Elementary",
    ageRange: "6–9 years",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          {
            name: "Decimal System",
            subtopics: ["Wooden Hierarchical Material", "Large Bead Frame"],
          },
          {
            name: "Operations",
            subtopics: [
              "Stamp Game",
              "Bead Frame Addition & Subtraction",
              "Checkerboard (long multiplication)",
              "Racks & Tubes (long division)",
            ],
          },
          {
            name: "Fractions",
            subtopics: [
              "Equivalence with Fraction Circles",
              "Addition & Subtraction (like denominators)",
            ],
          },
        ],
      },
      {
        name: "Geometry",
        topics: [
          {
            name: "Concepts",
            subtopics: ["Point", "Line", "Surface", "Solid"],
          },
          {
            name: "Lines",
            subtopics: [
              "Straight",
              "Curved",
              "Ray",
              "Line Segment",
              "Parallel",
              "Divergent",
              "Perpendicular",
            ],
          },
          {
            name: "Angles",
            subtopics: ["Acute", "Right", "Obtuse", "Straight", "Reflex"],
          },
          {
            name: "Shapes",
            subtopics: [
              "Construction of Triangles",
              "Quadrilateral Box",
              "Circle Nomenclature",
            ],
          },
        ],
      },
      {
        name: "Language",
        topics: [
          {
            name: "Grammar",
            subtopics: [
              "Noun (common & proper)",
              "Article",
              "Adjective (comparison)",
              "Verb (tense)",
              "Adverb",
              "Preposition",
              "Conjunction",
              "Pronoun",
              "Interjection",
            ],
          },
          {
            name: "Sentence Analysis",
            subtopics: ["Subject & Predicate", "Direct Object", "Indirect Object"],
          },
          {
            name: "Word Study",
            subtopics: ["Compound Words", "Suffixes", "Prefixes", "Synonyms", "Homonyms"],
          },
        ],
      },
      {
        name: "History & Geography",
        topics: [
          {
            name: "The Great Lessons",
            subtopics: [
              "Coming of the Universe",
              "Coming of Life",
              "Coming of Humans",
            ],
          },
          {
            name: "History",
            subtopics: ["Timeline of Life", "Clock of Eras", "Fundamental Needs of Humans"],
          },
          {
            name: "Geography",
            subtopics: [
              "Layers of the Earth",
              "Volcanoes",
              "The Water Cycle",
              "Wind Currents",
              "Maps of the Continents",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "upper-elementary",
    name: "Upper Elementary",
    ageRange: "9–12 years",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          {
            name: "Fractions & Decimals",
            subtopics: [
              "Multiplication & Division of Fractions",
              "Decimal Board",
              "Percentages",
            ],
          },
          {
            name: "Squaring & Cubing",
            subtopics: ["Decanomial Square", "Square Root (Peg Board)", "Cube Root"],
          },
          {
            name: "Pre-Algebra",
            subtopics: [
              "Signed Numbers (negative)",
              "Balance Scale (solving for x)",
              "Binomial & Trinomial Formulae",
            ],
          },
        ],
      },
      {
        name: "Geometry",
        topics: [
          {
            name: "Measurement",
            subtopics: ["Protractor use", "Compass use"],
          },
          {
            name: "Area",
            subtopics: [
              "Rectangle",
              "Parallelogram",
              "Triangle",
              "Rhombus",
              "Trapezoid",
              "Circle",
            ],
          },
          {
            name: "Volume",
            subtopics: ["Prisms", "Pyramids"],
          },
        ],
      },
      {
        name: "Biology & Science",
        topics: [
          {
            name: "Botany",
            subtopics: [
              "Detailed Plant Kingdom (vascular & non-vascular)",
              "Photosynthesis",
            ],
          },
          {
            name: "Zoology",
            subtopics: [
              "Animal Kingdom Classification (Phylum, Class, Order, Genus, Species)",
            ],
          },
          {
            name: "Human Body",
            subtopics: [
              "Skeletal System",
              "Muscular System",
              "Circulatory System",
              "Nervous System",
              "Digestive System",
            ],
          },
          {
            name: "Chemistry",
            subtopics: ["Atoms", "Molecules", "Elements", "Periodic Table (intro)"],
          },
        ],
      },
      {
        name: "Language",
        topics: [
          {
            name: "Grammar & Logic",
            subtopics: [
              "Verb Conjugation (mood & voice)",
              "Clause Analysis",
              "Sentence Diagramming",
            ],
          },
          {
            name: "Composition",
            subtopics: [
              "Creative Writing",
              "Expository Writing",
              "Bibliography",
              "Persuasive Essays",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "adolescent",
    name: "Adolescent",
    ageRange: "12–15+ years",
    subjects: [
      {
        name: "Occupations (Applied Curriculum)",
        topics: [
          {
            name: "Production",
            subtopics: ["Garden Management", "Animal Husbandry", "Culinary Arts", "Carpentry"],
          },
          {
            name: "Business",
            subtopics: [
              "Accounting & Bookkeeping",
              "Marketing",
              "Micro-Economy Management",
            ],
          },
        ],
      },
      {
        name: "Humanities",
        topics: [
          {
            name: "History",
            subtopics: [
              "Social Justice",
              "Evolution of Law",
              "Political Systems",
              "Contemporary World Issues",
            ],
          },
          {
            name: "Ethics",
            subtopics: ["Seminar discussions on literature & morality"],
          },
        ],
      },
      {
        name: "Science & Math (Applied)",
        topics: [
          {
            name: "Applied Science",
            subtopics: [
              "Environmental Science",
              "Physics of Machines",
              "Biology of Growth",
            ],
          },
          {
            name: "Applied Math",
            subtopics: [
              "Personal Finance",
              "Statistics",
              "Trigonometry",
              "Calculus (intro)",
            ],
          },
        ],
      },
    ],
  },
];
