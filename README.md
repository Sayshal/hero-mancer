# Hero Mancer

Because rolling up a character shouldn't eat the whole first session.

![The Hero Mancer creation wizard](https://wiki.3deathsaves.com/hero-mancer/hero-mancer-wizard.png)

![GitHub release](https://img.shields.io/github/v/release/Sayshal/hero-mancer?style=for-the-badge)
![GitHub Downloads (specific asset, all releases)](<https://img.shields.io/github/downloads/Sayshal/hero-mancer/module.zip?style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Total)&color=ff144f>)

![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fhero-mancer%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![D&D5E Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fsystem%3FnameType%3Dfoundry%26showVersion%3D1%26style%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fhero-mancer%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
[![Discord](https://dcbadge.limes.pink/api/server/PzzUwU9gdz)](https://discord.gg/PzzUwU9gdz)

**[Read the Wiki](https://wiki.3deathsaves.com/hero-mancer/)** for the full walkthrough, settings reference, and API docs.

---

## What You Get

**Guided creation wizard.** One window walks Start, Identity (Species / Class / Background), Ability Scores, Hit Points, Equipment, Advancements, Biography, and Finalize, top to bottom. A live preview tracks hit points, proficiencies, movement, and saves as you go, and every tab carries a badge for the choices still left. Progress auto-saves as a draft, so closing mid-build picks up right where you left off.

![Start tab](https://wiki.3deathsaves.com/hero-mancer/start-tab.png)

**Ability scores your way.** Standard Array, Point Buy, or Manual rolls. The GM decides which methods are on the table and sets the limits for each. Every ability shows what it governs and which skills it covers, and your class's primary stats are flagged so you know where to put the good numbers.

![Ability Scores tab](https://wiki.3deathsaves.com/hero-mancer/ability-scores.png)

**Equipment or cold hard gold.** Take the gear your class and background grant as accordion tiles and resolve any either-or choices, or take starting wealth instead and spend it in a real shop. Search, sort, and cart items against a wealth pool, with refunds for gear you skip and optional bonus starting gold.

![Equipment shop](https://wiki.3deathsaves.com/hero-mancer/equipment-shop.png)

**Advancements and feats.** Class, species, and background advancements resolve in one place as chips that mark what's granted versus what you choose. At the right levels, take an Ability Score Improvement or pick a feat from a searchable browser that only shows feats you actually qualify for.

![Feat browser](https://wiki.3deathsaves.com/hero-mancer/feat-browser.png)

**Level up and multiclass.** Once a character exists, a glowing Level Up button appears on the sheet near the rest buttons. Level an existing class or multiclass into a new one, with a preview of new hit points, features, and spell-slot changes before you commit.

![Level Up window](https://wiki.3deathsaves.com/hero-mancer/level-up.png)

**GM approval queue.** Optionally require review before player characters are created. Submissions land in a queue with character, submitter, and timestamp, where the GM can review, approve as-is, reject with a reason, or edit before approving. Players see a clear status banner while they wait and can restore-and-resubmit if sent back.

![Pending approvals queue](https://wiki.3deathsaves.com/hero-mancer/pending-approvals.png)

**A settings dashboard, not a wall of toggles.** Everything the GM controls lives in one tabbed panel: allowed roll methods and limits, starting level and gold, required fields, content exclusions, player customization, chat publishing, and diagnostics.

![Settings dashboard](https://wiki.3deathsaves.com/hero-mancer/settings-panel.png)

---

## Also Included

- **Compare & pin.** Pin any species, class, or background to compare options side by side in a separate window.
- **Random names.** Shuffle a character name by style and culture, plus an optional randomizer for other creation aspects.
- **Content control.** Hide specific species, backgrounds, classes, subclasses, or items from the wizard and shop; trim sourcebook suffixes; lock picks to a single ruleset.
- **Enforcement.** Require every Biography field, character art, or token art before a character can be submitted.
- **Chat summaries.** Optional creation and level-up summary cards, plus starting-wealth roll posts, scoped public / whisper / off.
- **Troubleshooter.** One-click diagnostic report to paste into a GitHub issue or Discord.
- **Integrations.** Spell Book handoff for casters, Tokenizer 2 portrait editor, Dice So Nice for ability rolls, and Calendaria birthday + age. Each activates only when its module is active.

Hero Mancer makes zero external network requests: no telemetry, no analytics, no usage tracking.

---

## For the Tinkerers

Public API at `HEROMANCER.api` (also at `game.modules.get('hero-mancer').api`):

```javascript
// Open the creation wizard, optionally seeded with a name
HEROMANCER.api.openWizard({ initialName: 'Tyrla' });

// GM: open the wizard on a specific player's client
await HEROMANCER.api.openWizardForPlayer(userId);

// Start a level-up for an existing actor
HEROMANCER.api.openLevelUp(actor);

// GM approval queue
HEROMANCER.api.openPendingApprovals();
const pending = HEROMANCER.api.getPendingSubmissions();
```

See [Hooks](https://wiki.3deathsaves.com/hero-mancer/hooks/) and the [API Reference](https://wiki.3deathsaves.com/hero-mancer/api-reference/) for the full surface.

---

## Installation

Find **Hero Mancer** in Foundry's Module Browser, or paste this manifest URL:

```
https://github.com/Sayshal/hero-mancer/releases/latest/download/module.json
```

Questions? Ideas? Join us on [Discord](https://discord.gg/PzzUwU9gdz) or check the [Wiki](https://wiki.3deathsaves.com/hero-mancer/).
