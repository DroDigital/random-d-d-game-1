# Suno prompts for every piece of music in Oathguard

The game currently uses CC0 placeholder music (Ninja Adventure, Kenney). These
prompts are for generating a cohesive replacement soundtrack in Suno.

## How to use them

- In Suno, use **Custom** mode and switch **Instrumental** on.
- Paste **Style** into "Style of Music".
- Paste **Exclude** into "Exclude styles" (Suno's negative prompt).
- Paste **Structure** into the Lyrics box. With Instrumental on, the section tags
  still steer the arrangement.
- Generate a few takes and keep the one whose start and end loop cleanly.
- Replace the file named under **File** (export as MP3), then run `npm run build`.
  The audio plays from `assets/audio/music/`, and the context → file mapping is the `MUSIC` table in
  `src/core/audio.js`.

## Shared musical identity

Use this across every track so the soundtrack feels like one game:

- **Palette:** dark-medieval chamber instruments (bowed psaltery, hurdy-gurdy,
  viola da gamba, frame drum, low male choir hums, church organ, music box).
  They play through a slightly degraded late-90s sampler: lo-fi, mono-ish
  reverb, gentle tape wobble. That is the PS1-era sound that matches the visual
  filter.
- **Recurring motif ("the Oath"):** a four-note figure (root, minor third,
  fourth, root an octave down) that every track quotes somewhere.
- **Key centres:**
  - D minor: crypt
  - E Phrygian: ossuary
  - C minor: abyss
  - G major / Dorian: shrine
  - D major: victory

## Shared exclusions

Add these to every **Exclude** box, plus the track-specific ones:

```
vocals, lyrics, rap, EDM drop, dubstep, trap hi-hats, modern pop, autotune, bright synth lead, happy ukulele, glossy Hollywood trailer
```

---

## Keeping the drums in the background

Suno leans hard into rhythm. Any mention of war drums, taiko, pulse, "driving"
or "relentless" tends to produce a beat-led track with a dominant low end.
The first Crypt prompt did exactly that: over half of the track's energy sat
below 150 Hz, with a locked kick at about 120 BPM. What helps:

- **Lead with the instruments that should be in front**: "melody-led",
  "organ-led", "psaltery melody in the foreground".
- **Describe percussion as rare and far away**: "very sparse distant soft hand
  drum low in the mix", "no drum kit". Never say "drums on beats 1 and 3".
- **Keep the tempo slow**: 65–80 BPM for exploration beds.
- **Put rhythm words in Exclude**: steady drum beat, driving percussion, taiko,
  war drums, four-on-the-floor, loud kick, booming low end, trailer percussion.
- **Keep the structure tags free of beat sections**: use Theme, Development,
  Tension and Reprise rather than Chorus or Drop.
- If a take still comes out beat-heavy, use **Extend** from a quiet moment, or
  regenerate with the same prompt. Takes vary a lot.

Boss tracks can keep more percussion. Even there, ask for "timpani and drums
supporting the orchestra" rather than drums leading.

---

## 1. Title screen
**Context:** the main menu over the shrine and the four idle heroes. Plays for minutes, must not tire.
**File:** `assets/audio/music/na_intro.mp3` (`title`)

**Style**
```
dark medieval ambient, slow 64 bpm, D minor, solo hurdy-gurdy drone with bowed psaltery melody, distant low male choir hums, soft frame drum heartbeat, crackling fire texture, PS1-era sampler reverb, lo-fi tape warmth, melancholic and reverent, sparse, seamless loop
```
**Exclude**
```
shared list + orchestral swell, epic brass, fast tempo, percussion fills, bright major key
```
**Structure**
```
[Instrumental]
[Intro: fire crackle and drone]
[Theme: psaltery states the four-note Oath motif]
[Verse: choir hums join, drone shifts to the fourth]
[Bridge: music box echoes the motif]
[Outro: back to drone, loops into intro]
```

## 2. Character select ("The Gathering")
**Context:** players join and pick classes. It should feel like anticipation before a journey.
**File:** `assets/audio/music/na_curse.mp3` (`select`)

**Style**
```
medieval tavern-at-midnight, 84 bpm, D Dorian, plucked lute ostinato, viola da gamba countermelody, frame drum and finger cymbals, low choir "ooh" pads, hopeful but uneasy, PS1-era sample library, warm lo-fi reverb, loopable
```
**Exclude**
```
shared list + jolly tavern jig, fiddle hoedown, accordion, celebration
```
**Structure**
```
[Instrumental]
[Intro: lute ostinato alone]
[Verse: gamba melody, light frame drum]
[Chorus: Oath motif in octaves, choir pad]
[Verse 2: drum pattern doubles]
[Outro: lute ostinato, clean loop point]
```

## 3. Depth I: The Sunken Crypt (exploration and combat)
**Context:** skeletons, ghosts, wet stone. Most of a run is spent here, under constant sword, spell and dice sounds, so the music is a tense **bed**, not a battle anthem. The melody and drones lead; percussion is rare and far away.
**File:** `assets/audio/music/na_crypt.mp3` (`crypt`)

**Style**
```
dark ambient dungeon exploration, slow 72 bpm, D minor, melody-led, sustained low strings and viola da gamba drone, lonely bowed psaltery melody in the foreground, soft church organ chords, distant wordless choir, water drips and faint chains, very sparse distant soft hand drum low in the mix, no drum kit, PS1-era horror game soundtrack, lo-fi sampler, cold, uneasy, spacious, seamless loop
```
**Exclude**
```
shared list + steady drum beat, driving percussion, war drums, taiko, four-on-the-floor, loud kick, booming low end, trailer percussion, battle music, heroic fanfare, electric guitar
```
**Structure**
```
[Instrumental]
[Intro: low drone, water drips]
[Theme: psaltery plays the Oath motif slowly over the drone]
[Development: gamba countermelody, soft organ chords, one distant drum hit]
[Tension: string tremolo swells, no percussion]
[Theme reprise: choir hums the motif, drone deepens]
[Outro: drone and drips only, loops into intro]
```

## 4. Depth II: The Fungal Ossuary
**Context:** orcs, myconids, oozes, sepia bone halls. Organic, rotten, a little alien. Texture over rhythm.
**File:** `assets/audio/music/na_dark_castle.mp3` (`ossuary`)

**Style**
```
dark ambient fungal cavern, slow 68 bpm, E Phrygian, texture-led, soft wooden marimba and bone chime motif in the foreground, droning low hurdy-gurdy, breathy throat-singing pad, wet organic foley and dripping, occasional muffled distant hand drum low in the mix, no drum kit, PS1-era sampler grit, claustrophobic, eerie, slowly breathing, seamless loop
```
**Exclude**
```
shared list + steady drum beat, tribal drum circle, stomping rhythm, driving percussion, taiko, loud kick, booming low end, world-music groove, tropical
```
**Structure**
```
[Instrumental]
[Intro: drips and a low drone]
[Theme: marimba states the Oath motif in Phrygian, slowly]
[Development: hurdy-gurdy joins, throat-singing pad swells]
[Bridge: everything thins to drone and squelches]
[Theme reprise: bone chimes answer the marimba]
[Outro: drone only, loop point]
```

## 5. Depth III: The Ember Abyss
**Context:** demons, will-o-wisps and drakes before the final boss. Hot and grand, but still a bed under the fighting: the grandeur comes from organ and choir, not drums.
**File:** `assets/audio/music/na_final_area.mp3` (`abyss`)

**Style**
```
dark ambient infernal cathedral, slow 76 bpm, C minor, organ-led, deep church organ pedal and slow chord progression, mournful cello melody in the foreground, distant low choir chanting softly, crackling fire and ember foley, rare far-off timpani swell low in the mix, no drum kit, PS1-era epic dungeon soundtrack, lo-fi sampler warmth, ominous, vast, simmering, seamless loop
```
**Exclude**
```
shared list + steady drum beat, driving percussion, taiko, war drums, anvil hits, loud kick, booming low end, trailer braams, battle music, electric guitar
```
**Structure**
```
[Instrumental]
[Intro: organ pedal tone, fire crackle]
[Theme: cello plays the Oath motif over slow organ chords]
[Development: choir enters softly, one distant timpani swell]
[Climax: full organ chord, choir rises, still no beat]
[Outro: organ pedal and fire, loop point]
```

## 6. Boss: Morvayne, the Hollow Bishop (Depth I)
**Context:** a necromancer bishop who raises the dead and blinks around. Gothic, liturgical, wrong.
**File:** `assets/audio/music/na_fight.mp3` (`boss`)

**Style**
```
gothic boss battle, 132 bpm, D minor, corrupted Gregorian choir in Latin-sounding syllables, pipe organ arpeggios, aggressive string ostinato, cathedral bells, pounding timpani, sudden rests, PS1-era souls-like boss theme, lo-fi sampler, dread and grandeur, loopable after intro
```
**Exclude**
```
shared list + hopeful resolution, heroic brass, rock drums
```
**Structure**
```
[Instrumental]
[Intro: single bell toll, organ swell]
[Phase 1: strings and timpani, choir chants]
[Chorus: organ arpeggios, Oath motif inverted]
[Break: one bar of silence, then bell]
[Phase 1 reprise]
[Outro: loop back to Phase 1]
```

## 7. Boss: The Ossuary Colossus (Depth II)
**Context:** a giant bone golem with slams, stomps and wall-charges. Heavy, slow, crushing.
**File:** `assets/audio/music/na_fight2.mp3` (`boss2`)

**Style**
```
colossal boss battle, 92 bpm half-time, E Phrygian, enormous war drums and stomping percussion, bone-on-stone impacts, low brass and tuba ostinato, bowed cello clusters, throat-singing choir, earthquake rumble sub, PS1-era souls-like boss theme, heavy, slow, crushing weight, loopable
```
**Exclude**
```
shared list + fast tempo, playful, metal guitars, light percussion
```
**Structure**
```
[Instrumental]
[Intro: three huge drum hits, rumble]
[Theme: tuba and cello ostinato, stomps]
[Chorus: throat choir sings Oath motif, brass]
[Breakdown: just drums, like footsteps]
[Chorus]
[Outro: loop point]
```

## 8. Final boss: Cindermaw, the Ember Wyrm (Depth III)
**Context:** a dragon that breathes fire, flies and dives. The climax of the run.
**File:** add `assets/audio/music/cindermaw.mp3`, then point `boss3` in `src/core/audio.js` at `music/cindermaw`. It currently reuses the first boss track.

**Style**
```
final boss dragon battle, 140 bpm, C minor to D major in the climax, full choir and church organ, fierce string runs, huge taiko and timpani, roaring brass, fire and wingbeat foley, PS1-era souls-like final boss theme, lo-fi sampler grit, desperate then triumphant, loopable main section
```
**Exclude**
```
shared list + happy ending early, synthwave, metal guitar solo
```
**Structure**
```
[Instrumental]
[Intro: wingbeats, choir sustain]
[Phase 1: string runs, taiko]
[Chorus: full choir, Oath motif in fortissimo]
[Phase 2: tempo push, organ and brass trade blows]
[Climax: brief modulation to major, then back to minor]
[Outro: loop to Phase 1]
```

## 9. Ember Shrine (rest, level up, checkpoint)
**Context:** safety after danger. Bonfire warmth with a hint of grief.
**File:** `assets/audio/music/na_melancholia.mp3` (`shrine`)

**Style**
```
bonfire rest theme, 60 bpm, G major with Dorian sadness, solo nylon guitar and bowed psaltery duet, soft cello, crackling fire, gentle music box echo, PS1-era sampler warmth, intimate, peaceful, bittersweet, seamless loop
```
**Exclude**
```
shared list + drums, percussion, choir, epic swell, tension
```
**Structure**
```
[Instrumental]
[Intro: fire crackle]
[Verse: guitar states Oath motif in major]
[Verse 2: psaltery harmony, cello pad]
[Bridge: music box alone]
[Outro: guitar, loop point]
```

## 10. Ossa the Ash-Merchant (peddler room)
**Context:** a strange, slightly comic shop in the dark.
**File:** `assets/audio/music/flowing_rocks.mp3` (`peddler`)

**Style**
```
eerie merchant theme, 96 bpm, A minor, plucked harpsichord and pizzicato strings, clinking coin percussion, wobbly music box, accordion-like reed organ, a little mischievous, PS1-era shop music, lo-fi sampler charm, short seamless loop
```
**Exclude**
```
shared list + big drums, choir, heroic, horror screams
```
**Structure**
```
[Instrumental]
[Intro: coin clinks and harpsichord]
[Verse: pizzicato melody]
[Chorus: reed organ plays Oath motif with a wink]
[Outro: loop point]
```

## 11. The Dicer's Altar (gamble room)
**Context:** tempting fate on a d20. Ritual, suspense, a coin spinning on its edge.
**File:** `assets/audio/music/infinite_descent.mp3` (`altar`)

**Style**
```
occult ritual suspense, 76 bpm, B minor, ticking clock percussion, rattling dice and bone foley, low cello drone, whispered choir pads, glass harmonica shimmer, slow heartbeat kick, PS1-era mystery music, lo-fi sampler, hypnotic, ominous, seamless loop
```
**Exclude**
```
shared list + upbeat, casino jazz, big drums, triumphant
```
**Structure**
```
[Instrumental]
[Intro: ticking and dice rattle]
[Verse: cello drone, heartbeat]
[Build: glass harmonica rises]
[Hold: everything sustains, no resolution]
[Outro: loop point]
```

## 12. Game over ("The Oath is Broken")
**Context:** the summary screen after the last Ember dies. A lament, not a punishment.
**File:** `assets/audio/music/na_lament.mp3` (`gameover`)

**Style**
```
funeral lament, 54 bpm, D minor, solo cello and low choir, slow tolling bell, ash wind texture, PS1-era sad ending theme, lo-fi tape warmth, grief with dignity, loopable
```
**Exclude**
```
shared list + drums, uplifting, major key, orchestral swell
```
**Structure**
```
[Instrumental]
[Intro: bell toll and wind]
[Verse: cello plays the Oath motif slowly, broken off]
[Verse 2: choir hums the answer]
[Outro: bell, loop point]
```

## 13. Victory ("The Oath is Fulfilled")
**Context:** credits and summary after beating Cindermaw. Earned triumph.
**File:** `assets/audio/music/retro_mystic.mp3` (`victory`)

**Style**
```
triumphant dawn theme, 88 bpm, D major, full choir and church organ, ringing bells, warm strings and brass, frame drum procession, sunrise ambience, PS1-era ending credits music, lo-fi sampler warmth, cathartic, hopeful, loopable
```
**Exclude**
```
shared list + minor key, horror, dissonance, pop drums
```
**Structure**
```
[Instrumental]
[Intro: single bell, then sunrise strings]
[Verse: choir sings the Oath motif in major]
[Chorus: full organ and brass, procession drums]
[Outro: bells, loop point]
```

---

## Short stingers (jingles)

For these, set Suno to the shortest length and trim the result to the duration
given. They replace the files in `assets/audio/jingles/`.

| Event | File | Length | Style | Exclude |
|---|---|---|---|---|
| Room cleared | `hit_00.mp3` | 2–3 s | `short medieval victory sting, low brass and frame drum hit, choir "ah" release, D minor to D major, PS1 sampler` | shared list + long, melody |
| Level up at shrine | `hit_03.mp3` | 2 s | `rising harp glissando into warm choir chord, bell ping, G major, magical, PS1 sampler` | shared list + drums |
| Boon drafted | `hit_05.mp3` | 1–2 s | `sparkling glass harmonica and celesta flourish, ascending, mystical reward chime` | shared list + drums, brass |
| Boss defeated | `hit_10.mp3` | 4 s | `huge organ and choir final chord, timpani roll, cathedral bell, triumphant release, PS1 souls-like "victory achieved" sting` | shared list + melody, pop |
| Hero downed | `hit_08.mp3` | 2 s | `descending detuned cello slide, heartbeat thump, ominous choir breath, sudden dread` | shared list + major key |
