# Hero Mancer Bug Fix Sprint - dnd5e 5.2.4

Research completed: 2025-01-06

## Tier 1: Bugs (Blocking)

### #1 - TextEditor TypeError on Document Loading

- **Issue:** Module fails to render with "unable to render dialog" error during document initialization
- **Error:** `TypeError: Cannot read properties of undefined (reading 'TextEditor')` at documentService.js:438
- **Root cause:** The code calls `foundry.applications.ux.TextEditor.implementation.enrichHTML()` but `foundry.applications.ux` may be undefined during early module initialization. The `.implementation` accessor returns the class itself, so the pattern is redundant.
- **Fix:** Replace all `foundry.applications.ux.TextEditor.implementation.enrichHTML()` calls with `TextEditor.enrichHTML()` (global) or `foundry.applications.ux.TextEditor.enrichHTML()` with null checks
- **Files:**
  - `scripts/utils/documentService.js:438`
  - `scripts/utils/descriptionBuilder.js:425,500`
  - `scripts/utils/DOMManager.js:620,654,664,1844,2166,2474,2572,3047,3068`

### #2 - Tokenizer Opens for Players Despite GM Settings

- **Issue:** Players see Tokenizer opening instead of file picker when selecting token art, even when GM has disabled the setting
- **Error:** None (behavioral bug)
- **Root cause:** The `tokenizerCompatibility` setting has `scope: 'client'` (line 503 in settings.js), meaning each user has their own setting value. The default is `true`, so players who never changed the setting see Tokenizer enabled regardless of GM's preference.
- **Fix:** Change setting scope from `'client'` to `'world'` so GM controls the setting for all users
- **Files:**
  - `scripts/settings.js:503` - Change `scope: 'client'` to `scope: 'world'`

### #3 - Magic Item Filtering Broken

- **Issue:** Magic items may not be properly filtered from equipment selection due to incorrect property check
- **Error:** Silent failure - magic items appear when they shouldn't
- **Root cause:** Code at equipmentParser.js:1322 uses `Array.isArray(item.system?.properties)` which fails for dnd5e 5.x where `properties` is a Set, not an Array. The check always returns false.
- **Fix:** Replace `Array.isArray(item.system?.properties) && item.system.properties.includes('mgc')` with `item.system?.properties?.has?.('mgc')` or use Set-safe check
- **Files:**
  - `scripts/utils/equipment/equipmentParser.js:1322`

---

## Tier 2: Compatibility (dnd5e 5.2.x API Changes)

### #4 - Update module.json Compatibility

- **Issue:** Module claims dnd5e 4.4.4 verified but targets 5.x.x maximum
- **Root cause:** module.json not updated after 5.2.x testing
- **Fix:** Update `relationships.systems[0].compatibility.verified` to `"5.2.4"`
- **Files:**
  - `module.json:98`

### #5 - Foundry V13 Compatibility Flag

- **Issue:** Module shows verified for Foundry 12.343 but minimum includes v12
- **Root cause:** module.json not updated for V13 verification
- **Fix:** Update `compatibility.verified` to `"13.350"` (or latest stable)
- **Files:**
  - `module.json:15`

---

## Tier 3: Enhancements

### #6 - GM Character Approval Workflow (#131)

- **Issue:** Players without ACTOR_CREATE permission cannot submit characters
- **Status:** Feature request already in V13 Support milestone
- **Notes:** Already assigned, defer to existing tracking

---

## Tier 4: Deferred (Complex/Low Priority)

### #7 - Journal Rendering Style Issues (#159)

- **Issue:** Journal content rendered in Hero Mancer has incorrect icon positioning compared to native journal viewer
- **Root cause:** CSS styling differences between Hero Mancer's container and native journal sheets
- **Notes:** Cosmetic issue, requires CSS investigation. Closed in v1.4.6 with prose-mirror styling but may need revisiting.

### #8 - Inconsistent fromUuidSync Usage

- **Issue:** Many places use `await fromUuidSync()` but `fromUuidSync` is synchronous
- **Root cause:** Code inconsistency, not a bug
- **Notes:** Works correctly but could be cleaned up for code quality

---

## Dependencies Between Issues

```
#1 (TextEditor) - Standalone, highest priority
    └── Blocks all document loading

#2 (Tokenizer) - Standalone
    └── Player-facing UX issue

#3 (Magic Items) - Standalone
    └── Equipment selection accuracy

#4, #5 (Compatibility) - Should be done together
    └── Can be done after bugs fixed
```

---

## Quick Wins

1. **#2 Tokenizer scope** - One-line change in settings.js
2. **#3 Magic item check** - One-line change in equipmentParser.js
3. **#4, #5 module.json** - Version string updates

## Complex Fixes

1. **#1 TextEditor** - 11+ locations need updating with consistent pattern

---

## Recommended Fix Order

1. #1 - TextEditor (blocking issue, must fix first)
2. #2 - Tokenizer (quick win, player-facing)
3. #3 - Magic items (quick win, data integrity)
4. #4, #5 - Compatibility (housekeeping)

---

## Research Sources

- GitHub Issues: https://github.com/Sayshal/hero-mancer/issues
- dnd5e 5.2.0 Release: https://github.com/foundryvtt/dnd5e/releases/tag/release-5.2.0
- Foundry V13 TextEditor API: https://foundryvtt.com/api/v13/classes/foundry.applications.ux.TextEditor.html
- Discord reports (provided in task context)
