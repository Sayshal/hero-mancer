import { FormValidation, HeroMancer, HeroMancerUI, HM, StatRoller } from './index.js';

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
    const randomizeButton = form.querySelector('button[data-action="randomize"]');
    try {
      this.#isRandomizing = true;
      this.#disableRandomizeButton(randomizeButton);
      ui.notifications.info('hm.app.randomize.randomizing', { localize: true });
      HM.log(3, 'Randomizing character...');
      await this.#randomizeBasicDetails(form);
      await this.#randomizeCharacteristics(form);
      await this.#randomizeAppearance(form);
      await this.#randomizeAbilities(form);
      HM.log(3, 'Randomizing complete...');
      ui.notifications.info('hm.app.randomization-complete', { localize: true });
    } catch (error) {
      console.error('Error during randomization:', error);
      ui.notifications.error('hm.errors.randomization-failed', { localize: true });
    } finally {
      HeroMancerUI.updateReviewTab();
      FormValidation.checkMandatoryFields(form);
      this.#isRandomizing = false;
      this.#enableRandomizeButton(randomizeButton);
    }
  }

  /**
   * Generate a random fantasy name
   * @returns {string} A random fantasy name
   */
  static generateRandomName() {
    try {
      const pattern = this.#getRandomItem(this.#namePatterns);
      return this.#generateNameFromPattern(pattern);
    } catch (error) {
      HM.log(1, 'Error generating name from pattern:', error);
      return game.i18n.localize('hm.app.randomize.default-name');
    }
  }

  /**
   * Randomize ability scores based on the selected roll method
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<boolean>} Success status
   * @private
   */
  static async #randomizeAbilities(form) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      ui.notifications.clear();
      const rollMethodSelect = form.querySelector('#roll-method');
      if (!rollMethodSelect) {
        HM.log(2, 'Roll method select not found');
        return false;
      }
      const rollMethod = rollMethodSelect.value;
      let success = false;
      switch (rollMethod) {
        case 'standardArray':
          success = await this.#randomizeStandardArray(form);
          break;
        case 'pointBuy':
          success = await this.#randomizePointBuy(form);
          break;
        case 'manualFormula':
          success = await this.#randomizeManualFormula(form);
          break;
        default:
          HM.log(2, `Unknown roll method: ${rollMethod}`);
          return false;
      }
      return success;
    } catch (error) {
      HM.log(1, 'Error randomizing abilities:', error);
      return false;
    }
  }

  /**
   * Randomize basic character details
   * @param {HTMLElement} form - The HeroMancer form
   * @returns {Promise<void>}
   * @private
   */
  static async #randomizeBasicDetails(form) {
    try {
      this.#randomizeName(form);
      await this.#randomizeRace(form);
      await this.#randomizeClass(form);
    } catch (error) {
      HM.log(1, 'Error randomizing basic details:', error);
      throw new Error('Failed to randomize basic character details');
    }
  }

  /**
   * Randomize character characteristics
   * @param {HTMLElement} form - The HeroMancer form
   * @returns {Promise<void>}
   * @private
   */
  static async #randomizeCharacteristics(form) {
    try {
      await this.#randomizeBackground(form);
      this.#randomizeAlignment(form);
      this.#randomizeFaith(form);
    } catch (error) {
      HM.log(1, 'Error randomizing characteristics:', error);
      throw new Error('Failed to randomize character characteristics');
    }
  }

  /**
   * Disable the randomize button
   * @param {HTMLElement} button - The randomize button
   * @private
   */
  static #disableRandomizeButton(button) {
    if (button) button.disabled = true;
  }

  /**
   * Enable the randomize button
   * @param {HTMLElement} button - The randomize button
   * @private
   */
  static #enableRandomizeButton(button) {
    if (button) button.disabled = false;
  }

  /**
   * Randomize character name
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {boolean} Success status
   * @private
   */
  static #randomizeName(form) {
    try {
      const nameInput = form.querySelector('#character-name');
      if (!nameInput) {
        HM.log(2, 'Could not find character name input field');
        return false;
      }
      nameInput.value = this.generateRandomName();
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      HM.log(3, `Generated random name: ${nameInput.value}`);
      return true;
    } catch (error) {
      HM.log(1, 'Error generating random name:', error);
      return false;
    }
  }

  /**
   * Generate a name from a specific pattern
   * @param {string} pattern - The pattern to generate a name from
   * @returns {string} The generated name
   * @private
   */
  static #generateNameFromPattern(pattern) {
    if (!pattern) {
      HM.log(2, 'Invalid name pattern provided');
      return 'Adventurer';
    }
    try {
      let name = '';
      for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (this.#nameSymbols[c]) name += this.#getRandomItem(this.#nameSymbols[c]);
        else name += c;
      }
      return this.#capitalize(name);
    } catch (error) {
      HM.log(1, 'Error generating name from pattern:', error);
      return 'Adventurer';
    }
  }

  /**
   * Randomize background selection
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<boolean>} Success status
   * @private
   */
  static async #randomizeBackground(form) {
    try {
      const backgroundDropdown = form.querySelector('#background-dropdown');
      if (!backgroundDropdown) {
        HM.log(2, 'Background dropdown not found');
        return false;
      }
      const options = Array.from(backgroundDropdown.options).filter((opt) => !opt.disabled && opt.value);
      if (!options.length) {
        HM.log(2, 'No valid background options found');
        return false;
      }
      const randomOption = this.#getRandomItem(options);
      backgroundDropdown.value = randomOption.value;
      backgroundDropdown.dispatchEvent(new Event('change', { bubbles: true }));
      HM.log(3, `Selected random background: ${randomOption.text}`);
      return true;
    } catch (error) {
      HM.log(1, 'Error randomizing background:', error);
      return false;
    }
  }

  /**
   * Randomize race selection
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<boolean>} Success status
   * @private
   */
  static async #randomizeRace(form) {
    try {
      const raceDropdown = form.querySelector('#race-dropdown');
      if (!raceDropdown) {
        HM.log(2, 'Race dropdown not found');
        return false;
      }
      const options = Array.from(raceDropdown.options).filter((opt) => !opt.disabled && opt.value);
      if (!options.length) {
        HM.log(2, 'No valid race options found');
        return false;
      }
      const randomOption = this.#getRandomItem(options);
      raceDropdown.value = randomOption.value;
      raceDropdown.dispatchEvent(new Event('change', { bubbles: true }));
      HM.log(3, `Selected random race: ${randomOption.text}`);
      return true;
    } catch (error) {
      HM.log(1, 'Error randomizing race:', error);
      return false;
    }
  }

  /**
   * Randomize class selection
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {Promise<boolean>} Success status
   * @private
   */
  static async #randomizeClass(form) {
    try {
      const classDropdown = form.querySelector('#class-dropdown');
      if (!classDropdown) {
        HM.log(2, 'Class dropdown not found');
        return false;
      }
      const options = Array.from(classDropdown.options).filter((opt) => !opt.disabled && opt.value);
      if (!options.length) {
        HM.log(2, 'No valid class options found');
        return false;
      }
      const randomOption = this.#getRandomItem(options);
      classDropdown.value = randomOption.value;
      classDropdown.dispatchEvent(new Event('change', { bubbles: true }));
      HM.log(3, `Selected random class: ${randomOption.text}`);
      return true;
    } catch (error) {
      HM.log(1, 'Error randomizing class:', error);
      return false;
    }
  }

  /**
   * Randomize alignment selection
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {boolean} Success status
   * @private
   */
  static #randomizeAlignment(form) {
    try {
      const alignmentElement = form.querySelector('select[name="alignment"], input[name="alignment"]');
      if (!alignmentElement) {
        HM.log(2, 'Alignment element not found');
        return false;
      }
      if (alignmentElement.tagName.toLowerCase() === 'select') {
        const options = Array.from(alignmentElement.options).filter((opt) => !opt.disabled && opt.value);
        if (!options.length) {
          HM.log(2, 'No valid alignment options found');
          return false;
        }
        const randomOption = this.#getRandomItem(options);
        alignmentElement.value = randomOption.value;
        alignmentElement.dispatchEvent(new Event('change', { bubbles: true }));
        HM.log(3, `Selected random alignment: ${randomOption.text}`);
        return true;
      } else {
        const alignments = game.settings
          .get(HM.ID, 'alignments')
          .split(',')
          .map((a) => a.trim())
          .filter((a) => a);
        if (!alignments.length) {
          HM.log(2, 'No valid alignment options found in settings');
          return false;
        }
        const randomAlignment = this.#getRandomItem(alignments);
        alignmentElement.value = randomAlignment;
        alignmentElement.dispatchEvent(new Event('input', { bubbles: true }));
        HM.log(3, `Selected random alignment: ${randomAlignment}`);
        return true;
      }
    } catch (error) {
      HM.log(1, 'Error randomizing alignment:', error);
      return false;
    }
  }

  /**
   * Randomize faith/deity selection
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {boolean} Success status
   * @private
   */
  static #randomizeFaith(form) {
    try {
      const faithElement = form.querySelector('select[name="faith"], input[name="faith"]');
      if (!faithElement) {
        HM.log(2, 'Faith element not found');
        return false;
      }

      if (faithElement.tagName.toLowerCase() === 'select') {
        const options = Array.from(faithElement.options).filter((opt) => !opt.disabled && opt.value);
        if (!options.length) {
          HM.log(2, 'No valid faith options found');
          return false;
        }
        const randomOption = this.#getRandomItem(options);
        faithElement.value = randomOption.value;
        faithElement.dispatchEvent(new Event('change', { bubbles: true }));
        HM.log(3, `Selected random faith: ${randomOption.text}`);
        return true;
      } else {
        const deities = game.settings
          .get(HM.ID, 'deities')
          .split(',')
          .map((d) => d.trim())
          .filter((d) => d);
        if (!deities.length) {
          HM.log(2, 'No valid faith options found in settings');
          return false;
        }
        const randomFaith = this.#getRandomItem(deities);
        faithElement.value = randomFaith;
        faithElement.dispatchEvent(new Event('input', { bubbles: true }));
        HM.log(3, `Selected random faith: ${randomFaith}`);
        return true;
      }
    } catch (error) {
      HM.log(1, 'Error randomizing faith:', error);
      return false;
    }
  }

  /**
   * Randomize appearance fields (eyes, hair, skin, height, weight, age, gender)
   * @param {HTMLElement} form - The HeroMancer form element
   * @returns {boolean} Success status
   * @private
   */
  static #randomizeAppearance(form) {
    try {
      this.#randomizeAppearanceTraits(form);
      this.#randomizePhysicalAttributes(form);
      return true;
    } catch (error) {
      HM.log(1, 'Error randomizing appearance:', error);
      return false;
    }
  }

  /**
   * Randomize appearance traits (eyes, hair, skin, gender)
   * @param {HTMLElement} form - The HeroMancer form element
   * @private
   */
  static #randomizeAppearanceTraits(form) {
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
    for (const [trait, values] of Object.entries(traits)) {
      if (!values.length) continue;
      const input = form.querySelector(`input[name="${trait}"]`);
      if (!input) continue;
      input.value = this.#getRandomItem(values);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      HM.log(3, `Set random ${trait}: ${input.value}`);
    }
  }

  /**
   * Randomize physical attributes (height, weight, age)
   * @param {HTMLElement} form - The HeroMancer form element
   * @private
   */
  static #randomizePhysicalAttributes(form) {
    const heightInput = form.querySelector('input[name="height"]');
    if (heightInput) {
      const useMetric = game.settings.get('dnd5e', 'metricLengthUnits') || false;
      heightInput.value = this.#generateRandomHeight(useMetric);
      heightInput.dispatchEvent(new Event('change', { bubbles: true }));
      HM.log(3, `Set random height: ${heightInput.value}`);
    }
    const weightInput = form.querySelector('input[name="weight"]');
    if (weightInput) {
      const useMetric = game.settings.get('dnd5e', 'metricWeightUnits') || false;
      weightInput.value = this.#generateRandomWeight(useMetric);
      weightInput.dispatchEvent(new Event('change', { bubbles: true }));
      HM.log(3, `Set random weight: ${weightInput.value}`);
    }
    const ageInput = form.querySelector('input[name="age"]');
    if (ageInput) {
      ageInput.value = Math.floor(Math.random() * 82) + 18;
      ageInput.dispatchEvent(new Event('change', { bubbles: true }));
      HM.log(3, `Set random age: ${ageInput.value}`);
    }
  }

  /**
   * Generate random height string
   * @param {boolean} useMetric - Whether to use metric units
   * @returns {string} Formatted height string
   * @private
   */
  static #generateRandomHeight(useMetric) {
    if (useMetric) {
      const heightCm = Math.floor(Math.random() * 111) + 90;
      return `${heightCm}cm`;
    } else {
      const heightInches = Math.floor(Math.random() * 43) + 36;
      const heightFeet = (heightInches / 12).toFixed(1);
      return `${heightFeet}'`;
    }
  }

  /**
   * Generate random weight string
   * @param {boolean} useMetric - Whether to use metric units
   * @returns {string} Formatted weight string
   * @private
   */
  static #generateRandomWeight(useMetric) {
    if (useMetric) {
      const weightKg = Math.floor(Math.random() * 118) + 18;
      return `${weightKg}kg`;
    } else {
      const weightLb = Math.floor(Math.random() * 261) + 40;
      return `${weightLb}lb`;
    }
  }

  /**
   * Randomize Standard Array ability assignments
   * @private
   * @param {HTMLElement} form - The form element
   * @returns {Promise<boolean>} Success status
   */
  static async #randomizeStandardArray(form) {
    try {
      const abilityData = this.#collectAbilityData(form);
      if (!abilityData.availableValues.length) {
        HM.log(2, 'No standard array values available');
        return false;
      }
      await this.#assignPrimaryAbilities(abilityData);
      await this.#assignRemainingAbilities(abilityData);
      return true;
    } catch (error) {
      HM.log(1, 'Error randomizing standard array:', error);
      return false;
    }
  }

  /**
   * Collect ability data from form
   * @param {HTMLElement} form - The form element
   * @returns {object} Ability data information
   * @private
   */
  static #collectAbilityData(form) {
    const abilityBlocks = Array.from(form.querySelectorAll('.ability-block'));
    const abilities = abilityBlocks.map((block, index) => {
      const dropdown = block.querySelector('.ability-dropdown');
      const label = block.querySelector('.ability-label');
      return { index, key: dropdown?.name?.match(/\[([a-z]+)]/)?.[1] || '', dropdown, isPrimary: label?.classList.contains('primary-ability'), label: label?.textContent.trim() };
    });
    const availableValues = [];
    const firstDropdown = abilities[0]?.dropdown;
    if (firstDropdown) for (const option of firstDropdown.options) if (option.value && !option.disabled) availableValues.push(option.value);
    availableValues.sort((a, b) => parseInt(b) - parseInt(a));
    return {
      abilities,
      primaryAbilities: abilities.filter((a) => a.isPrimary).sort((a, b) => a.label.localeCompare(b.label)),
      remainingAbilities: abilities.filter((a) => !a.isPrimary),
      availableValues,
      valuesCopy: [...availableValues]
    };
  }

  /**
   * Assign values to primary abilities
   * @param {object} abilityData - Collected ability data
   * @returns {Promise<void>}
   * @private
   */
  static async #assignPrimaryAbilities(abilityData) {
    for (const ability of abilityData.primaryAbilities) {
      if (abilityData.valuesCopy.length && ability.dropdown) {
        const value = abilityData.valuesCopy.shift();
        ability.dropdown.value = value;
        ability.dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));
        HM.log(3, `Assigned ${value} to primary ability ${ability.label}`);
      }
    }
  }

  /**
   * Assign values to remaining abilities
   * @param {object} abilityData - Collected ability data
   * @returns {Promise<void>}
   * @private
   */
  static async #assignRemainingAbilities(abilityData) {
    this.#shuffleArray(abilityData.remainingAbilities);
    for (const ability of abilityData.remainingAbilities) {
      if (abilityData.valuesCopy.length && ability.dropdown) {
        const value = abilityData.valuesCopy.shift();
        ability.dropdown.value = value;
        ability.dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));
        HM.log(3, `Assigned ${value} to ability ${ability.label}`);
      }
    }
  }

  /**
   * Randomize Point Buy ability assignments
   * @private
   * @param {HTMLElement} form - The form element
   * @returns {Promise<boolean>} Success status
   */
  static async #randomizePointBuy(form) {
    try {
      HM.log(3, 'Starting point buy randomization');
      const abilityData = this.#collectPointBuyData(form);
      if (!abilityData.abilities.length) return false;
      await this.#maximizePrimaryAbilities(abilityData);
      await this.#distributeRemainingPoints(abilityData);
      HM.log(3, 'Point buy randomization complete');
      return true;
    } catch (error) {
      HM.log(1, `Error during point buy randomization: ${error.message}`);
      console.error(error);
      return false;
    }
  }

  /**
   * Collect point buy ability data
   * @param {HTMLElement} form - The form element
   * @returns {object} Ability data for point buy
   * @private
   */
  static #collectPointBuyData(form) {
    const abilityBlocks = form.querySelectorAll('.ability-block.point-buy');
    if (!abilityBlocks.length) {
      HM.log(1, 'No ability blocks found for point buy');
      return { abilities: [] };
    }
    HM.log(3, `Found ${abilityBlocks.length} ability blocks`);
    const abilities = Array.from(abilityBlocks).map((block, index) => {
      const label = block.querySelector('.ability-label');
      const plusButton = block.querySelector('.plus-button');
      const currentScore = block.querySelector('.current-score');
      const isPrimary = label?.classList.contains('primary-ability');
      HM.log(3, `Ability ${index}: ${label?.textContent.trim()} - isPrimary: ${isPrimary}`);
      return { index, block, isPrimary, plusButton, minusButton: block.querySelector('.minus-button'), currentScore, label: label?.textContent.trim() };
    });
    return { abilities, primaryAbilities: abilities.filter((a) => a.isPrimary), nonPrimaryAbilities: abilities.filter((a) => !a.isPrimary), totalPoints: StatRoller.getTotalPoints() };
  }

  /**
   * Maximize primary abilities for point buy
   * @param {object} abilityData - Point buy ability data
   * @returns {Promise<void>}
   * @private
   */
  static async #maximizePrimaryAbilities(abilityData) {
    HM.log(3, 'Starting to max out primary abilities');
    for (const primary of abilityData.primaryAbilities) {
      HM.log(3, `Working on primary ability index ${primary.index}`);
      let maxAttempts = 20;
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
  }

  /**
   * Distribute remaining points for point buy
   * @param {object} abilityData - Point buy ability data
   * @returns {Promise<void>}
   * @private
   */
  static async #distributeRemainingPoints(abilityData) {
    let pointsSpent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
    let remainingPoints = abilityData.totalPoints - pointsSpent;
    HM.log(3, `After maxing primaries - Points spent: ${pointsSpent}, Remaining: ${remainingPoints}`);
    if (remainingPoints <= 0) {
      HM.log(3, 'No points remaining for non-primary abilities');
      return;
    }
    HM.log(3, `Starting to distribute ${remainingPoints} remaining points to non-primary abilities`);
    this.#shuffleArray(abilityData.nonPrimaryAbilities);
    HM.log(3, 'Shuffled non-primary abilities order');
    let distributionCounter = 0;
    let totalClicks = 0;
    while (remainingPoints > 0 && distributionCounter < 100) {
      distributionCounter++;
      for (const ability of abilityData.nonPrimaryAbilities) {
        if (remainingPoints <= 0) break;
        if (!ability.plusButton.disabled) {
          HM.log(3, `Clicking + for non-primary ability ${ability.index}, current value: ${ability.currentScore.textContent}`);
          ability.plusButton.click();
          totalClicks++;
          await new Promise((resolve) => setTimeout(resolve, 50));
          pointsSpent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
          remainingPoints = abilityData.totalPoints - pointsSpent;
          HM.log(3, `After click - Points spent: ${pointsSpent}, Remaining: ${remainingPoints}`);
          if (remainingPoints <= 0) break;
        } else {
          HM.log(3, `Non-primary ability ${ability.index} button is disabled, skipping`);
        }
      }
      const canStillAssign = abilityData.nonPrimaryAbilities.some((a) => !a.plusButton.disabled);
      if (!canStillAssign) {
        HM.log(3, 'No more abilities can be increased, breaking loop');
        break;
      }
    }
    HM.log(3, `Completed non-primary distribution. Total clicks: ${totalClicks}`);
  }

  /**
   * Randomize Manual Formula ability assignments
   * @private
   * @param {HTMLElement} form - The form element
   * @returns {Promise<boolean>} Success status
   */
  static async #randomizeManualFormula(form) {
    let originalDiceConfiguration = null;
    try {
      originalDiceConfiguration = game.settings.get('core', 'diceConfiguration');
      this.#setupTemporaryDiceConfiguration();
      await this.#performManualFormulaRandomization(form);
      HM.log(3, 'Manual formula randomization complete');
      return true;
    } catch (error) {
      HM.log(1, 'Error during manual formula randomization:', error);
      return false;
    } finally {
      if (originalDiceConfiguration) {
        try {
          game.settings.set('core', 'diceConfiguration', originalDiceConfiguration);
          HM.log(3, 'Restored original dice configuration');
        } catch (restoreError) {
          HM.log(1, 'Failed to restore original dice configuration:', restoreError);
        }
      }
    }
  }

  /**
   * Setup temporary dice configuration for manual formula
   * @private
   */
  static #setupTemporaryDiceConfiguration() {
    const tempDiceConfiguration = { d4: '', d6: '', d8: '', d10: '', d12: '', d20: '', d100: '' };
    game.settings.set('core', 'diceConfiguration', tempDiceConfiguration);
    HM.log(3, 'Applied temporary dice configuration');
  }

  /**
   * Perform the manual formula randomization
   * @param {HTMLElement} form - The form element
   * @returns {Promise<void>}
   * @private
   */
  static async #performManualFormulaRandomization(form) {
    const abilityBlocks = form.querySelectorAll('.ability-block');
    if (!abilityBlocks.length) {
      HM.log(2, 'No ability blocks found');
      throw new Error('No ability blocks found');
    }
    await this.#randomizeAbilityTypes(form, abilityBlocks);
    const rollResults = await this.#generateAbilityRolls(abilityBlocks);
    const finalAssignments = this.#createOptimizedAssignments(abilityBlocks, rollResults);
    await this.#applyAbilityAssignments(abilityBlocks, finalAssignments);
  }

  /**
   * Randomize ability types (STR, DEX, etc.)
   * @param {HTMLElement} _form - The form element (unused)
   * @param {NodeList} abilityBlocks - Ability block elements
   * @returns {Promise<void>}
   * @private
   */
  static async #randomizeAbilityTypes(_form, abilityBlocks) {
    const abilities = Object.keys(CONFIG.DND5E.abilities);
    const shuffledAbilities = [...abilities];
    this.#shuffleArray(shuffledAbilities);
    for (let i = 0; i < abilityBlocks.length; i++) {
      const dropdown = abilityBlocks[i].querySelector('.ability-dropdown');
      if (dropdown && i < shuffledAbilities.length) {
        dropdown.value = shuffledAbilities[i];
        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    HM.log(3, 'Randomized ability types');
  }

  /**
   * Generate ability score rolls
   * @param {NodeList} abilityBlocks - Ability block elements
   * @returns {Promise<Array>} Array of roll results
   * @private
   */
  static async #generateAbilityRolls(abilityBlocks) {
    const rollResults = [];
    const rollFormula = await StatRoller.getAbilityScoreRollFormula();
    if (!rollFormula) throw new Error('Could not get ability score roll formula');
    for (let i = 0; i < abilityBlocks.length; i++) {
      try {
        const roll = new Roll(rollFormula);
        await roll.evaluate();
        const input = abilityBlocks[i].querySelector('.ability-score');
        const ability = abilityBlocks[i].querySelector('.ability-dropdown')?.value;
        const isPrimary = abilityBlocks[i].querySelector('.primary-ability') !== null;
        rollResults.push({ index: i, value: roll.total, ability, isPrimary, input });
        HM.log(3, `Rolled ${roll.total} for ${ability} (primary: ${isPrimary})`);
      } catch (error) {
        HM.log(1, `Error rolling for ability ${i}:`, error);
        rollResults.push({
          index: i,
          value: 10,
          ability: abilityBlocks[i].querySelector('.ability-dropdown')?.value,
          isPrimary: abilityBlocks[i].querySelector('.primary-ability') !== null,
          input: abilityBlocks[i].querySelector('.ability-score')
        });
      }
    }
    return rollResults;
  }

  /**
   * Create optimized ability score assignments
   * @param {NodeList} abilityBlocks - Ability block elements
   * @param {Array} rollResults - Array of roll results
   * @returns {Array} Optimized assignments
   * @private
   */
  static #createOptimizedAssignments(abilityBlocks, rollResults) {
    rollResults.sort((a, b) => b.value - a.value);
    const primaryAbilities = rollResults.filter((r) => r.isPrimary);
    const nonPrimaryAbilities = rollResults.filter((r) => !r.isPrimary);
    const finalAssignments = new Array(abilityBlocks.length);
    let resultIndex = 0;
    primaryAbilities.forEach((primary) => {
      finalAssignments[primary.index] = rollResults[resultIndex++].value;
    });
    nonPrimaryAbilities.forEach((nonPrimary) => {
      finalAssignments[nonPrimary.index] = rollResults[resultIndex++].value;
    });
    HM.log(3, 'Created optimized ability assignments', finalAssignments);
    return finalAssignments;
  }

  /**
   * Apply ability score assignments
   * @param {NodeList} abilityBlocks - Ability block elements
   * @param {Array} finalAssignments - Array of final assignments
   * @returns {Promise<void>}
   * @private
   */
  static async #applyAbilityAssignments(abilityBlocks, finalAssignments) {
    for (let i = 0; i < abilityBlocks.length; i++) {
      const input = abilityBlocks[i].querySelector('.ability-score');
      if (input && finalAssignments[i] !== undefined) {
        input.value = finalAssignments[i];
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));
        HM.log(3, `Set ability ${i} to ${finalAssignments[i]}`);
      }
    }
  }

  /**
   * Get a random item from an array or collection
   * @private
   * @param {Array|NodeList|HTMLCollection} items - Collection to choose from
   * @returns {*} Random item from the collection
   */
  static #getRandomItem(items) {
    if (!items || !items.length) {
      HM.log(2, 'Attempted to get random item from empty collection');
      return null;
    }
    return items[Math.floor(Math.random() * items.length)];
  }

  /**
   * Shuffle array in place using Fisher-Yates algorithm
   * @private
   * @param {Array} array - Array to shuffle
   * @returns {Array} The same array, shuffled
   */
  static #shuffleArray(array) {
    if (!array || !array.length) return array;
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
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
}
