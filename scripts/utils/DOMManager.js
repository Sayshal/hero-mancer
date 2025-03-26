import { EquipmentParser, HeroMancer, HM, MandatoryFields, StatRoller, TableManager } from './index.js';

/**
 * Centralized DOM event and observer management
 * @class
 */
export class DOMManager {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @type {Map<HTMLElement, Map<string, Function[]>>} */
  static #listeners = new Map();

  /** @type {Map<string, MutationObserver>} */
  static #observers = new Map();

  /** @type {boolean} */
  static _isUpdatingEquipment = false;

  /** @type {Promise|null} */
  static _abilityUpdatePromise = null;

  /** @type {boolean} */
  static _pendingAbilityUpdate = false;

  /** @type {boolean} */
  static _updatingAbilities = false;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Add and track an event listener
   * @param {HTMLElement} element - Target element
   * @param {string} eventType - Event type ('click', 'change', etc.)
   * @param {Function} callback - Event handler
   * @returns {Function} The callback for reference
   */
  static on(element, eventType, callback) {
    if (!element) return callback;

    if (!this.#listeners.has(element)) {
      this.#listeners.set(element, new Map());
    }

    const elementEvents = this.#listeners.get(element);
    if (!elementEvents.has(eventType)) {
      elementEvents.set(eventType, []);
    }

    elementEvents.get(eventType).push(callback);
    element.addEventListener(eventType, callback);

    return callback;
  }

  /**
   * Create and track a mutation observer
   * @param {string} id - Unique observer ID
   * @param {HTMLElement} element - Element to observe
   * @param {MutationObserverInit} options - Observer configuration
   * @param {Function} callback - Handler function
   * @returns {MutationObserver} The created observer
   */
  static observe(id, element, options, callback) {
    if (this.#observers.has(id)) {
      this.#observers.get(id).disconnect();
    }

    const observer = new MutationObserver(callback);
    observer.observe(element, options);
    this.#observers.set(id, observer);

    return observer;
  }

