# Three local co-op D&D 5e game concepts

All three are built for 1–4 players on one screen (couch co-op), use real 5e
mechanics under the hood (d20 vs AC, saving throws, advantage, damage types,
death saves, spell slots), and mix in another genre.

---

## 1. OATHGUARD (working title: Ashen Oath) — souls-like × roguelite × 5e (★ built in this repo)

> *"A couch co-op souls-roguelite of the Fifth Edition."*

**Pitch.** Hades-style branching rooms meet Dark Souls-style combat, but every
swing is a d20 attack roll that tumbles out of your weapon as a physical 3D die.
Your skill decides *whether* you are in position; the dice decide *how well*.

**Genres mixed**
- **Souls-like:** stamina for every swing and dodge, i-frames, red ground
  telegraphs, poise/stagger, healing flasks, bonfire checkpoints ("Ember
  Shrines"), your currency (Ash) is dropped where the party wipes and must be
  reclaimed.
- **Roguelite:** three procedurally generated Depths of branching rooms (battle,
  elite, vault, peddler, Dicer's Altar, trial, shrine, boss), drafted boons, a
  permanent Reliquary of unlocks, Hades-style **Vows** for difficulty.
- **D&D 5e:** six classes, levels 1–10 with real class features (Extra Attack,
  Sneak Attack, Improved Critical, Fireball at 5th), ability scores, saving
  throws, death saves, spell slots, resistances/vulnerabilities, flanking,
  conditions (prone, frightened, poisoned, hexed, restrained-ish freeze).

**Why it is fun together**
- Flanking gives advantage, so players naturally surround foes.
- The Rogue's Sneak Attack triggers when an ally is next to the target.
- The Druid's Healing Word revives downed friends from range.
- **Pact Bonds:** when two players each hold two boons of the same pact
  (Ember, Rime, Dawn, Grave, Storm, Fang), *both* gain that pact's power.
- One Ember (life) pool for the whole party creates shared tension.

**Replayability**: seeded procedural rooms, ~45 boons across 6 pacts with
solo Attunements and co-op Bonds, 6 classes × 4 colour variants, elite affixes,
3 multi-phase bosses, 7 Vows, 8 permanent unlocks, a gambling altar.

---

## 2. TAVERN OF ECHOES — tactical deckbuilder × time-loop × 5e

**Pitch.** Every night the same tavern is attacked by the same cult. You are the
adventurers who remember. Each loop is a turn-based grid fight where your hand
of cards *is* your action economy (Action / Bonus Action / Reaction / Movement
cards), drawn from a deck built from your 5e class.

**Genres mixed**
- **Deckbuilder** (Slay the Spire): spells and maneuvers are cards; spell
  slots are mana crystals; short rests let you redraw.
- **Time-loop mystery** (Outer Wilds / Loop Hero): the tavern resets every
  night, but knowledge persists. Clues found in one loop unlock dialogue,
  shortcuts and new cards in the next.
- **5e tactics:** opportunity attacks, cover, concentration, reactions
  played *out of turn* from your hand, which makes co-op timing exciting.

**Co-op hook:** reactions can be played on an ally's turn ("Shield!",
"Sentinel!"), so players talk constantly. Pass-the-controller or simultaneous
planning.

---

## 3. DELVE & DIG — colony sim × dungeon-building × 5e

**Pitch.** You are a company of dwarven adventurers who must *build* the
dungeon you defend. During the day you dig tunnels, place traps and recruit
monsters; at night rival parties of 5e adventurers raid you, and you fight them
in real time.

**Genres mixed**
- **Colony/base builder** (Dwarf Fortress-lite, Dungeon Keeper): dig, haul,
  craft magic items, manage morale.
- **Tower defense:** traps with saving-throw DCs (spike pits = DEX save,
  glyphs of warding = INT save), monster lairs with CR budgets.
- **Action RPG nights:** each player possesses a champion and fights the
  raiding party in a top-down brawler using 5e stat blocks.

**Co-op hook:** split roles: one player engineers traps, one runs logistics,
two defend. Raids escalate in Challenge Rating, and you level your company.

---

### Why Oathguard was the one to build

It is the most immediately *fun on a couch*: real-time action reads well on
one screen, every input gives instant feedback (and a satisfying die), the
roguelite loop is short (20–40 min a run) and endlessly replayable, and the
5e layer adds a texture no other souls-like has. The other two concepts are
excellent follow-ups that can reuse this codebase's rules engine, dice
renderer, asset pipeline and PSX filter.
