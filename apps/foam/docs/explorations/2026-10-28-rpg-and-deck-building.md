# Foam: RPG and deck-building elements

Started: 2026-10-28. Branch: `foam-rpg-and-deck-building`. An exploration, not a spec: nothing here
is decided, and `direction.md` stays the source of truth.

## Progress

- [x] Pass 1: what "RPG elements" and "deck-building elements" could mean for Foam.
- [ ] Review of pass 1 by the author, and answers to its questions.
- [ ] Pass 2: concrete game design ideas for the shortlisted readings.

## The brief

Look at what Foam would become with RPG elements and deck-building elements added. The brief is
vague on purpose, so the work runs in two passes:

1. **Pass 1** lists what the words could mean, maps each meaning onto what Foam already has, and
   picks the meanings worth designing.
2. **Pass 2** designs those: mechanics, a night played with them, and what they cost.

It is an open exploration. Where an idea collides with a principle or decision in `direction.md`,
the collision is written down, not used to rule the idea out.

## What Foam has to build on

- **The night.** 16:00 to 08:00 in Brno, spent as a budget: every choice can cost minutes, money
  and drinks, and can require a level of drunkenness.
- **Chance.** Dice with shown odds, rolled from the seed. Scenes come in versions picked by the
  seed, so two players with one seed play one night.
- **State.** Time, money, drunkenness, four quest flags (bottle, bottle given, keys, ticket), the
  events met tonight, the log.
- **Across nights.** The story collection, the record of nights, the texts read.
- **Phase 8.** The phone, and the author as a person who can be met.

What the player lacks: anything that describes _them_. Every verb is a choice written for one
button of one place, nothing the player carries works in two places, and the player is the same
person at 08:00 as at 16:00. Both families of ideas fill that gap from different sides.

## Pass 1: what "RPG elements" could mean

Combat, the core of most RPGs, is left out: Foam's conflicts are social, and its equivalent of a
fight is a conversation that can go wrong. What is left falls into four groups.

**Who you are**

- **Attributes.** A few numbers, such as nerve, charm, stamina and local knowledge, that set the
  odds of rolls. Foam's dice already show odds; today they are fixed per choice, with attributes
  they would be the player's. (Disco Elysium, Fallen London.)
- **Background.** Who gets off the train: a student, a local coming home, a tourist, someone on a
  work trip. It sets the start money, the attributes and which choices exist. (Citizen Sleeper.)