  /**
   * Clean up all registered listeners and observers
   */
  static cleanup() {
    // Clean up event listeners
    this.#listeners.forEach((events, element) => {
      events.forEach((callbacks, type) => {
        callbacks.forEach((callback) => {
          element.removeEventListener(type, callback);
        });
      });
    });
    this.#listeners.clear();

    // Clean up observers
    this.#observers.forEach((observer) => observer.disconnect());
    this.#observers.clear();

    HM.log(3, 'DOMManager: cleaned up all event listeners and observers');
  }

  /**
   * Initialize all event handlers for the application
   * @param {HTMLElement} element - Root element
   */
  static initialize(element) {
    if (!element) return;

    this.initializeEquipmentContainer(element);
    this.initializeDropdowns(element);
    this.initializeAbilities(element);
    this.initializeEquipment(element);
    this.initializeCharacterDetails(element);
    this.initializeFormValidation(element);
    this.initializeTokenCustomization(element);
    this.initializeRollButtons(element);
    this.initializePortrait();
  }

  /**
   * Initialize dropdown-related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeDropdowns(element) {
    const dropdowns = {
      race: element.querySelector('#race-dropdown'),
      class: element.querySelector('#class-dropdown'),
      background: element.querySelector('#background-dropdown')
    };

    Object.entries(dropdowns).forEach(([type, dropdown]) => {
      if (!dropdown) return;

      this.on(dropdown, 'change', (event) => {
        // Update selection data
        const value = event.target.value;
        const id = value.split(' ')[0].trim();
        const uuid = value.match(/\[(.*?)]/)?.[1] || '';

        HM.SELECTED[type] = { value, id, uuid };
        HM.log(3, `${type} updated:`, HM.SELECTED[type]);

        // Update UI elements
        const descEl = element.querySelector(`#${type}-description`);
        if (descEl) {
          this.updateDescription(type, id, descEl);
        }

        // Update summaries
        if (type === 'race' || type === 'class') {
          this.updateClassRaceSummary();

          // Update abilities if class changes
          if (type === 'class') {
            this.updateAbilitiesSummary();
          }
        }

        if (type === 'background') {
          this.updateBackgroundSummary();
          this.processBackgroundSelectionChange(HM.SELECTED.background);
        }

        // Update equipment if needed
        if (!HM.COMPAT.ELKAN && (type === 'class' || type === 'background')) {
          this.updateEquipment(element, type);
        }

        // Update application title
        this.updateTitle(element);
      });
    });
  }

  /**
   * Initialize ability score related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeAbilities(element) {
    const rollMethodSelect = element.querySelector('#roll-method');
    const abilityDropdowns = element.querySelectorAll('.ability-dropdown');
    const abilityScores = element.querySelectorAll('.ability-score');

    // Roll method listener with special handling
    if (rollMethodSelect) {
      // First, remove any existing listeners to avoid duplicates
      const oldListeners = this.#listeners.get(rollMethodSelect);
      if (oldListeners?.get('change')) {
        oldListeners.get('change').forEach((callback) => {
          rollMethodSelect.removeEventListener('change', callback);
        });
        oldListeners.delete('change');
      }

      this.on(rollMethodSelect, 'change', async (event) => {
        const method = event.target.value;
        HM.log(3, `Roll method changed to: ${method}`);

        // Update the setting
        await game.settings.set(HM.ID, 'diceRollingMethod', method);
        HeroMancer.selectedAbilities = Array(Object.keys(CONFIG.DND5E.abilities).length).fill(HM.ABILITY_SCORES.DEFAULT);

        // Force a re-render of just the abilities tab
        const app = HM.heroMancer;
        if (app) {
          // Store current method for detection
          element.dataset.lastRollMethod = method;
          await app.render({ parts: ['abilities'] });
        }
      });
    }

    // Ability dropdowns
    abilityDropdowns.forEach((dropdown, index) => {
      // Add data-index attribute for reliable reference
      dropdown.dataset.index = index;

      this.on(dropdown, 'change', (event) => {
        const diceRollingMethod = game.settings.get(HM.ID, 'diceRollingMethod');
        StatRoller.handleAbilityDropdownChange(event, diceRollingMethod);
        this.updateAbilitiesSummary();
      });
    });

    // Ability score inputs
    abilityScores.forEach((input) => {
      this.on(input, 'change', () => this.updateAbilitiesSummary());
      this.on(input, 'input', () => this.updateAbilitiesSummary());
    });
  }

  /**
   * Initialize equipment-related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeEquipment(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    // Use mutation observer to catch dynamically added elements
    this.observe('equipment-container', equipmentContainer, { childList: true, subtree: true, attributes: true }, (mutations) => {
      let needsUpdate = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Add listeners to newly added checkboxes
              const newCheckboxes = node.querySelectorAll?.('.equipment-favorite-checkbox') || [];
              newCheckboxes.forEach((checkbox) => {
                this.on(checkbox, 'change', () => {
                  this.updateEquipmentSummary();
                });
              });

              // If we added elements that affect summary, flag for update
              if (node.querySelector('select') || node.querySelector('input[type="checkbox"]')) {
                needsUpdate = true;
              }
            }
          });
        }

        // If attribute changed on a favorite checkbox
        if (mutation.type === 'attributes' && mutation.attributeName === 'checked' && mutation.target.classList.contains('equipment-favorite-checkbox')) {
          needsUpdate = true;
        }
      }

      // Only update once if needed
      if (needsUpdate) {
        this.updateEquipmentSummary();
      }
    });

    // Attach listeners to existing equipment items
    this.attachEquipmentListeners(equipmentContainer);
  }

  /**
   * Initialize empty equipment container structure
   * @param {HTMLElement} element - Root element
   */
  static initializeEquipmentContainer(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    // Clear any existing content
    equipmentContainer.innerHTML = '';
    const choicesContainer = document.createElement('div');
    choicesContainer.className = 'equipment-choices';

    // Add choices container to equipment container
    equipmentContainer.appendChild(choicesContainer);
  }

  /**
   * Attach listeners to equipment elements
   * @param {HTMLElement} container - Equipment container
   */
  static attachEquipmentListeners(container) {
    if (!container) return;

    // Add change listeners to selects and checkboxes
    const selects = container.querySelectorAll('select');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    selects.forEach((select) => {
      this.on(select, 'change', () => this.updateEquipmentSummary());
    });

    checkboxes.forEach((checkbox) => {
      this.on(checkbox, 'change', () => this.updateEquipmentSummary());
    });
  }

  /**
   * Initialize character detail handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeCharacterDetails(element) {
    // Character name input
    const nameInput = element.querySelector('#character-name');
    if (nameInput) {
      this.on(nameInput, 'input', () => this.updateTitle(element));
    }

    // Token art checkbox
    const tokenArtCheckbox = element.querySelector('#link-token-art');
    if (tokenArtCheckbox) {
      this.on(tokenArtCheckbox, 'change', () => {
        const tokenArtRow = element.querySelector('.token-art-row');
        if (tokenArtRow) {
          tokenArtRow.style.display = tokenArtCheckbox.checked ? 'none' : 'flex';
        }
      });
    }

    // Player dropdown (GM only)
    if (game.user.isGM) {
      const playerElement = element.querySelector('#player-assignment');
      if (playerElement) {
        this.on(playerElement, 'change', (event) => {
          const playerId = event.currentTarget.value;
          const colorPicker = element.querySelector('#player-color');
          if (colorPicker) {
            colorPicker.value = HeroMancer.ORIGINAL_PLAYER_COLORS.get(playerId);
          }
        });
      }
    }
  }

  /**
   * Initialize form validation handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeFormValidation(element) {
    const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
    if (mandatoryFields.length === 0) return;

    // Form elements
    const formElements = element.querySelectorAll('input, select, textarea, color-picker');
    formElements.forEach((formElement) => {
      // Change event
      this.on(formElement, 'change', async () => {
        await MandatoryFields.checkMandatoryFields(element);
      });

      // Input event for text inputs
      if (formElement.tagName.toLowerCase() === 'input' || formElement.tagName.toLowerCase() === 'textarea') {
        this.on(formElement, 'input', async () => {
          await MandatoryFields.checkMandatoryFields(element);
        });
      }
    });

    // ProseMirror editors
    const proseMirrorElements = element.querySelectorAll('prose-mirror');
    proseMirrorElements.forEach((editor, index) => {
      const editorContent = editor.querySelector('.editor-content.ProseMirror');
      if (editorContent) {
        this.observe(`prose-mirror-${index}`, editorContent, { childList: true, characterData: true, subtree: true }, async () => {
          await MandatoryFields.checkMandatoryFields(element);
        });
      }
    });
  }

  /**
   * Initialize token customization handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeTokenCustomization(element) {
    const ringEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');
    if (!ringEnabled) return;

    const ringEnabledElement = element.querySelector('input[name="ring.enabled"]');
    const ringOptions = element.querySelectorAll(
      ['.customization-row:has(color-picker[name="ring.color"])', '.customization-row:has(color-picker[name="backgroundColor"])', '.customization-row.ring-effects'].join(', ')
    );

    if (!ringEnabledElement || !ringOptions.length) return;

    // Initial state
    ringOptions.forEach((option) => {
      option.style.display = ringEnabledElement.checked ? 'flex' : 'none';
    });

    // Toggle on change
    this.on(ringEnabledElement, 'change', (event) => {
      if (!event.currentTarget.checked) {
        // Reset color pickers
        element.querySelectorAll('color-picker[name="ring.color"], color-picker[name="backgroundColor"]').forEach((picker) => {
          picker.value = '';
          picker.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Reset ring effect checkboxes
        element.querySelectorAll('input[name="ring.effects"]').forEach((checkbox) => {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      // Toggle visibility
      ringOptions.forEach((option) => {
        option.style.display = event.currentTarget.checked ? 'flex' : 'none';
      });
    });
  }

  /**
   * Initialize character portrait with default image
   * @static
   */
  static initializePortrait() {
    const portraitContainer = document.querySelector('.character-portrait');
    if (portraitContainer) {
      const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
      const randomAbility = abilities[Math.floor(Math.random() * 6)];
      const defaultImage = `systems/dnd5e/icons/svg/abilities/${randomAbility}.svg`;
      const portraitImg = portraitContainer.querySelector('img');

      if (portraitImg) {
        portraitImg.src = defaultImage;

        // Check if dark mode is active and apply inversion if needed
        const isDarkMode = game.settings.get('core', 'colorScheme') === 'dark';
        this.applyDarkModeToImage(portraitImg, isDarkMode, true);
      }

      // Add name and art path update handling
      const nameInput = document.querySelector('#character-name');
      const artInput = document.querySelector('#character-art-path');
      const portraitName = document.querySelector('.header-section h2');

      const updatePortrait = () => {
        if (portraitName) {
          portraitName.innerHTML = nameInput?.value || game.user.name;
        }
        if (portraitImg && artInput) {
          const isDefaultImage = portraitImg.src.includes('/abilities/');
          portraitImg.src = artInput.value || defaultImage;

          // Only apply dark mode treatment for default images
          const isDarkMode = game.settings.get('core', 'colorScheme') === 'dark';
          const isStillDefaultImage = !artInput.value || artInput.value.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, isDarkMode, isStillDefaultImage);
        }
      };

      this.on(nameInput, 'change', updatePortrait);
      this.on(artInput, 'change', updatePortrait);
      updatePortrait();

      // Listen for color scheme changes
      Hooks.on('colorSchemeChange', (scheme) => {
        if (portraitImg) {
          const isDefaultImage = portraitImg.src.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, scheme === 'dark', isDefaultImage);
        }
      });
    }
  }

  /**
   * Helper method to apply or remove dark mode treatment to images
   * @param {HTMLImageElement} imgElement - The image element
   * @param {boolean} isDarkMode - Whether dark mode is active
   * @param {boolean} isDefaultImage - Whether the image is a default ability icon
   */
  static applyDarkModeToImage(imgElement, isDarkMode, isDefaultImage) {
    if (isDarkMode && isDefaultImage) {
      imgElement.style.filter = 'invert(1)';
    } else {
      imgElement.style.filter = 'none';
    }
  }

  /**
   * Updates character portrait with provided image path
   * @param {string} imagePath - Path to character image
   * @static
   */
  static updateCharacterPortrait(imagePath) {
    const portraitImg = document.querySelector('.character-portrait img');
    if (portraitImg) {
      portraitImg.src = imagePath;
    }
  }

  /**
   * Initialize roll buttons for background characteristics
   * @param {HTMLElement} element - Application root element
   */
  static initializeRollButtons() {
    const rollButtons = document.querySelectorAll('.roll-btn');
    const backgroundSelect = document.querySelector('#background-dropdown');

    // Batch disable all buttons initially
    if (rollButtons.length) {
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = true));
      });
    }

    backgroundSelect?.addEventListener('change', (event) => {
      const backgroundId = event.target.value.split(' (')[0];

      // Batch button updates
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = !backgroundId));
      });
    });

    rollButtons.forEach((button) => {
      button.addEventListener('click', async (event) => {
        const tableType = event.currentTarget.dataset.table;
        const textarea = event.currentTarget.closest('.input-with-roll').querySelector('textarea');
        const backgroundId = HM.SELECTED.background.id;

        if (!backgroundId) {
          ui.notifications.warn(game.i18n.localize('hm.warnings.select-background'));
          return;
        }

        const result = await TableManager.rollOnBackgroundCharacteristicTable(backgroundId, tableType);
        HM.log(3, 'Roll result:', result);

        if (result) {
          textarea.value = textarea.value ? `${textarea.value} ${result}` : result;
          textarea.dispatchEvent(new Event('change', { bubbles: true }));

          if (TableManager.areAllTableResultsDrawn(backgroundId, tableType)) {
            button.disabled = true;
          }
        }
      });
    });
  }

  /**
   * Updates the background summary text and formatting
   * @returns {Promise<void>}
   * @static
   */
  static async updateBackgroundSummary() {
    const backgroundSelect = document.querySelector('#background-dropdown');
    const summary = document.querySelector('.background-summary');

    if (!summary || !backgroundSelect) return;

    const selectedOption = backgroundSelect.selectedIndex > 0 ? backgroundSelect.options[backgroundSelect.selectedIndex] : null;

    // Handle default/no selection case
    if (!selectedOption?.value) {
      const article = game.i18n.localize('hm.app.equipment.article-plural');
      summary.innerHTML = game.i18n.format('hm.app.finalize.summary.background', {
        article: article,
        background: game.i18n.localize('hm.app.background.adventurer')
      });
      return;
    }

    // Make sure we have the UUID
    if (!HM.SELECTED.background?.uuid) {
      return;
    }

    const backgroundName = selectedOption.text;
    const article = /^[aeiou]/i.test(backgroundName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');

    const content = game.i18n.format('hm.app.finalize.summary.background', {
      article: article,
      background: `@UUID[${HM.SELECTED.background.uuid}]`
    });

    summary.innerHTML = await TextEditor.enrichHTML(content);
  }

  /**
   * Updates the class and race summary text
   * @returns {Promise<void>}
   * @static
   */
  static async updateClassRaceSummary() {
    const raceSelect = document.querySelector('#race-dropdown');
    const classSelect = document.querySelector('#class-dropdown');
    const summary = document.querySelector('.class-race-summary');

    if (!summary) return;

    // Get race details
    let raceLink = game.i18n.format('hm.unknown', { type: 'race' });
    if (HM.SELECTED.race?.uuid) {
      const selectedRaceOption = raceSelect?.selectedIndex > 0 ? raceSelect.options[raceSelect.selectedIndex] : null;
      let raceName;
      if (selectedRaceOption) {
        raceName = selectedRaceOption.text;
      } else if (raceSelect) {
        // Find matching option
        for (let i = 0; i < raceSelect.options.length; i++) {
          if (raceSelect.options[i].value.includes(HM.SELECTED.race.uuid)) {
            raceName = raceSelect.options[i].text;
            break;
          }
        }
      }

      if (raceName) {
        raceLink = `@UUID[${HM.SELECTED.race.uuid}]`;
      }
    }

    // Similar process for class
    let classLink = game.i18n.format('hm.unknown', { type: 'class' });
    if (HM.SELECTED.class?.uuid) {
      const className = classSelect?.selectedIndex > 0 ? classSelect.options[classSelect.selectedIndex].text : 'unknown class';
      classLink = `@UUID[${HM.SELECTED.class.uuid}]`;
    }

    // Always update summary, even with partial data
    const content = game.i18n.format('hm.app.finalize.summary.classRace', {
      race: raceLink,
      class: classLink
    });

    summary.innerHTML = await TextEditor.enrichHTML(content);
  }

  /**
   * Updates the equipment summary with selected items
   * @returns {Promise<void>}
   * @static
   */
  static async updateEquipmentSummary() {
    // Check if we're already processing an update
    if (this._isUpdatingEquipment) return;
    this._isUpdatingEquipment = true;

    try {
      const priorityTypes = ['weapon', 'armor', 'shield'];
      const equipmentContainer = document.querySelector('#equipment-container');

      // If no container or in ELKAN mode, exit early
      if (!equipmentContainer || HM.COMPAT.ELKAN) {
        const summary = document.querySelector('.equipment-summary');
        if (summary) {
          summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        }
        return;
      }

      // Collect all equipment items at once
      const selectedEquipment = Array.from(document.querySelectorAll('#equipment-container select, #equipment-container input[type="checkbox"]:checked'))
        .map((el) => {
          // For selects
          if (el.tagName === 'SELECT') {
            const selectedOption = el.options[el.selectedIndex];
            if (!selectedOption || !selectedOption.value || !selectedOption.value.includes('Compendium')) return null;

            const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
            const isFavorite = favoriteCheckbox?.checked || false;

            return {
              type: selectedOption.dataset.tooltip?.toLowerCase() || '',
              uuid: selectedOption.value,
              text: selectedOption.textContent?.trim(),
              favorite: isFavorite
            };
          }
          // For checkboxes
          else {
            const link = el.parentElement?.querySelector('.content-link');
            const uuid = link?.dataset?.uuid;

            if (!link || !uuid || uuid.includes(',') || !uuid.includes('Compendium')) return null;

            const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
            const isFavorite = favoriteCheckbox?.checked || false;

            return {
              type: link.dataset.tooltip?.toLowerCase() || '',
              uuid: uuid,
              text: link.textContent?.trim(),
              favorite: isFavorite
            };
          }
        })
        .filter(Boolean);

      if (!selectedEquipment.length) {
        // No equipment? Update summary with default message
        const summary = document.querySelector('.equipment-summary');
        if (summary) {
          summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        }
        return;
      }

      // Single log before sorting
      HM.log(
        3,
        'Before sorting:',
        selectedEquipment.map((item) => `${item.text} (favorite: ${item.favorite})`)
      );

      // Sort once - favorites first, then by type priority
      selectedEquipment.sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;

        // If both have same favorite status, use the type priority
        const aIndex = priorityTypes.indexOf(a.type);
        const bIndex = priorityTypes.indexOf(b.type);
        return (bIndex === -1 ? -999 : bIndex) - (aIndex === -1 ? -999 : aIndex);
      });

      // Single log after sorting
      HM.log(
        3,
        'After sorting:',
        selectedEquipment.map((item) => `${item.text} (favorite: ${item.favorite})`)
      );

      // Take up to 3 items
      const displayEquipment = selectedEquipment.slice(0, 3);

      const summary = document.querySelector('.equipment-summary');
      if (summary && displayEquipment.length) {
        const formattedItems = displayEquipment.map((item) => {
          const itemName = item.text;
          const article = /^[aeiou]/i.test(itemName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');
          return `${article} @UUID[${item.uuid}]{${item.text}}`;
        });

        const content = game.i18n.format('hm.app.finalize.summary.equipment', {
          items:
            formattedItems.slice(0, -1).join(game.i18n.localize('hm.app.equipment.separator')) +
            (formattedItems.length > 1 ? game.i18n.localize('hm.app.equipment.and') : '') +
            formattedItems.slice(-1)
        });
        summary.innerHTML = await TextEditor.enrichHTML(content);
      } else if (summary) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
      }
    } finally {
      // Release the lock when done
      this._isUpdatingEquipment = false;
    }
  }

  /**
   * Updates the abilities summary based on class preferences and highest scores
   * @returns {Promise<void>}
   * @static
   */
  static async updateAbilitiesSummary() {
    // Store current class UUID for comparison
    const currentClassUUID = HM.SELECTED.class?.uuid;

    // Don't use a simple flag - we need a more robust approach
    if (this._abilityUpdatePromise) {
      // Store that we need another update after this one finishes
      this._pendingAbilityUpdate = true;
      return;
    }

    try {
      // Create a new update promise
      this._abilityUpdatePromise = (async () => {
        // Add a small delay to ensure the class selection is fully processed
        await new Promise((resolve) => setTimeout(resolve, 10));

        // First, ensure the class UUID hasn't changed during our delay
        if (currentClassUUID !== HM.SELECTED.class?.uuid) {
          return; // Another update will happen
        }

        // Rest of the existing function's logic
        const abilityBlocks = document.querySelectorAll('.ability-block');
        const abilityScores = {};
        const rollMethodSelect = document.getElementById('roll-method');
        const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
        const rollMethod = abilitiesTab?.dataset.currentMethod || rollMethodSelect?.value || 'standardArray';

        if (this._updatingAbilities) return;
        this._updatingAbilities = true;
        try {
          // First, remove any existing highlights
          const previousHighlights = document.querySelectorAll('.primary-ability');
          previousHighlights.forEach((el) => {
            el.classList.remove('primary-ability');
            el.removeAttribute('data-tooltip');
          });

          // Get the primary abilities from the class item
          const primaryAbilities = new Set();
          try {
            const classUUID = HM.SELECTED.class?.uuid;
            if (classUUID) {
              const classItem = fromUuidSync(classUUID);

              // Get primary ability
              if (classItem?.system?.primaryAbility?.value?.length) {
                for (const ability of classItem.system.primaryAbility.value) {
                  primaryAbilities.add(ability.toLowerCase());
                }
              }

              // Get spellcasting ability
              if (classItem?.system?.spellcasting?.ability) {
                primaryAbilities.add(classItem.system.spellcasting.ability.toLowerCase());
              }

              // Get saving throw proficiencies
              if (classItem?.advancement?.byType?.Trait) {
                const level1Traits = classItem.advancement.byType.Trait.filter((entry) => entry.level === 1 && entry.configuration.grants);

                for (const trait of level1Traits) {
                  const grants = trait.configuration.grants;
                  for (const grant of grants) {
                    if (grant.startsWith('saves:')) {
                      primaryAbilities.add(grant.split(':')[1].toLowerCase());
                    }
                  }
                }
              }
            }
          } catch (error) {}

          // Process each ability block
          abilityBlocks.forEach((block, index) => {
            let score = 0;
            let abilityKey = '';

            // Find which ability this block represents based on the roll method
            if (rollMethod === 'pointBuy') {
              const hiddenInput = block.querySelector('input[type="hidden"]');
              if (hiddenInput) {
                const nameMatch = hiddenInput.name.match(/abilities\[(\w+)]/);
                if (nameMatch && nameMatch[1]) {
                  abilityKey = nameMatch[1].toLowerCase();
                }
              }
              score = parseInt(block.querySelector('.current-score')?.innerHTML) || 0;
            } else if (rollMethod === 'standardArray') {
              const dropdown = block.querySelector('.ability-dropdown');
              if (dropdown) {
                // Extract ability key from the dropdown name attribute
                const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
                if (nameMatch && nameMatch[1]) {
                  abilityKey = nameMatch[1].toLowerCase();
                }
                score = parseInt(dropdown.value) || 0;
              }
            } else if (rollMethod === 'manualFormula') {
              const dropdown = block.querySelector('.ability-dropdown');
              if (dropdown) {
                // Use dropdown value for highlighting regardless of score value
                abilityKey = dropdown.value?.toLowerCase() || '';
                // We still get score for summary calculations
                score = parseInt(block.querySelector('.ability-score')?.value) || 0;
              }
            }

            // Apply highlighting if this is a primary ability
            if (abilityKey && primaryAbilities.has(abilityKey)) {
              const classUUID = HM.SELECTED.class?.uuid;
              const classItem = classUUID ? fromUuidSync(classUUID) : null;
              const className = classItem?.name || game.i18n.localize('hm.app.abilities.your-class');

              // For standardArray and pointBuy, highlight the label
              const label = block.querySelector('.ability-label');
              if (label) {
                label.classList.add('primary-ability');
                // Add tooltip text as data attribute
                const abilityName = CONFIG.DND5E.abilities[abilityKey]?.label || abilityKey.toUpperCase();
                const tooltipText = game.i18n.format('hm.app.abilities.primary-tooltip', {
                  ability: abilityName,
                  class: className
                });
                label.setAttribute('data-tooltip', tooltipText);
              }

              // For standardArray, also highlight the dropdown
              if (rollMethod === 'standardArray') {
                const dropdown = block.querySelector('.ability-dropdown');
                if (dropdown) {
                  dropdown.classList.add('primary-ability');
                }
              }

              // For manualFormula, always highlight the dropdown if the ability matches
              if (rollMethod === 'manualFormula') {
                const dropdown = block.querySelector('.ability-dropdown');
                if (dropdown) {
                  dropdown.classList.add('primary-ability');
                  // Add tooltip to dropdown for better visibility
                  const abilityName = CONFIG.DND5E.abilities[abilityKey]?.label || abilityKey.toUpperCase();
                  const tooltipText = game.i18n.format('hm.app.abilities.primary-tooltip', {
                    ability: abilityName,
                    class: className
                  });
                  dropdown.setAttribute('data-tooltip', tooltipText);
                }
              }
            }

            // Store score for summary calculations
            if (abilityKey) {
              abilityScores[abilityKey] = score;
            }
          });

          // Sort abilities by preference and then by score
          const sortedAbilities = Object.entries(abilityScores)
            .sort(([abilityA, scoreA], [abilityB, scoreB]) => {
              // First sort by preferred status
              const preferredA = primaryAbilities.has(abilityA);
              const preferredB = primaryAbilities.has(abilityB);

              if (preferredA && !preferredB) return -1;
              if (!preferredA && preferredB) return 1;

              // Then sort by score
              return scoreB - scoreA;
            })
            .map(([ability]) => ability.toLowerCase());

          // Select the top 2 abilities
          const selectedAbilities = [];
          for (const ability of sortedAbilities) {
            if (selectedAbilities.length < 2 && !selectedAbilities.includes(ability)) {
              selectedAbilities.push(ability);
            }
          }

          // If we still need more abilities, add highest scoring ones
          if (selectedAbilities.length < 2) {
            for (const [ability, score] of Object.entries(abilityScores).sort(([, a], [, b]) => b - a)) {
              if (!selectedAbilities.includes(ability) && selectedAbilities.length < 2) {
                selectedAbilities.push(ability);
              }
            }
          }

          // Update the summary HTML
          const abilitiesSummary = document.querySelector('.abilities-summary');
          if (abilitiesSummary && selectedAbilities.length >= 2) {
            const content = game.i18n.format('hm.app.finalize.summary.abilities', {
              first: `&Reference[${selectedAbilities[0]}]`,
              second: `&Reference[${selectedAbilities[1]}]`
            });
            abilitiesSummary.innerHTML = await TextEditor.enrichHTML(content);
          } else if (abilitiesSummary) {
            abilitiesSummary.innerHTML = game.i18n.localize('hm.app.finalize.summary.abilitiesDefault');
          }
        } finally {
          setTimeout(() => (this._updatingAbilities = false), 50);
        }
      })();
      await this._abilityUpdatePromise;
    } finally {
      // Clear the promise reference
      this._abilityUpdatePromise = null;

      // If another update was requested while we were processing
      if (this._pendingAbilityUpdate) {
        this._pendingAbilityUpdate = false;
        // Request another update
        requestAnimationFrame(() => this.updateAbilitiesSummary());
      }
    }
  }

  /**
   * Processes background selection changes to load relevant tables
   * @param {object} selectedBackground - Selected background data
   * @returns {Promise<void>}
   * @static
   */
  static async processBackgroundSelectionChange(selectedBackground) {
    if (!selectedBackground?.value) {
      return;
    }

    const uuid = HM.SELECTED.background.uuid;

    try {
      const background = await fromUuid(uuid);
      if (background) {
        await TableManager.loadRollTablesForBackground(background);

        const rollButtons = document.querySelectorAll('.roll-btn');
        rollButtons.forEach((button) => (button.disabled = false));
      }
    } catch (error) {
      HM.log(1, `Error loading background with UUID ${uuid}:`, error);
    }
  }

  /**
   * Generates a formatted chat message summarizing the created character
   * @returns {string} HTML content for chat message
   * @static
   */
  static generateCharacterSummaryChatMessage() {
    const characterName = document.querySelector('#character-name')?.value || game.user.name;

    const summaries = {
      classRace: document.querySelector('.class-race-summary')?.innerHTML || '',
      background: document.querySelector('.background-summary')?.innerHTML || '',
      abilities: document.querySelector('.abilities-summary')?.innerHTML || '',
      equipment: document.querySelector('.equipment-summary')?.innerHTML || ''
    };

    let message = `
    <div class="character-summary" style="line-height: 1.7; margin: 0.5em 0;">
        <h2 style="margin-bottom: 0.5em">${characterName}</h2>
        <hr style="margin: 0.5em 0">
    `;

    if (summaries.classRace) {
      message += `<span class="summary-section class-race">${summaries.classRace}</span> `;
    }

    if (summaries.background) {
      message += `<span class="summary-section background">${summaries.background}</span> `;
    }

    if (summaries.abilities) {
      message += `<span class="summary-section abilities">${summaries.abilities}</span> `;
    }

    if (summaries.equipment) {
      message += `<span class="summary-section equipment">${summaries.equipment}</span>`;
    }

    message += '</div>';

    return message;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Update description element with content
   * @param {string} type - Type of dropdown (class, race, background)
   * @param {string} id - ID of selected item
   * @param {HTMLElement} descriptionEl - Description element to update
   */
  static updateDescription(type, id, descriptionEl) {
    HM.log(3, `Updating ${type} description for ID: ${id}`);

    try {
      // For race documents, they're organized in folders
      if (type === 'race') {
        let foundDoc = null;

        for (const folder of HM.documents.race) {
          const doc = folder.docs.find((d) => d.id === id);
          if (doc) {
            foundDoc = doc;
            break;
          }
        }

        if (foundDoc) {
          descriptionEl.innerHTML = foundDoc.enrichedDescription || '';
        } else {
          if (!id) return;
          descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
        }
      } else {
        const docsArray = HM.documents[type] || [];
        const doc = docsArray.find((d) => d.id === id);

        if (doc) {
          if (doc.enrichedDescription) {
            descriptionEl.innerHTML = doc.enrichedDescription;
          } else {
            descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
          }
        } else {
          if (!id) return;
          descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
        }
      }
    } catch (error) {
      HM.log(1, `Error updating ${type} description: ${error}`);
      descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
    }
  }

  /**
   * Update equipment UI based on changed selections
   * @param {HTMLElement} element - Application root element
   * @param {string} type - Which selection changed ('class' or 'background')
   */
  static updateEquipment(element, type) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer) return;

    try {
      // Reset rendered flags
      if (EquipmentParser.lookupItems) {
        Object.values(EquipmentParser.lookupItems).forEach((category) => {
          if (category.items?.forEach) {
            category.items.forEach((item) => {
              delete item.rendered;
              delete item.isSpecialCase;
              delete item.specialGrouping;
            });
          }
        });
      }

      // Create equipment parser
      const equipment = new EquipmentParser(HM.SELECTED.class?.id, HM.SELECTED.background?.id);

      // Let it update just the requested section
      equipment
        .generateEquipmentSelectionUI(type)
        .then((choices) => {
          // Attach listeners to new elements
          this.attachEquipmentListeners(equipmentContainer);
        })
        .catch((error) => {
          HM.log(1, `Error updating ${type} equipment choices:`, error);
        });
    } catch (error) {
      HM.log(1, `Error in updateEquipment for ${type}:`, error);
    }
  }

  /**
   * Update application title based on form state
   * @param {HTMLElement} element - Application root element
   */
  static updateTitle(element) {
    if (!HM.heroMancer) return;

    // Get character name or default to user name
    const characterNameInput = element.querySelector('#character-name');
    const characterName = characterNameInput?.value?.trim() || game.user.name;

    // Character description components
    let race = '';
    let background = '';
    let charClass = '';

    // Get document names from UUIDs
    try {
      if (HM.SELECTED.race?.uuid) {
        const raceDoc = fromUuidSync(HM.SELECTED.race.uuid);
        race = raceDoc?.name || '';
      }

      if (HM.SELECTED.class?.uuid) {
        const classDoc = fromUuidSync(HM.SELECTED.class.uuid);
        charClass = classDoc?.name || '';
      }

      if (HM.SELECTED.background?.uuid) {
        const backgroundDoc = fromUuidSync(HM.SELECTED.background.uuid);
        background = backgroundDoc?.name || '';
      }
    } catch (error) {
      HM.log(2, `Error getting document: ${error}`);
    }

    let characterDescription = characterName;
    const components = [race, background, charClass].filter((c) => c);

    if (components.length > 0) {
      characterDescription += `, ${game.i18n.format('hm.app.title', { components: components.join(' ') })}`;
      characterDescription += '.';
    }

    const newTitle = `${HM.NAME} | ${characterDescription}`;

    HM.heroMancer._updateFrame({
      window: {
        title: newTitle
      }
    });
  }

  /**
   * Create a debounced update function
   * @param {Function} updateFn - Function to debounce
   * @param {number} delay - Delay in ms
   * @returns {Function} Debounced function
   */
  static debounce(updateFn, delay = 50) {
    let timeout = null;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        updateFn.apply(this, args);
      }, delay);
    };
  }

  /**
   * Updates the display of remaining points in the abilities tab
   * @param {number} remainingPoints - The number of points remaining to spend
   * @static
   */
  static updateRemainingPointsDisplay(remainingPoints) {
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    if (!abilitiesTab?.classList.contains('active')) return;

    const remainingPointsElement = document.getElementById('remaining-points');
    const totalPoints = StatRoller.getTotalPoints();

    if (remainingPointsElement) {
      remainingPointsElement.innerHTML = remainingPoints;
      this.#updatePointsColor(remainingPointsElement, remainingPoints, totalPoints);
    }
  }

  /**
   * Adjusts ability score up or down within valid range and point limits
   * @param {number} index - The index of the ability score to adjust
   * @param {number} change - The amount to change the score by (positive or negative)
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @static
   */
  static changeAbilityScoreValue(index, change, selectedAbilities) {
    if (!Array.isArray(selectedAbilities)) {
      HM.log(1, 'selectedAbilities must be an array');
      return;
    }
    const abilityScoreElement = document.getElementById(`ability-score-${index}`);
    const currentScore = parseInt(abilityScoreElement.innerHTML, 10);
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const newScore = Math.min(MAX, Math.max(MIN, currentScore + change));
    const totalPoints = StatRoller.getTotalPoints();
    const pointsSpent = StatRoller.calculateTotalPointsSpent(selectedAbilities);

    if (change > 0 && pointsSpent + StatRoller.getPointBuyCostForScore(newScore) - StatRoller.getPointBuyCostForScore(currentScore) > totalPoints) {
      HM.log(2, 'Not enough points remaining to increase this score.');
      return;
    }

    if (newScore !== currentScore) {
      abilityScoreElement.innerHTML = newScore;
      selectedAbilities[index] = newScore;

      const updatedPointsSpent = StatRoller.calculateTotalPointsSpent(selectedAbilities);
      const remainingPoints = totalPoints - updatedPointsSpent;

      this.updateRemainingPointsDisplay(remainingPoints);
      this.updatePlusButtonState(selectedAbilities, remainingPoints);
      this.updateMinusButtonState(selectedAbilities);
    }
  }

  /**
   * Updates the state of plus buttons based on available points and maximum scores
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @param {number} remainingPoints - Points available to spend
   * @static
   */
  static updatePlusButtonState(selectedAbilities, remainingPoints) {
    // Create a document fragment for batch processing
    const updates = [];
    const { MAX } = HM.ABILITY_SCORES;

    document.querySelectorAll('.plus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const pointCostForNextIncrease = StatRoller.getPointBuyCostForScore(currentScore + 1) - StatRoller.getPointBuyCostForScore(currentScore);
      const shouldDisable = currentScore >= MAX || remainingPoints < pointCostForNextIncrease;

      // Only update if the state actually changes
      if (button.disabled !== shouldDisable) {
        updates.push(() => (button.disabled = shouldDisable));
      }

      const inputElement = document.getElementById(`ability-${index}-input`);
      if (inputElement && inputElement.value !== String(currentScore)) {
        updates.push(() => (inputElement.value = currentScore));
      }
    });

    // Apply all updates in one batch
    if (updates.length) {
      requestAnimationFrame(() => updates.forEach((update) => update()));
    }
  }

  /**
   * Updates the state of minus buttons based on minimum allowed scores
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @static
   */
  static updateMinusButtonState(selectedAbilities) {
    const updates = [];
    const { MIN } = HM.ABILITY_SCORES;

    document.querySelectorAll('.minus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const shouldDisable = currentScore <= MIN;

      // Only update if the state actually changes
      if (button.disabled !== shouldDisable) {
        updates.push(() => (button.disabled = shouldDisable));
      }

      const inputElement = document.getElementById(`ability-${index}-input`);
      if (inputElement && inputElement.value !== String(currentScore)) {
        updates.push(() => (inputElement.value = currentScore));
      }
    });

    // Apply all updates in one batch
    if (updates.length) {
      requestAnimationFrame(() => updates.forEach((update) => update()));
    }
  }

  /**
   * Retrieves dropdown element from DOM
   * @param {HTMLElement} html - Parent element
   * @param {string} type - Dropdown type
   * @returns {HTMLElement|null} Dropdown element if found
   * @static
   */
  static findDropdownElementByType(html, type) {
    const dropdown = html.querySelector(`#${type}-dropdown`);
    if (!dropdown) {
      HM.log(1, `Dropdown for ${type} not found.`);
    }
    return dropdown;
  }

  /**
   * Handles standard array mode dropdown updates
   * @param {NodeList} abilityDropdowns - Ability dropdown elements
   * @param {string[]} selectedValues - Currently selected values
   * @static
   */
  static handleStandardArrayMode(abilityDropdowns, selectedValues) {
    // Get the standard array from the first dropdown's options
    const valueOccurrences = {};
    const firstDropdown = abilityDropdowns[0];
    const availableOptions = Array.from(firstDropdown.options).filter((opt) => opt.value && opt.value !== '');

    // Count occurrences of each value in the standard array
    availableOptions.forEach((option) => {
      const value = option.value;
      if (value) valueOccurrences[value] = (valueOccurrences[value] || 0) + 1;
    });

    // Count current selections - use actual dropdown values if selected values are empty
    const selectedCounts = {};
    selectedValues.forEach((value, index) => {
      // If value is empty, get the actual dropdown value
      const effectiveValue = value || abilityDropdowns[index].value;
      if (effectiveValue) selectedCounts[effectiveValue] = (selectedCounts[effectiveValue] || 0) + 1;
    });

    // Update each dropdown
    abilityDropdowns.forEach((dropdown, index) => {
      const currentValue = selectedValues[index] || dropdown.value;
      const valuesToDisable = {};

      // For each selected value, determine how many instances to disable
      Object.entries(selectedCounts).forEach(([value, count]) => {
        valuesToDisable[value] = count;
        // Don't disable the current selection
        if (value === currentValue) {
          valuesToDisable[value]--;
        }
      });

      // Apply disabling to options
      Array.from(dropdown.options).forEach((option) => {
        const optionValue = option.value;
        if (!optionValue) return; // Skip empty option

        if (valuesToDisable[optionValue] > 0) {
          option.disabled = true;
          valuesToDisable[optionValue]--;
        } else {
          option.disabled = false;
        }
      });
    });
  }

  /**
   * Updates dropdown options based on point cost
   * @param {HTMLElement} dropdown - Dropdown element
   * @param {number} currentValue - Current selected value
   * @param {number} remainingPoints - Remaining points
   * @static
   */
  static updateDropdownSelectionAvailability(dropdown, currentValue, remainingPoints) {
    const { MIN, MAX } = HM.ABILITY_SCORES;

    dropdown.querySelectorAll('option').forEach((option) => {
      const optionValue = parseInt(option.value, 10);
      if (optionValue < MIN || optionValue > MAX) return;

      const optionCost = StatRoller.getPointBuyCostForScore(optionValue);
      const canAffordOption = optionCost <= remainingPoints + StatRoller.getPointBuyCostForScore(currentValue);

      option.disabled = !canAffordOption && optionValue !== currentValue;
    });
  }

  /* -------------------------------------------- */
  /*  Private Methods                             */
  /* -------------------------------------------- */

  /**
   * Updates the color of the remaining points display based on percentage remaining
   * @param {HTMLElement} element - The element to update
   * @param {number} remainingPoints - Current remaining points
   * @param {number} totalPoints - Total available points
   * @private
   * @static
   */
  static #updatePointsColor(element, remainingPoints, totalPoints) {
    if (!element) return;

    const percentage = (remainingPoints / totalPoints) * 100;
    const hue = Math.max(0, Math.min(120, (percentage * 120) / 100));
    element.style.color = `hsl(${hue}, 100%, 35%)`;
  }
}
