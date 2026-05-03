/**
 * Default Montessori scope-and-sequence preloaded for new schools.
 *
 * Structure:
 *   Curriculum (level, e.g. "Primary 3-6")
 *     Topic (Domain, e.g. "Mathematics")
 *       Subtopic (lesson, e.g. "Pink Tower")
 *
 * Subtopic names are kept short so the list stays scannable. Admins can
 * rename, add, or remove anything freely.
 */

export interface DefaultSubtopic {
  name: string;
}

export interface DefaultTopic {
  name: string;
  subtopics: string[];
}

export interface DefaultCurriculum {
  id: string;
  name: string;
  ageRange: string;
  topics: DefaultTopic[];
}

export const DEFAULT_CURRICULA: DefaultCurriculum[] = [
  {
    id: "infant-toddler",
    name: "Infant & Toddler",
    ageRange: "0–3 years",
    topics: [
      {
        name: "Practical Life",
        subtopics: [
          "Washing hands",
          "Brushing teeth",
          "Nose blowing",
          "Putting on a coat (flip over head)",
          "Dressing frames (Velcro, large button, zipper)",
          "Undressing & dressing",
          "Dusting a shelf",
          "Watering a plant",
          "Folding cloths",
          "Sweeping (small broom)",
          "Mopping a spill",
          "Arranging flowers",
          "Peeling a banana",
          "Slicing a banana (dull knife)",
          "Spreading (butter or jam)",
          "Pouring water (small pitcher)",
          "Setting a placemat",
          "Greeting a teacher",
          "Waiting for a turn",
          "Offering a snack",
        ],
      },
      {
        name: "Psychomotor (Movement)",
        subtopics: [
          "Walking a line",
          "Carrying a tray",
          "Climbing stairs",
          "Pushing a wagon",
          "Bead stringing",
          "Pegs in a board",
          "Coin box (object permanence)",
          "Using a screwdriver (toy)",
          "Opening & closing containers",
        ],
      },
      {
        name: "Language",
        subtopics: [
          "Object-to-object matching",
          "Object-to-picture matching",
          "Parts of the body",
          "Animal nomenclature",
        ],
      },
    ],
  },
  {
    id: "primary",
    name: "Primary",
    ageRange: "3–6 years",
    topics: [
      {
        name: "Practical Life",
        subtopics: [
          "Carrying a mat",
          "Rolling & unrolling a mat",
          "Walking around a mat",
          "Pouring (rice → beans → water)",
          "Spooning",
          "Tweezing",
          "Using a funnel",
          "The silence game",
          "Walking on the line",
          "Dressing frames (safety pin, bow tying, lacing)",
          "Hand washing",
          "Polishing shoes",
          "Table scrubbing",
          "Metal polishing",
          "Wood polishing",
          "Sweeping dust to a square",
        ],
      },
      {
        name: "Sensorial",
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
          "Rough/Smooth Boards",
          "Touch Tablets",
          "Fabric Box",
          "Thermic Tablets",
          "Baric Tablets",
          "Sound Cylinders",
          "Musical Bells (matching & grading)",
          "Smelling Bottles",
          "Tasting Jars",
          "Mystery Bag",
          "Sorting Grains",
          "Geometric Solids",
        ],
      },
      {
        name: "Mathematics",
        subtopics: [
          "Number Rods",
          "Sandpaper Numbers",
          "Spindle Box",
          "Cards & Counters",
          "Intro to Golden Beads (Unit, Ten, Hundred, Thousand)",
          "Formation of Numbers (Bird's Eye View)",
          "45-Layout",
          "Change Game",
          "Addition (static & dynamic)",
          "Subtraction (static & dynamic)",
          "Multiplication",
          "Division",
          "Teen Board (quantity & symbols)",
          "Ten Board",
          "Bead Chains (100 & 1000)",
          "Addition Snake Game",
          "Subtraction Snake Game",
          "Addition Strip Board",
          "Multiplication Bead Board",
          "Unit Division Board",
          "Intro to Fraction Circles (1/1 to 1/10)",
        ],
      },
      {
        name: "Language",
        subtopics: [
          "Metal Insets",
          "Sandpaper Letters",
          "Sand Tray",
          "Large Movable Alphabet",
          "Phonetic Object Box",
          "Green Series (phonograms)",
          "Puzzle Words (sight words)",
          "Noun Game (symbol)",
          "Adjective Game",
          "Verb Game (actions)",
        ],
      },
    ],
  },
  {
    id: "lower-elementary",
    name: "Lower Elementary",
    ageRange: "6–9 years",
    topics: [
      {
        name: "Mathematics",
        subtopics: [
          "Wooden Hierarchical Material",
          "Large Bead Frame",
          "Stamp Game",
          "Bead Frame Addition & Subtraction",
          "Checkerboard (long multiplication)",
          "Racks & Tubes (long division)",
          "Equivalence with Fraction Circles",
          "Addition & Subtraction (like denominators)",
        ],
      },
      {
        name: "Geometry",
        subtopics: [
          "Point, Line, Surface, Solid",
          "Straight, Curved, Ray, Line Segment",
          "Parallel, Divergent, Perpendicular",
          "Acute, Right, Obtuse, Straight, Reflex angles",
          "Construction of Triangles",
          "Quadrilateral Box",
          "Circle Nomenclature",
        ],
      },
      {
        name: "Language",
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
          "Subject & Predicate",
          "Direct Object",
          "Indirect Object",
          "Compound Words",
          "Suffixes",
          "Prefixes",
          "Synonyms",
          "Homonyms",
        ],
      },
      {
        name: "History & Geography",
        subtopics: [
          "Coming of the Universe (Great Lesson 1)",
          "Coming of Life (Great Lesson 2)",
          "Coming of Humans (Great Lesson 3)",
          "Timeline of Life",
          "Clock of Eras",
          "Fundamental Needs of Humans",
          "Layers of the Earth",
          "Volcanoes",
          "The Water Cycle",
          "Wind Currents",
          "Maps of the Continents",
        ],
      },
    ],
  },
  {
    id: "upper-elementary",
    name: "Upper Elementary",
    ageRange: "9–12 years",
    topics: [
      {
        name: "Mathematics",
        subtopics: [
          "Multiplication & Division of Fractions",
          "Decimal Board",
          "Percentages",
          "Decanomial Square",
          "Square Root (Peg Board)",
          "Cube Root",
          "Signed Numbers (negative)",
          "Balance Scale (solving for x)",
          "Binomial & Trinomial Formulae",
        ],
      },
      {
        name: "Geometry",
        subtopics: [
          "Protractor use",
          "Compass use",
          "Area of a Rectangle",
          "Area of a Parallelogram",
          "Area of a Triangle",
          "Area of a Rhombus",
          "Area of a Trapezoid",
          "Area of a Circle",
          "Volume of Prisms",
          "Volume of Pyramids",
        ],
      },
      {
        name: "Biology & Science",
        subtopics: [
          "Plant Kingdom (vascular & non-vascular)",
          "Photosynthesis",
          "Animal Kingdom Classification (Phylum, Class, Order, Genus, Species)",
          "Skeletal System",
          "Muscular System",
          "Circulatory System",
          "Nervous System",
          "Digestive System",
          "Atoms & Molecules",
          "Elements",
          "Periodic Table (intro)",
        ],
      },
      {
        name: "Language",
        subtopics: [
          "Verb Conjugation (mood & voice)",
          "Clause Analysis",
          "Sentence Diagramming",
          "Creative Writing",
          "Expository Writing",
          "Bibliography",
          "Persuasive Essays",
        ],
      },
    ],
  },
  {
    id: "adolescent",
    name: "Adolescent",
    ageRange: "12–15+ years",
    topics: [
      {
        name: "Occupations (Applied Curriculum)",
        subtopics: [
          "Garden Management",
          "Animal Husbandry",
          "Culinary Arts",
          "Carpentry",
          "Accounting & Bookkeeping",
          "Marketing",
          "Micro-Economy Management",
        ],
      },
      {
        name: "Humanities",
        subtopics: [
          "Social Justice",
          "Evolution of Law",
          "Political Systems",
          "Contemporary World Issues",
          "Seminar discussions on literature & morality",
        ],
      },
      {
        name: "Science & Math (Applied)",
        subtopics: [
          "Environmental Science",
          "Physics of Machines",
          "Biology of Growth",
          "Personal Finance",
          "Statistics",
          "Trigonometry",
          "Calculus (intro)",
        ],
      },
    ],
  },
];
