# Auth screen — cartoon hero generation prompt (v2: terracotta dominant)

> **v2 update (May 2026):** First generation was beautiful but used cream as
> the dominant background, which blended into the cream auth form on the
> right and erased the hero/form divide. v2 flips the dominance: **terracotta
> as the dominant warm background, cream/sage/butter as accents inside the
> scene.** This gives strong contrast against the cream form side while
> keeping the same children's-book illustration style.

Generate an illustration for the **Variant 1 (Classroom warmth)** auth hero. The cartoon will sit on the left half of the login + signup screens with a Caveat handwritten Maria Montessori quote overlaid in the lower portion.

## Where to save
- Prototype copy → `_design/assets/auth-hero-cartoon.png`
- Production copy → `apps/mitable-montessori/public/auth/auth-hero-cartoon.png`

(Same image, two locations — the prototype reads from `_design/assets/`, the React app reads from `/auth/...`.)

## Output spec
- **Aspect ratio:** ~3:4 portrait (will be cropped to fill ~50vw × 100vh on desktop, ~30vh full-width on mobile)
- **Resolution:** at least 1600×2200 px
- **Format:** PNG (transparent or warm cream background)
- **Crop strategy:** keep main subject in upper-left third — the lower portion will get a warm gradient overlay + handwritten quote layered on top, so don't put critical detail there

## Brand palette (use these exact colors, no others)
- Canvas cream `#faf6ee` — base/background
- Terracotta `#c46a4f` — primary accent (clothing, tray, flower, occasional warm spot)
- Sage green `#7a9b7a` — secondary (leaves, plants, calm surfaces)
- Butter yellow `#e8c56a` — small accent (sun, fruit, beads)
- Dusty blue `#6b8aa6` — tertiary (occasional)
- Clay brown `#b89880` — warm wood tones, materials
- Ink `#2a2723` — only for outlines / shadows, sparingly

**Do NOT** use: pure white, pure black, primary blue, purple, neon colors, gradients beyond the brand palette.

---

## Prompt (copy-paste into Midjourney / ChatGPT image / nano-banana / Imagen)

```
A warm, hand-painted children's-book style cartoon illustration of a peaceful
Montessori classroom corner — set against warm terracotta-painted walls and
floor. Two or three children, faces gentle and contemplative, working
independently with classic Montessori materials — wooden pink tower, a tray
with small ceramic pitcher, fresh flowers in a clay vase, polished wooden
beads on a felt mat. Late-afternoon golden sunlight pours in from the side.
A small potted plant with sage-green leaves. The atmosphere is calm,
focused, and joyful — children doing real, dignified work.

** CRITICAL — color dominance: **
The DOMINANT background color is warm terracotta (#c46a4f) — covering walls,
floor, and most of the negative space. This is NOT a cream/white-paper
illustration. The terracotta should fill ~60-70% of the visible canvas as
the warm wall and floor of the classroom. Cream and sage are ACCENTS only,
appearing in: ceramic pitchers, the felt mat, plant leaves, sunlight pools,
small objects. Children's clothing should mix — one in cream/off-white,
one in butter-yellow, terracotta tones for warmth.

Style: gouache + watercolor children's-book illustration, slightly
imperfect organic linework, hand-painted texture visible, warm and tactile,
in the spirit of Beatrix Potter, Jon Klassen, or Carson Ellis but more
contemporary and cheerful. Painterly brushstrokes visible on the
terracotta walls — not flat color, but warm hand-painted texture with
subtle variation between deeper and lighter terracotta tones.

Color palette (strict, no other colors):
- DOMINANT background: warm terracotta #c46a4f (walls, floor, ~60-70% of image)
- Cream/off-white #faf6ee — accent (ceramics, sunlight, mat, some clothing)
- Sage green #7a9b7a — accent (plants, calming surface details)
- Butter yellow #e8c56a — accent (sunlight pools, small details, clothing)
- Warm clay brown #b89880 — wooden Montessori materials
- Dusty blue #6b8aa6 — very small accents only (one detail, like a small bowl)
- Dark ink #2a2723 — only for thin outlines and small shadows

Composition: portrait orientation, 3:4 aspect ratio. Main subject and
activity in upper two-thirds. Lower third should be calmer / less detailed
(softer terracotta, fewer objects) to leave room for a handwritten quote
overlay in white text. No text or lettering in the image.

Mood: warmth, focus, dignity, the quiet satisfaction of self-directed
work. The terracotta walls should feel like a sun-warmed adobe room or a
cozy kindergarten in a Mediterranean villa — not muddy, not orange,
specifically a soft warm terracotta brick color. Children's-book cover
quality, museum gift-shop print quality.

Negative prompt (do NOT include): photorealism, 3D render, text or letters,
logos, screens or devices, cartoony big-eyes anime style, generic flat
vector / corporate / unDraw / Storyset aesthetic, neon colors, gradients
outside the brand palette, sad or anxious expressions, adults in foreground,
classroom desks in rows, cream/white as the dominant background, beige rooms,
gray walls, blue/green wall colors.
```

## Iteration tips
- If terracotta isn't dominant enough → "the WALLS and FLOOR are terracotta, fill 70% of the canvas with terracotta, only small cream accents"
- If terracotta drifts orange or muddy → "soft warm terracotta #c46a4f, like sun-warmed brick, not orange, not red"
- If first generation feels too busy → ask for "fewer subjects, more whitespace, calmer composition"
- If colors drift → reinforce "strictly only these hex colors: #c46a4f (dominant) #faf6ee #7a9b7a #e8c56a #b89880"
- If style feels too corporate/flat → push toward "gouache, watercolor, Beatrix Potter, painterly texture"
- If children look too cartoony → "subtle, gentle expressions, painterly faces, not anime, not Pixar"
- If lower third is too detailed → "lower portion of image is calm soft terracotta with minimal objects, room for white handwritten text overlay"

## After generating
1. Save to `_design/assets/auth-hero-cartoon.png`
2. Copy to `public/auth/auth-hero-cartoon.png` (production will read from there)
3. Refresh `_design/auth-screens.html` — the placeholder text disappears and your image fills the hero
4. Tell me it's in place and I'll continue with Phase B (production Next.js implementation)
