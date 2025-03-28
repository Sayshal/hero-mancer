import { HeroMancer, HM, StatRoller } from './index.js';

/**
 * Combined class for character randomization and name generation
 */
export class CharacterRandomizer {
  // Flag to prevent duplicate operations
  static #isRandomizing = false;

  /**
   * Symbol sets for different name components
   * @private
   */
  static #nameSymbols = {
    s: [
      'ach',
      'ack',
      'ad',
      'age',
      'ald',
      'ale',
      'an',
      'ang',
      'ar',
      'ard',
      'as',
      'ash',
      'at',
      'ath',
      'augh',
      'aw',
      'ban',
      'bel',
      'bur',
      'cer',
      'cha',
      'che',
      'dan',
      'dar',
      'del',
      'den',
      'dra',
      'dyn',
      'ech',
      'eld',
      'elm',
      'em',
      'en',
      'end',
      'eng',
      'enth',
      'er',
      'ess',
      'est',
      'et',
      'gar',
      'gha',
      'hat',
      'hin',
      'hon',
      'ia',
      'ight',
      'ild',
      'im',
      'ina',
      'ine',
      'ing',
      'ir',
      'is',
      'iss',
      'it',
      'kal',
      'kel',
      'kim',
      'kin',
      'ler',
      'lor',
      'lye',
      'mor',
      'mos',
      'nal',
      'ny',
      'nys',
      'old',
      'om',
      'on',
      'or',
      'orm',
      'os',
      'ough',
      'per',
      'pol',
      'qua',
      'que',
      'rad',
      'rak',
      'ran',
      'ray',
      'ril',
      'ris',
      'rod',
      'roth',
      'ryn',
      'sam',
      'say',
      'ser',
      'shy',
      'skel',
      'sul',
      'tai',
      'tan',
      'tas',
      'ther',
      'tia',
      'tin',
      'ton',
      'tor',
      'tur',
      'um',
      'und',
      'unt',
      'urn',
      'usk',
      'ust',
      'ver',
      'ves',
      'vor',
      'war',
      'wor',
      'yer'
    ],
    v: ['a', 'e', 'i', 'o', 'u', 'y'],
    V: ['a', 'e', 'i', 'o', 'u', 'y', 'ae', 'ai', 'au', 'ay', 'ea', 'ee', 'ei', 'eu', 'ey', 'ia', 'ie', 'oe', 'oi', 'oo', 'ou', 'ui'],
    c: ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z'],
    B: [
      'b',
      'bl',
      'br',
      'c',
      'ch',
      'chr',
      'cl',
      'cr',
      'd',
      'dr',
      'f',
      'g',
      'h',
      'j',
      'k',
      'l',
      'll',
      'm',
      'n',
      'p',
      'ph',
      'qu',
      'r',
      'rh',
      's',
      'sch',
      'sh',
      'sl',
      'sm',
      'sn',
      'st',
      'str',
      'sw',
      't',
      'th',
      'thr',
      'tr',
      'v',
      'w',
      'wh',
      'y',
      'z',
      'zh'
    ],
    C: [
      'b',
      'c',
      'ch',
      'ck',
      'd',
      'f',
      'g',
      'gh',
      'h',
      'k',
      'l',
      'ld',
      'll',
      'lt',
      'm',
      'n',
      'nd',
      'nn',
      'nt',
      'p',
      'ph',
      'q',
      'r',
      'rd',
      'rr',
      'rt',
      's',
      'sh',
      'ss',
      'st',
      't',
      'th',
      'v',
      'w',
      'y',
      'z'
    ],
    i: [
      'air',
      'ankle',
      'ball',
      'beef',
      'bone',
      'bum',
      'bumble',
      'bump',
      'cheese',
      'clod',
      'clot',
      'clown',
      'corn',
      'dip',
      'dolt',
      'doof',
      'dork',
      'dumb',
      'face',
      'finger',
      'foot',
      'fumble',
      'goof',
      'grumble',
      'head',
      'knock',
      'knocker',
      'knuckle',
      'loaf',
      'lump',
      'lunk',
      'meat',
      'muck',
      'munch',
      'nit',
      'numb',
      'pin',
      'puff',
      'skull',
      'snark',
      'sneeze',
      'thimble',
      'twerp',
      'twit',
      'wad',
      'wimp',
      'wipe'
    ],
    m: [
      'baby',
      'booble',
      'bunker',
      'cuddle',
      'cuddly',
      'cutie',
      'doodle',
      'foofie',
      'gooble',
      'honey',
      'kissie',
      'lover',
      'lovey',
      'moofie',
      'mooglie',
      'moopie',
      'moopsie',
      'nookum',
      'poochie',
      'poof',
      'poofie',
      'pookie',
      'schmoopie',
      'schnoogle',
      'schnookie',
      'schnookum',
      'smooch',
      'smoochie',
      'smoosh',
      'snoogle',
      'snoogy',
      'snookie',
      'snookum',
      'snuggy',
      'sweetie',
      'woogle',
      'woogy',
      'wookie',
      'wookum',
      'wuddle',
      'wuddly',
      'wuggy',
      'wunny'
    ],
    M: [
      'boo',
      'bunch',
      'bunny',
      'cake',
      'cakes',
      'cute',
      'darling',
      'dumpling',
      'dumplings',
      'face',
      'foof',
      'goo',
      'head',
      'kin',
      'kins',
      'lips',
      'love',
      'mush',
      'pie',
      'poo',
      'pooh',
      'pook',
      'pums'
    ],
    D: ['b', 'bl', 'br', 'cl', 'd', 'f', 'fl', 'fr', 'g', 'gh', 'gl', 'gr', 'h', 'j', 'k', 'kl', 'm', 'n', 'p', 'th', 'w'],
    d: [
      'elch',
      'idiot',
      'ob',
      'og',
      'ok',
      'olph',
      'olt',
      'omph',
      'ong',
      'onk',
      'oo',
      'oob',
      'oof',
      'oog',
      'ook',
      'ooz',
      'org',
      'ork',
      'orm',
      'oron',
      'ub',
      'uck',
      'ug',
      'ulf',
      'ult',
      'um',
      'umb',
      'ump',
      'umph',
      'un',
      'unb',
      'ung',
      'unk',
      'unph',
      'unt',
      'uzz'
    ]
  };

  /**
   * Common patterns for fantasy names
   * @private
   */
  static #namePatterns = ['BsV', 'BVs', 'CVcs', 'CVsC', 'VcCV', 'BsVc', 'BVsc', 'BVcv', 'BsVCs', 'CVCVs', 'BVCVs'];

  /**
   * Randomize all character aspects
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<void>}
   */
  static async randomizeAll(form) {
    if (!form || this.#isRandomizing) return;

    try {
      this.#isRandomizing = true;
      ui.notifications.info('hm.app.randomizing', { localize: true });

      HM.log(3, 'Randomizing character...');

      this.randomizeName(form);
      await this.randomizeBackground(form);
      await this.randomizeClass(form);
      await this.randomizeRace(form);
      this.randomizeAlignment(form);
      this.randomizeFaith(form);
      this.randomizeAppearance(form);
      await this.randomizeAbilities(form);

      HM.log(3, 'Randomizing complete...');

      ui.notifications.info('hm.app.randomization-complete', { localize: true });
    } catch (error) {
      console.error('Error during randomization:', error);
      ui.notifications.error('hm.errors.randomization-failed', { localize: true });
    } finally {
      this.#isRandomizing = false;
    }
  }

  /**
   * Randomize character name
   * @param {HTMLElement} form - The HeroMancer form element
   */
  static randomizeName(form) {
    const nameInput = form.querySelector('#character-name');
    if (!nameInput) {
      HM.log(3, 'Could not find character name input field');
      return;
    }

    nameInput.value = this.generateRandomName();
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    HM.log(3, `Generated random name: ${nameInput.value}`);
  }

  /**
   * Generate a random fantasy name
   * @returns {string} A random fantasy name
   */
  static generateRandomName() {
    const pattern = this.#getRandomItem(this.#namePatterns);
    return this.generateNameFromPattern(pattern);
  }

  /**
   * Generate a name from a specific pattern
   * @param {string} pattern - The pattern to generate a name from
   * @returns {string} The generated name
   */
  static generateNameFromPattern(pattern) {
    let name = '';

    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];

      if (this.#nameSymbols[c]) {
        name += this.#getRandomItem(this.#nameSymbols[c]);
      } else {
        name += c;
      }
    }

    return this.#capitalize(name);
  }

  /**
   * Randomize background selection
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<void>}
   */
  static async randomizeBackground(form) {
    const backgroundDropdown = form.querySelector('#background-dropdown');
    if (!backgroundDropdown) return;

    const options = Array.from(backgroundDropdown.options).filter((opt) => !opt.disabled && opt.value);

    if (!options.length) return;

    const randomOption = this.#getRandomItem(options);
    backgroundDropdown.value = randomOption.value;
    backgroundDropdown.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Randomize race selection
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<void>}
   */
  static async randomizeRace(form) {
    const raceDropdown = form.querySelector('#race-dropdown');
    if (!raceDropdown) return;

    const options = Array.from(raceDropdown.options).filter((opt) => !opt.disabled && opt.value);

    if (!options.length) return;

    const randomOption = this.#getRandomItem(options);
    raceDropdown.value = randomOption.value;
    raceDropdown.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Randomize class selection
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<void>}
   */
  static async randomizeClass(form) {
    const classDropdown = form.querySelector('#class-dropdown');
    if (!classDropdown) return;

    const options = Array.from(classDropdown.options).filter((opt) => !opt.disabled && opt.value);

    if (!options.length) return;

    const randomOption = this.#getRandomItem(options);
    classDropdown.value = randomOption.value;
    classDropdown.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Randomize ability scores based on the selected roll method
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<void>}
   */
  static async randomizeAbilities(form) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ui.notifications.clear(); // Clear any notifications, we're almost done!

    // Get the current roll method
    const rollMethodSelect = form.querySelector('#roll-method');
    if (!rollMethodSelect) return;

    const rollMethod = rollMethodSelect.value;

    switch (rollMethod) {
      case 'standardArray':
        await this.#randomizeStandardArray(form);
        break;

      case 'pointBuy':
        await this.#randomizePointBuy(form);
        break;

      case 'manualFormula':
        await this.#randomizeManualFormula(form);
        break;
    }
  }

  /**
   * Randomize alignment selection
   * @param {HTMLElement} form - The HeroMancer form element
   */
  static randomizeAlignment(form) {
    const alignmentSelect = form.querySelector('select[name="alignment"]');
    if (!alignmentSelect) return;

    const options = Array.from(alignmentSelect.options).filter((opt) => !opt.disabled && opt.value);

    if (!options.length) return;

    const randomOption = this.#getRandomItem(options);
    alignmentSelect.value = randomOption.value;
    alignmentSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Randomize faith/deity selection
   * @param {HTMLElement} form - The HeroMancer form element
   */
  static randomizeFaith(form) {
    const faithSelect = form.querySelector('select[name="faith"]');
    if (!faithSelect) return;

    const options = Array.from(faithSelect.options).filter((opt) => !opt.disabled && opt.value);

    if (!options.length) return;

    const randomOption = this.#getRandomItem(options);
    faithSelect.value = randomOption.value;
    faithSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Randomize appearance fields (eyes, hair, skin, height, weight, age, gender)
   * @param {HTMLElement} form - The HeroMancer form element
   */
  static randomizeAppearance(form) {
    // Get appearance traits from settings
    const traits = {
      eyes: game.settings
        .get(HM.ID, 'eyeColors')
        .split(',')
        .map((e) => e.trim()),
      hair: game.settings
        .get(HM.ID, 'hairColors')
        .split(',')
        .map((h) => h.trim()),
      skin: game.settings
        .get(HM.ID, 'skinTones')
        .split(',')
        .map((s) => s.trim()),
      gender: game.settings
        .get(HM.ID, 'genders')
        .split(',')
        .map((g) => g.trim())
    };

    // Set random appearance traits from settings
    for (const [trait, values] of Object.entries(traits)) {
      const input = form.querySelector(`input[name="${trait}"]`);
      if (input && values.length > 0) {
        input.value = this.#getRandomItem(values);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Set height based on metric setting
    const heightInput = form.querySelector('input[name="height"]');
    if (heightInput) {
      const useMetric = game.settings.get('dnd5e', 'metricLengthUnits') || false;

      if (useMetric) {
        // Random height in cm (90-200)
        const heightCm = Math.floor(Math.random() * 111) + 90;
        heightInput.value = `${heightCm}cm`;
      } else {
        // Random height in feet (3.0-6.5)
        const heightInches = Math.floor(Math.random() * 43) + 36; // 36-78 inches
        const heightFeet = (heightInches / 12).toFixed(1);
        heightInput.value = `${heightFeet}'`;
      }

      heightInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Set weight based on metric setting
    const weightInput = form.querySelector('input[name="weight"]');
    if (weightInput) {
      const useMetric = game.settings.get('dnd5e', 'metricWeightUnits') || false;

      if (useMetric) {
        // Random weight in kg (18-135)
        const weightKg = Math.floor(Math.random() * 118) + 18;
        weightInput.value = `${weightKg}kg`;
      } else {
        // Random weight in lb (40-300)
        const weightLb = Math.floor(Math.random() * 261) + 40;
        weightInput.value = `${weightLb}lb`;
      }

      weightInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Set random age (18-99)
    const ageInput = form.querySelector('input[name="age"]');
    if (ageInput) {
      ageInput.value = Math.floor(Math.random() * 82) + 18;
      ageInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * Randomize Standard Array ability assignments
   * @private
   * @param {HTMLElement} form - The form element
   * @returns {Promise<void>}
   */
  static async #randomizeStandardArray(form) {
    // Get all ability blocks and their labels
    const abilityBlocks = Array.from(form.querySelectorAll('.ability-block'));

    // Create an array of ability information
    const abilities = abilityBlocks.map((block, index) => {
      const dropdown = block.querySelector('.ability-dropdown');
      const label = block.querySelector('.ability-label');

      return {
        index,
        key: dropdown?.name?.match(/\[([a-z]+)]/)?.[1] || '',
        dropdown,
        isPrimary: label?.classList.contains('primary-ability'),
        label: label?.textContent.trim()
      };
    });

    // Get available values from the first dropdown
    const availableValues = [];
    const firstDropdown = abilities[0]?.dropdown;
    if (firstDropdown) {
      for (const option of firstDropdown.options) {
        if (option.value && !option.disabled) {
          availableValues.push(option.value);
        }
      }
    }

    if (!availableValues.length) return;

    // Sort values numerically (highest first)
    availableValues.sort((a, b) => parseInt(b) - parseInt(a));
    const valuesCopy = [...availableValues];

    // First assign values to primary abilities (might be multiple)
    const primaryAbilities = abilities.filter((a) => a.isPrimary);

    // Sort primary abilities by labels to ensure consistent assignment
    primaryAbilities.sort((a, b) => a.label.localeCompare(b.label));

    // Assign highest values to primary abilities
    for (const ability of primaryAbilities) {
      if (valuesCopy.length && ability.dropdown) {
        const value = valuesCopy.shift();
        ability.dropdown.value = value;
        ability.dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    // Randomize the remaining abilities
    const remainingAbilities = abilities.filter((a) => !a.isPrimary);
    this.#shuffleArray(remainingAbilities);

    // Assign remaining values
    for (const ability of remainingAbilities) {
      if (valuesCopy.length && ability.dropdown) {
        const value = valuesCopy.shift();
        ability.dropdown.value = value;
        ability.dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * Randomize Point Buy ability assignments
   * @private
   * @param {HTMLElement} form - The form element
   * @returns {Promise<void>}
   */
  static async #randomizePointBuy(form) {
    try {
      HM.log(3, 'Starting point buy randomization');

      // 1. Identify all ability blocks and which ones are primary
      const abilityBlocks = form.querySelectorAll('.ability-block.point-buy');
      if (!abilityBlocks.length) {
        HM.log(1, 'No ability blocks found for point buy');
        return;
      }

      HM.log(3, `Found ${abilityBlocks.length} ability blocks`);

      const abilities = Array.from(abilityBlocks).map((block, index) => {
        const label = block.querySelector('.ability-label');
        const plusButton = block.querySelector('.plus-button');
        const currentScore = block.querySelector('.current-score');
        const isPrimary = label?.classList.contains('primary-ability');

        HM.log(3, `Ability ${index}: ${label?.textContent.trim()} - isPrimary: ${isPrimary}`);

        return {
          index,
          block,
          isPrimary,
          plusButton,
          minusButton: block.querySelector('.minus-button'),
          currentScore
        };
      });

      // 2. Prioritize primary abilities first
      const primaryAbilities = abilities.filter((a) => a.isPrimary);
      const nonPrimaryAbilities = abilities.filter((a) => !a.isPrimary);

      HM.log(3, `Primary abilities: ${primaryAbilities.length}, Non-primary: ${nonPrimaryAbilities.length}`);

      // 3. Get total points using StatRoller methods
      const totalPoints = StatRoller.getTotalPoints();
      HM.log(3, `Total points available: ${totalPoints}`);

      // 4. First focus exclusively on maxing out all primary abilities
      HM.log(3, 'Starting to max out primary abilities');
      for (const primary of primaryAbilities) {
        HM.log(3, `Working on primary ability index ${primary.index}`);

        // Keep clicking the + button until it becomes disabled
        let maxAttempts = 20; // More than enough to reach max score
        let clickCount = 0;

        while (!primary.plusButton.disabled && maxAttempts > 0) {
          clickCount++;
          HM.log(3, `Clicking + for primary ability ${primary.index}, attempt ${20 - maxAttempts + 1}, current value: ${primary.currentScore.textContent}`);
          maxAttempts--;
          primary.plusButton.click();
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        HM.log(3, `Finished primary ability ${primary.index} after ${clickCount} clicks. Final value: ${primary.currentScore.textContent}`);
      }

      // 5. Calculate remaining points after primaries are maxed
      let pointsSpent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
      let remainingPoints = totalPoints - pointsSpent;

      HM.log(3, `After maxing primaries - Points spent: ${pointsSpent}, Remaining: ${remainingPoints}`);

      // 6. Distribute remaining points to non-primary abilities
      if (remainingPoints > 0) {
        HM.log(3, `Starting to distribute ${remainingPoints} remaining points to non-primary abilities`);

        // Shuffle for random distribution
        this.#shuffleArray(nonPrimaryAbilities);
        HM.log(3, 'Shuffled non-primary abilities order');

        let distributionCounter = 0;
        let totalClicks = 0;

        while (remainingPoints > 0 && distributionCounter < 100) {
          // Safety counter
          distributionCounter++;

          for (const ability of nonPrimaryAbilities) {
            if (remainingPoints <= 0) break;

            if (!ability.plusButton.disabled) {
              HM.log(3, `Clicking + for non-primary ability ${ability.index}, current value: ${ability.currentScore.textContent}`);
              ability.plusButton.click();
              totalClicks++;
              await new Promise((resolve) => setTimeout(resolve, 50));

              // Recalculate points
              pointsSpent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
              remainingPoints = totalPoints - pointsSpent;

              HM.log(3, `After click - Points spent: ${pointsSpent}, Remaining: ${remainingPoints}`);

              if (remainingPoints <= 0) break;
            } else {
              HM.log(3, `Non-primary ability ${ability.index} button is disabled, skipping`);
            }
          }

          // Check if we can still assign points to any ability
          const canStillAssign = nonPrimaryAbilities.some((a) => !a.plusButton.disabled);
          if (!canStillAssign) {
            HM.log(3, 'No more abilities can be increased, breaking loop');
            break;
          }
        }

        HM.log(3, `Completed non-primary distribution. Total clicks: ${totalClicks}`);
      } else {
        HM.log(3, 'No points remaining for non-primary abilities');
      }

      HM.log(3, 'Point buy randomization complete');
    } catch (error) {
      HM.log(1, `Error during point buy randomization: ${error.message}`);
      console.error(error);
    }
  }

  /**
   * Randomize Manual Formula ability assignments
   * @private
   * @param {HTMLElement} form - The form element
   * @returns {Promise<void>}
   */
  static async #randomizeManualFormula(form) {
    // Save original dice configuration
    const originalDiceConfiguration = game.settings.get('core', 'diceConfiguration');

    // Create temporary configuration with automatic dice
    const tempDiceConfiguration = {
      d4: '',
      d6: '',
      d8: '',
      d10: '',
      d12: '',
      d20: '',
      d100: ''
    };

    // Apply temporary configuration
    await game.settings.set('core', 'diceConfiguration', tempDiceConfiguration);

    try {
      // Get all ability blocks
      const abilityBlocks = form.querySelectorAll('.ability-block');
      if (!abilityBlocks.length) {
        HM.log(2, 'No ability blocks found');
        return;
      }

      // 1. First assign ability types (STR, DEX, etc.) to the dropdowns
      const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
      const abilities = Object.keys(CONFIG.DND5E.abilities);

      // Randomly assign each ability once
      const shuffledAbilities = [...abilities];
      this.#shuffleArray(shuffledAbilities);

      // Assign abilities to dropdowns
      for (let i = 0; i < abilityBlocks.length; i++) {
        const dropdown = abilityBlocks[i].querySelector('.ability-dropdown');
        if (dropdown && i < shuffledAbilities.length) {
          dropdown.value = shuffledAbilities[i];
          dropdown.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      // 2. Roll stats for all abilities
      const rollResults = [];
      const rollFormula = await StatRoller.getAbilityScoreRollFormula();

      for (let i = 0; i < abilityBlocks.length; i++) {
        const roll = new Roll(rollFormula);
        await roll.evaluate();

        const input = abilityBlocks[i].querySelector('.ability-score');
        const ability = abilityBlocks[i].querySelector('.ability-dropdown').value;
        const isPrimary = abilityBlocks[i].querySelector('.primary-ability') !== null;

        rollResults.push({
          index: i,
          value: roll.total,
          ability,
          isPrimary,
          input
        });
      }

      // 3. Sort roll results (highest to lowest)
      rollResults.sort((a, b) => b.value - a.value);

      // 4. Identify primary abilities
      const primaryAbilities = rollResults.filter((r) => r.isPrimary);
      const nonPrimaryAbilities = rollResults.filter((r) => !r.isPrimary);

      // 5. Re-sort: Primary abilities get highest rolls, non-primary get remaining rolls
      const finalAssignments = new Array(abilityBlocks.length);
      let resultIndex = 0;

      // Assign highest values to primary abilities first
      primaryAbilities.forEach((primary) => {
        finalAssignments[primary.index] = rollResults[resultIndex++].value;
      });

      // Assign remaining values to non-primary abilities
      nonPrimaryAbilities.forEach((nonPrimary) => {
        finalAssignments[nonPrimary.index] = rollResults[resultIndex++].value;
      });

      // 6. Update input fields with the new assignments
      for (let i = 0; i < abilityBlocks.length; i++) {
        const input = abilityBlocks[i].querySelector('.ability-score');
        if (input) {
          input.value = finalAssignments[i];
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      HM.log(3, 'Manual formula randomization complete');
    } catch (error) {
      HM.log(1, 'Error during manual formula randomization:', error);
    } finally {
      // Restore original dice configuration
      await game.settings.set('core', 'diceConfiguration', originalDiceConfiguration);
    }
  }

  /**
   * Get a random item from an array or collection
   * @private
   * @param {Array|NodeList|HTMLCollection} items - Collection to choose from
   * @returns {*} Random item from the collection
   */
  static #getRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  /**
   * Shuffle array in place using Fisher-Yates algorithm
   * @private
   * @param {Array} array - Array to shuffle
   * @returns {Array} The same array, shuffled
   */
  static #shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Capitalize the first letter of a string
   * @private
   * @param {string} string - The string to capitalize
   * @returns {string} The capitalized string
   */
  static #capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
}