- **Traits.** Who the player turns out to be, grown from their choices during the night: generous,
  a liar, a regular. Self-expression rather than power. (Disco Elysium's thought cabinet.)

**What you carry**

- **Inventory.** Things in the pockets that open or change choices: a lighter, an umbrella, a tram
  pass, a borrowed jacket. The four quest flags are already items in disguise.
- **Condition.** More of the body than drunkenness: tiredness, hunger, mood, phone battery. Each is
  a clock that pushes the night along. (Darkest Dungeon's stress, Sunless Sea's terror.)

**Who you know**

- **Relationships.** People who remember the player within the night: a bartender who now pours
  you the good stuff, a stranger who owes you. Today a person is met once and forgets.
- **Companions.** Someone who joins the player for part of the night and has a say in every scene.
  Today the friend is a target to find, never company.

**How you change**

- **Growth within a night.** Gaining abilities as the night goes on. Little room: a night is a few
  dozen choices, and the night's natural curve is downhill.
- **Growth across nights.** Unlocks that carry into the next night, beyond the stories collected.
  This touches the shelved long arc. (Hades, Rogue Legacy.)

## Pass 1: what "deck-building elements" could mean

The question that decides everything is what a card stands for. Each answer is a different game.

- **A move you own.** "Buy a round", "Lie", "Ask a local", "Leave without paying". The player
  carries verbs from place to place, and a scene answers whatever hand the player has. (Slay the
  Spire, Griftlands.)
- **A move in a contest.** Some conversations become a short card game, such as talking a bouncer
  into letting you in. The rest of the game stays as it is. (Griftlands' negotiation, Signs of the
  Sojourner.)
- **An event from the city.** The night is a deck. Arriving somewhere or the hour turning draws a
  card, and play adds and removes cards: a fight at Rotor shuffles "the police" into the deck.
  (Arkham Horror's encounter decks, Reigns.)
- **A part of you.** The deck is the character. The cards are habits and moods, and the people the
  player spends time with add their cards and push others out. This is the one reading where RPG and
  deck-building are a single system. (Signs of the Sojourner.)
- **A dead card.** Drunkenness, tiredness and a hangover come in as cards that clog the hand. They
  are a cost the player feels in every draw, not a number in the status line. (Slay the Spire's
  curses and wounds.)
- **A draw of luck.** A small deck replaces the dice, and the player can thin it or spoil it.
  (Gloomhaven's modifier deck.)
- **A resource.** Money or time held as cards. (Dominion.)
- **A found story.** A story from the collection becomes a card that later nights can play, so
  the collection gets a use. (Inscryption, Hades' keepsakes.)

Roguelike deckbuilders also bring a run structure: pick one of three cards after each fight, remove
cards at a shop, and walk a branching map. Foam already has a run and a map. The map is real Brno,
walked at a cost in time, not a node graph.

## Pass 1: how deep each reading goes

The cost depends on depth more than on which family a reading belongs to.

| Depth           | What changes                                                            | Readings                                                          |
| --------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A layer         | Foam's choice gains fields; every script stays as written               | Attributes, background, inventory, condition, relationships       |
| A second mode   | Some scenes play differently, beside the story window                   | A move in a contest, a draw of luck, traits, companions           |
| A new core loop | The cards are how the night is played; content is rewritten around them | A move you own, an event from the city, a part of you, dead cards |
| Between nights  | Changes what carries over, not how a night plays                        | Growth across nights, a found story                               |

## Pass 1: where it rubs against `direction.md`

- **"The fun is the stories."** Numbers invite optimising, and a night can become a build. A
  mechanic has to exist to make a story happen, not to win.
- **Drunkenness is "written, not ruled".** Attributes, condition and dead cards all rule. Odds and
  open or closed choices are already ruled today, so the line could be kept there: numbers decide
  what is possible, the text decides what it means.
- **"No pool, no table of decisions."** A deck is a pool. Readings that put the world in a deck
  need this decision reopened; readings that put only the player in a deck do not.
- **"Two players with one seed play one night."** It holds if the seed fixes the world and the
  player's deck or stats are theirs. It breaks if the seed also deals the player's cards and the
  cards change what the world does.
- **One script per button.** A card the player carries must work in places nobody wrote it for.
  Either scripts name the cards they answer, with a generic line or an unplayable card elsewhere,
  or every card multiplies the text to write. Since the author writes every line by hand, this is
  the largest cost of the whole idea.
- **"Sex and drugs are never romanticised."** A stat bonus for being drunk or high rewards it.
  Intoxication can change what is possible, but not make the player stronger without a cost that is
  written.
- **About 32 letters across on a phone.** A fanned hand of cards does not fit. Cards would be a
  list in the story window, three or four at a time.
- **Dice show their odds.** A draw hides them, unless what is left in the deck is shown.
- **"No system is designed ahead of use."** A first system would have to come with a real piece of
  Brno that needs it, as every phase so far has.
- **The checker** runs every version of every scene. Stats, items and decks multiply the states it
  has to cover.

## Pass 1 outcome: the shortlist for pass 2

1. **The deck as the character, with dead cards.** The player is a small deck of habits and moods.
   People met tonight add their cards, and drinks and hours add dead ones. It is the only reading
   that is RPG and deck-building at once, and it says something true about a night out: you come
   home changed by who you met, and worn down. It is the deepest change.
2. **A move in a contest.** A card game for some social scenes only: the bouncer, the friend who
   will not hand over the keys, the ticket inspector. Contained, and testable on one scene, but a
   second way of playing to teach.
3. **Background and attributes.** The smallest step. The dice stay, and their odds come from who
   got off the train. It works under either of the readings above.
4. **Inventory.** The quest flags made general. Most of the above needs it, so it is a likely first
   step whatever is chosen.
5. **Relationships within a night.** People remember what the player did earlier tonight. It is
   cheap with `night.events` and adds stories without adding numbers.

Set aside, each for one reason:

- **An event from the city.** It reopens "no pool" for the world, and versions by the seed already
  give the world its variety.
- **A move you own, outside a contest.** It is the content explosion in its purest form: every card
  in every place.
- **Resources as cards.** The clock and the money already work as plain numbers.
- **Growth within a night.** There is no room for it.
- **The deckbuilder run structure.** It fights the real map.
- **A draw of luck.** A pure mechanic. It can come back inside a contest.
- **Growth across nights and found stories as cards.** They wait on the shelved long arc. Pass 2
  can come back to them once the first system exists.

## Questions for the author before pass 2

- [ ] What should the systems add: replay value, more decisions per scene, a night that feels like
      the player's own, or a reason to play once the stories run out?
- [ ] Should two players with one seed still play the same night, the world only or everything?
- [ ] How many numbers can a text-first game show? Today the status line shows three.
- [ ] Is the shortlist right, and which item leads pass 2?

## Pass 2: game design ideas

Not started.
