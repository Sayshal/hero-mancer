import { HM } from '../utils/index.js';

/**
 * Parses, manages, and renders equipment data for character creation
 * Handles equipment selection UI, lookup item indexing, and equipment data collection
 * @class
 */
export class EquipmentParser {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /**
   * Set of item IDs that have been combined in UI display
   * @type {Set<string>}
   * @static
   */
  static combinedItemIds = new Set();

  /**
   * Cache for equipment content to avoid repetitive lookups
   * @type {Map<string, object>}
   * @static
   */
  static contentCache = new Map();

  /**
   * Set of items that have been rendered in the UI
   * @type {Set<string>}
   * @static
   */
  static renderedItems = new Set();

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * Parsed equipment data for class and background
   * @type {object|null}
   */
  equipmentData;

  /**
   * ID of the selected class
   * @type {string}
   */
  classId;

  /**
   * UUID of the selected class
   * @type {string}
   */
  classUUID;

  /**
   * ID of the selected background
   * @type {string}
   */
  backgroundId;

  /**
   * UUID of the selected background
   * @type {string}
   */
  backgroundUUID;

  /**
   * Set of proficiencies the character has
   * @type {Set<string>}
   */
  proficiencies;

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * Creates a new EquipmentParser instance
   * Initializes properties and preloads compendium indices
   */
  constructor() {
    this.equipmentData = null;
    this.classId = HM.SELECTED.class.id;
    this.classUUID = HM.SELECTED.class.uuid;
    this.backgroundId = HM.SELECTED.background.id;
    this.backgroundUUID = HM.SELECTED.background.uuid;
    this.proficiencies = new Set();
  }

  /* -------------------------------------------- */
  /*  Public Methods                              */
  /* -------------------------------------------- */

  /**
   * Retrieves and combines equipment data from class and background selections
   * @async
   * @returns {Promise<void>}
   */
  async fetchEquipmentData() {
    const classEquipment = await this.getStartingEquipment('class');
    const backgroundEquipment = await this.getStartingEquipment('background');

    this.equipmentData = {
      class: classEquipment || [],
      background: backgroundEquipment || []
    };
  }

  /**
   * Searches all selectedPacks for a document by ID
   * @async
   * @param {string} itemId - Item ID to search for
   * @returns {Promise<Item|null>} Found item document or null
   */
  async findItemDocumentById(itemId) {
    const selectedPacks = await EquipmentParser.getSelectedPacks();
    for (const packId of selectedPacks) {
      const pack = game.packs.get(packId);
      if (pack?.documentName === 'Item') {
        const item = await pack.getDocument(itemId);
        if (item) return item;
      }
    }
    return null;
  }

  /**
   * Extracts granted proficiencies from advancement data
   * @async
   * @param {Array<object>} advancements - Array of advancement configurations
   * @returns {Promise<Set<string>>} Set of granted proficiency strings
   */
  async extractProficienciesFromAdvancements(advancements) {
    const proficiencies = new Set();

    for (const advancement of advancements) {
      if (advancement.configuration && advancement.configuration.grants) {
        for (const grant of advancement.configuration.grants) {
          proficiencies.add(grant);
        }
      }
    }
    HM.log(3, 'Collected proficiencies:', Array.from(proficiencies));
    return proficiencies;
  }

  /**
   * Fetches starting equipment and proficiencies for a given selection type
   * @async
   * @param {'class'|'background'} type - Selection type to fetch equipment for
   * @returns {Promise<Array<object>>} Starting equipment array
   * @throws {Error} If compendium lookup fails
   */
  async getStartingEquipment(type) {
    const storedData = HM.SELECTED[type] || {};
    const id = storedData.id;
    const uuid = storedData.uuid;

    if (!id) {
      return [];
    }

    let doc = null;

    try {
      // Try to get by UUID first
      if (uuid) {
        HM.log(3, `Attempting to get document for ${type} by UUID: ${uuid}`);
        doc = await fromUuidSync(uuid);
      }

      // If UUID fails, try by ID
      if (!doc) {
        HM.log(2, `Attempting to get document for ${type} by ID: ${id}`);
        doc = await this.findItemDocumentById(id);
      }
    } catch (error) {
      HM.log(1, `Error retrieving document for ${type}:`, error);
    }

    if (doc) {
      this.proficiencies = await this.extractProficienciesFromAdvancements(doc.system.advancement || []);

      if (doc.system.startingEquipment) {
        return doc.system.startingEquipment;
      } else {
        HM.log(2, `Document found but has no startingEquipment property: ${doc.name}`, { doc: doc });
        return [];
      }
    } else {
      HM.log(2, `No document found for type ${type} with id ${id}`);
      return [];
    }
  }

  /**
   * Renders starting wealth options for class or background
   * @async
   * @throws {Error} If wealth option rendering fails
   */
  async renderWealthOption(sectionContainer, type = 'class') {
    try {
      const itemUUID = HM.SELECTED[type].uuid;
      if (!itemUUID) return;

      const item = await fromUuidSync(itemUUID);
      if (!item) return;

      const rulesVersion = item?.system?.source?.rules;
      const isModernRules = rulesVersion === '2024';
      const wealthValue = item.system.wealth;

      if (!wealthValue) return;

      const wealthContainer = document.createElement('div');
      wealthContainer.classList.add('wealth-option-container');

      const wealthCheckbox = document.createElement('input');
      wealthCheckbox.type = 'checkbox';
      wealthCheckbox.id = `use-starting-wealth-${type}`;
      wealthCheckbox.name = `use-starting-wealth-${type}`;

      const wealthLabel = document.createElement('label');
      wealthLabel.htmlFor = `use-starting-wealth-${type}`;
      wealthLabel.innerHTML = game.i18n.localize('hm.app.equipment.use-starting-wealth');

      const wealthRollContainer = document.createElement('div');
      wealthRollContainer.classList.add('wealth-roll-container');
      wealthRollContainer.style.display = 'none';

      const wealthInput = document.createElement('input');
      wealthInput.type = 'text';
      wealthInput.id = `starting-wealth-amount-${type}`;
      wealthInput.name = `starting-wealth-amount-${type}`;
      wealthInput.placeholder = game.i18n.localize('hm.app.equipment.wealth-placeholder');

      if (isModernRules) {
        // For 2024 rules, we show flat value without roll button
        wealthInput.value = `${wealthValue} ${CONFIG.DND5E.currencies.gp.abbreviation}`;
        wealthInput.readOnly = true;
      } else {
        // Legacy rules with dice roll
        wealthInput.readOnly = true;

        const rollButton = document.createElement('button');
        rollButton.type = 'button';
        rollButton.innerHTML = game.i18n.localize('hm.app.equipment.roll-wealth');
        rollButton.classList.add('wealth-roll-button');

        rollButton.addEventListener('click', async () => {
          const formula = wealthValue;
          const roll = new Roll(formula);
          await roll.evaluate();
          wealthInput.value = `${roll.total} ${CONFIG.DND5E.currencies.gp.abbreviation}`;
          wealthInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        wealthRollContainer.appendChild(rollButton);
      }

      wealthCheckbox.addEventListener('change', (event) => {
        const equipmentElements = sectionContainer.querySelectorAll('.equipment-item');
        equipmentElements.forEach((el) => {
          if (event.target.checked) {
            el.classList.add('disabled');
            el.querySelectorAll('select, input[type="checkbox"]:not(.equipment-favorite-checkbox), label').forEach((input) => {
              input.disabled = true;
            });
            // Also disable favorite checkboxes
            el.querySelectorAll('.equipment-favorite-checkbox').forEach((fav) => {
              fav.disabled = true;
            });
          } else {
            el.classList.remove('disabled');
            el.querySelectorAll('select, input[type="checkbox"], label').forEach((input) => {
              input.disabled = false;
            });
          }
        });
        wealthRollContainer.style.display = event.target.checked ? 'flex' : 'none';
        if (!event.target.checked) {
          wealthInput.value = isModernRules ? `${wealthValue} ${CONFIG.DND5E.currencies.gp.abbreviation}` : '';
        }
      });

      wealthContainer.appendChild(wealthCheckbox);
      wealthContainer.appendChild(wealthLabel);
      wealthRollContainer.appendChild(wealthInput);
      wealthContainer.appendChild(wealthRollContainer);

      sectionContainer.appendChild(wealthContainer);

      HM.log(3, `Rendered wealth options for ${type}`);
    } catch (error) {
      HM.log(1, `Error rendering wealth option: ${error}`);
    }
  }

  /**
   * Renders equipment selection UI for specified or all types
   * @async
   * @param {?string} type - Optional type to render ('class'|'background'). If null, renders all
   * @returns {Promise<HTMLElement>} Container element with rendered equipment choices
   * @throws {Error} If rendering fails
   */
  async generateEquipmentSelectionUI(type = null) {
    if (!type || !this._renderInProgress) {
      this._renderInProgress = true;
      EquipmentParser.renderedItems = new Set();
      EquipmentParser.combinedItemIds = new Set();
    }

    try {
      this.equipmentData = null;

      await EquipmentParser.initializeLookupItems();
      if (!EquipmentParser.lookupItems) {
        HM.log(1, 'Failed to initialize lookup items');
      }

      await this.fetchEquipmentData();
      if (!this.equipmentData) {
        HM.log(1, 'Failed to fetch equipment data');
      }

      let container = document.querySelector('.equipment-choices');
      if (!container) {
        container = document.createElement('div');
        container.classList.add('equipment-choices');
      }

      const typesToRender = type ? [type] : Object.keys(this.equipmentData);

      try {
        for (const currentType of typesToRender) {
          const items = this.equipmentData[currentType] || [];

          // Get stored data for current type
          const storedData = HM.SELECTED[currentType] || {};
          const id = storedData.id || '';
          const uuid = storedData.uuid || '';

          // Get document for potential equipment description extraction
          let documentWithEquipment = null;

          if (currentType === 'class' && id) {
            documentWithEquipment = await fromUuidSync(uuid);
            HM.log(3, `Retrieved class document: ${documentWithEquipment?.name || 'unknown'}`, { doc: documentWithEquipment });
          } else if (currentType === 'background' && id) {
            documentWithEquipment = await fromUuidSync(uuid);
            HM.log(3, `Retrieved background document: ${documentWithEquipment?.name || 'unknown'}`, { doc: documentWithEquipment });
          }

          // Create section container
          let sectionContainer = container.querySelector(`.${currentType}-equipment-section`);
          if (sectionContainer) {
            HM.log(3, `${currentType}-equipment-section already exists. Clearing and reusing.`);
            sectionContainer.innerHTML = '';
          } else {
            sectionContainer = document.createElement('div');
            sectionContainer.classList.add(`${currentType}-equipment-section`);
            container.appendChild(sectionContainer);
          }

          // Get the localized placeholder text for the current type
          const placeholderText = game.i18n.localize(`hm.app.${currentType}.select-placeholder`);
          const dropdown = document.querySelector(`#${currentType}-dropdown`);
          const dropdownText = dropdown?.selectedOptions?.[0]?.innerHTML || currentType;
          const isPlaceholder = dropdown && dropdownText === placeholderText;

          // Add a header for the section
          const header = document.createElement('h3');
          header.innerHTML =
            isPlaceholder ?
              game.i18n.format('hm.app.equipment.type-equipment', { type: currentType.charAt(0).toUpperCase() + currentType.slice(1) })
            : game.i18n.format('hm.app.equipment.type-equipment', { type: dropdownText });
          sectionContainer.appendChild(header);

          if (currentType === 'class' && id) {
            await this.renderWealthOption(sectionContainer, 'class').catch((error) => {
              HM.log(1, `Error rendering class wealth option: ${error.message}`);
            });
          } else if (currentType === 'background' && id) {
            await this.renderWealthOption(sectionContainer, 'background').catch((error) => {
              HM.log(1, `Error rendering background wealth option: ${error.message}`);
            });
          }

          // Check if items array is empty
          if (!items.length) {
            const emptyNotice = document.createElement('div');
            emptyNotice.classList.add('equipment-empty-notice');

            // Localized message for currentType
            const message = game.i18n.format('hm.errors.missing-equipment', { type: currentType });

            // Create the notice with warning icon
            emptyNotice.innerHTML = `<div class="equipment-missing-warning"><i class="fa-solid fa-triangle-exclamation warning-icon"></i><p>${message}</p></div>`;

            // Try to extract equipment description from document if available
            if (documentWithEquipment) {
              HM.log(3, `Attempting to extract equipment info from ${currentType} document:`, documentWithEquipment.name);

              // Log the structure to help debugging
              HM.log(3, 'Document structure:', {
                id: documentWithEquipment.id,
                name: documentWithEquipment.name,
                hasDescription: !!documentWithEquipment.system?.description?.value,
                descriptionLength: documentWithEquipment.system?.description?.value?.length || 0
              });

              const equipmentDescription = this.extractEquipmentDescription(documentWithEquipment);
              const divider = document.createElement('hr');
              const extractedInfo = document.createElement('div');
              extractedInfo.classList.add('extracted-equipment-info');
              emptyNotice.appendChild(divider);

              if (equipmentDescription) {
                HM.log(3, `Successfully extracted equipment description for ${currentType}`);
                extractedInfo.innerHTML = `<h4>${game.i18n.localize('hm.equipment.extracted-info')}</h4>${equipmentDescription}`;
                emptyNotice.appendChild(extractedInfo);
              } else {
                extractedInfo.innerHTML = `<h4>${game.i18n.localize('hm.equipment.extracted-info')}</h4>${game.i18n.localize('hm.equipment.no-equipment-notice')}`;
                emptyNotice.appendChild(extractedInfo);
                HM.log(2, `No equipment description could be extracted from ${currentType} document`);

                // Check if the document likely has equipment info but couldn't be extracted
                const description = documentWithEquipment.system?.description?.value || '';
                if (description.toLowerCase().includes(game.i18n.localize('TYPES.Item.equipment').toLowerCase())) {
                  const noExtractionNote = document.createElement('p');
                  noExtractionNote.classList.add('equipment-extraction-failed');
                  noExtractionNote.innerHTML = `${game.i18n.localize('hm.warnings.equipment-extraction-failed')}`;
                  emptyNotice.appendChild(noExtractionNote);
                }
              }
            }

            sectionContainer.appendChild(emptyNotice);
            continue;
          }

          // Pre-fetch all item documents in parallel
          const itemDocs = await Promise.all(
            items.map(async (item) => {
              if (!item.key) return { item, doc: null };
              try {
                const doc = await fromUuidSync(item.key);
                return { item, doc };
              } catch (error) {
                HM.log(1, `Error pre-fetching item document for ${item.key}:`, error);
                return { item, doc: null };
              }
            })
          );

          // Process all items with their pre-fetched documents
          const processedItems = new Set();
          const failedItems = [];

          for (const { item, doc } of itemDocs) {
            if (!item || processedItems.has(item._id || item.key)) {
              continue;
            }

            processedItems.add(item._id || item.key);

            // Update item with document info
            if (doc) {
              item.name = doc.name;
            } else if (item.key) {
              item.name = item.key;
            }

            try {
              const itemElement = await this.#buildEquipmentUIElement(item);
              if (itemElement) {
                sectionContainer.appendChild(itemElement);
              }
            } catch (error) {
              HM.log(1, `Failed to create equipment element for ${item.name || item.key}:`, error);
              failedItems.push(item.name || item.key || game.i18n.localize('hm.app.equipment.unnamed'));
            }
          }

          if (failedItems.length > 0) {
            const errorMessage = document.createElement('div');
            errorMessage.classList.add('equipment-error');
            errorMessage.textContent = game.i18n.format('hm.app.equipment.failed-to-load', { count: failedItems.length });
            sectionContainer.appendChild(errorMessage);
          }
        }
      } catch (error) {
        HM.log(1, 'Error processing equipment sections:', error);

        // Create a fallback message
        const errorMessage = document.createElement('div');
        errorMessage.classList.add('error-message');
        errorMessage.textContent = game.i18n.localize('hm.errors.equipment-rendering');
        container.appendChild(errorMessage);
      }

      return container;
    } catch (error) {
      HM.log(1, 'Failed to render equipment choices:', error);

      // Return a minimal fallback container
      const fallbackContainer = document.createElement('div');
      fallbackContainer.classList.add('equipment-choices', 'error-state');

      const errorMessage = document.createElement('div');
      errorMessage.classList.add('error-message');
      errorMessage.innerHTML = `<p>${game.i18n.localize('hm.errors.equipment-rendering')}</p>`;
      fallbackContainer.appendChild(errorMessage);

      return fallbackContainer;
    } finally {
      if (!type) {
        this._renderInProgress = false;
      }
    }
  }

  /**
   * Extract equipment description from document HTML
   * @param {Document} document - The document to extract equipment info from
   * @returns {string|null} - HTML string with equipment description or null if not found
   */
  extractEquipmentDescription(document) {
    HM.log(3, 'Attempting to extract equipment description from document:', document?.name, document);

    if (!document) {
      HM.log(2, 'No document provided to extract equipment from');
      return null;
    }

    // Get the document's description
    const description = document.system?.description?.value;
    if (!description) {
      HM.log(2, 'Document has no description (system.description.value is empty)');
      return null;
    }

    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = description;

    // Helper function to check if an element is about equipment
    const isEquipmentHeading = (element) => {
      const text = element.textContent.toLowerCase();
      const isEquipment =
        text.includes(game.i18n.localize('TYPES.Item.equipment').toLowerCase()) || text.toLowerCase().includes(game.i18n.localize('hm.app.equipment.starting-equipment').toLowerCase());

      if (!isEquipment) {
        HM.log(3, `Skipping non-equipment heading: "${element.textContent}"`);
      }

      return isEquipment;
    };

    // Custom function to find elements with specific text
    const findElementsWithText = (parent, selector, text) => {
      const elements = parent.querySelectorAll(selector);
      return Array.from(elements).filter((el) => el.textContent.toLowerCase().includes(text.toLowerCase()));
    };

    // Case 1: Check for "Starting Equipment" pattern (like Artificer)
    const startingEquipmentElements = findElementsWithText(tempDiv, 'b, strong', 'Starting Equipment');

    if (startingEquipmentElements.length > 0) {
      HM.log(3, 'Found Starting Equipment heading');

      const element = startingEquipmentElements[0];
      let container = element.closest('p') || element.parentElement;

      if (container) {
        let combinedContent = container.outerHTML;
        let currentElement = container.nextElementSibling;
        let elementsToInclude = 0;

        // Include up to 3 following elements that could be part of the equipment description
        while (currentElement && elementsToInclude < 3) {
          if (currentElement.tagName === 'UL' || currentElement.tagName === 'OL') {
            combinedContent += currentElement.outerHTML;
            elementsToInclude++;
          } else if (currentElement.tagName === 'P') {
            const text = currentElement.textContent.toLowerCase();
            if (
              text.includes(game.i18n.localize('TYPES.Item.equipment').toLowerCase()) ||
              text.includes(game.i18n.localize('DND5E.Background').toLowerCase()) ||
              text.includes(game.i18n.localize('hm.app.equipment.gptobuy').toLowerCase()) ||
              text.includes(game.i18n.localize('DND5E.CurrencyGP').toLowerCase()) ||
              text.includes(game.i18n.localize('hm.app.equipment.starting').toLowerCase())
            ) {
              combinedContent += currentElement.outerHTML;
              elementsToInclude++;
            } else {
              break;
            }
          } else if (currentElement.tagName.match(/^H[1-6]$/)) {
            break;
          }
          currentElement = currentElement.nextElementSibling;
        }

        HM.log(3, `Extracted complete equipment section: ${combinedContent.substring(0, 100)}...`);
        return combinedContent;
      }
    }

    // Case 2: Look for the specific PHB-style background format with Equipment: label
    const equipmentLabels = findElementsWithText(tempDiv, '.Serif-Character-Style_Bold-Serif, .Bold-Serif, strong, b, span[class*="bold"], span[style*="font-weight"]', 'Equipment:');

    if (equipmentLabels.length > 0) {
      const equipmentLabel = equipmentLabels[0];
      const parentParagraph = equipmentLabel.closest('p');

      if (parentParagraph) {
        const paragraphHTML = parentParagraph.outerHTML;
        HM.log(3, `Extracted equipment paragraph: ${paragraphHTML.substring(0, 100)}...`);
        return paragraphHTML;
      }
    }

    // Case 3: Look for definition list (dt/dd) format
    const definitionTerms = tempDiv.querySelectorAll('dt');
    for (const dt of definitionTerms) {
      if (dt.textContent.toLowerCase().includes(`${game.i18n.localize('TYPES.Item.equipment').toLowerCase()}:`)) {
        HM.log(3, 'Found equipment in definition list');
        return dt.outerHTML;
      }
    }

    // Case 4: Look for equipment headings (h1-h6)
    const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const heading of headings) {
      if (isEquipmentHeading(heading)) {
        HM.log(3, `Found equipment heading: ${heading.outerHTML}`);

        let content = heading.outerHTML;
        let currentElement = heading.nextElementSibling;

        // Include relevant content after the heading
        while (currentElement && !currentElement.tagName.match(/^H[1-6]$/) && content.length < 1000) {
          if (['P', 'UL', 'OL'].includes(currentElement.tagName)) {
            content += currentElement.outerHTML;
          } else {
            break;
          }

          currentElement = currentElement.nextElementSibling;
        }

        HM.log(3, `Extracted equipment section from heading: ${content.substring(0, 100)}...`);
        return content;
      }
    }

    // Case 5: Generic search for paragraphs that contain equipment
    const paragraphs = tempDiv.querySelectorAll('p');
    for (const para of paragraphs) {
      if (isEquipmentHeading(para)) {
        HM.log(3, `Found paragraph with equipment: ${para.textContent.substring(0, 40)}...`);

        let content = para.outerHTML;
        let nextElement = para.nextElementSibling;

        // Check if there's a list right after this paragraph
        if (nextElement && (nextElement.tagName === 'UL' || nextElement.tagName === 'OL')) {
          content += nextElement.outerHTML;

          // Also include a follow-up paragraph if it appears to be related
          let afterList = nextElement.nextElementSibling;
          if (
            afterList &&
            afterList.tagName === 'P' &&
            (afterList.textContent.toLowerCase().includes(game.i18n.localize('TYPES.Item.equipment').toLowerCase()) ||
              afterList.textContent.toLowerCase().includes(game.i18n.localize('DND5E.CurrencyGP').toLowerCase()) ||
              afterList.textContent.toLowerCase().includes(game.i18n.localize('DND5E.CurrencyAbbrGP').toLowerCase()))
          ) {
            content += afterList.outerHTML;
          }
        }

        HM.log(3, `Extracted equipment paragraph and related content: ${content.substring(0, 100)}...`);
        return content;
      }
    }

    // Final fallback - check for plain text mentions of equipment
    const equipmentRegex = /equipment:([^<]+)(?:<\/|<br|$)/i;
    const match = description.match(equipmentRegex);

    if (match) {
      const equipmentText = match[1].trim();
      HM.log(3, `Found equipment via regex: "${equipmentText.substring(0, 40)}..."`);
      return `<p><strong>${game.i18n.localize('TYPES.Item.equipment')}:</strong> ${equipmentText}</p>`;
    }

    HM.log(1, 'Failed to extract equipment description using any method');
    return null;
  }

  /* -------------------------------------------- */
  /*  Private Methods                             */
  /* -------------------------------------------- */

  /**
   * Creates and returns a DOM element for an equipment item
   * @async
   * @param {object} item - Equipment item data
   * @returns {Promise<HTMLElement|null>} Equipment element or null if skipped/invalid
   * @private
   */
  async #buildEquipmentUIElement(item) {
    if (!item) {
      HM.log(2, 'Null or undefined item passed to #buildEquipmentUIElement');
      return null;
    }

    if (this.#hasItemBeenRendered(item)) {
      return null;
    }

    try {
      HM.log(3, 'Creating equipment element:', {
        type: item.type,
        key: item.key,
        _source: item._source,
        children: item.children
      });

      const itemContainer = document.createElement('div');
      itemContainer.classList.add('equipment-item');

      const fragment = document.createDocumentFragment();

      if (!item.group) {
        const labelElement = document.createElement('h4');
        labelElement.classList.add('parent-label');

        let shouldAddLabel = false;

        if (item.key) {
          try {
            let itemDoc = await fromUuidSync(item.key);

            // If fromUuidSync fails to return a document, try regular fromUuid
            if (!itemDoc) {
              try {
                itemDoc = await fromUuid(item.key);
              } catch (err) {
                HM.log(1, `Error getting document for item ${item._source?.key}: ${err.message}`);
              }
            }

            if (itemDoc) {
              labelElement.innerHTML = `${item.label || `${item.count || ''} ${itemDoc.name}`}`;
              shouldAddLabel = true;
            } else {
              HM.log(1, `No document found for item key: ${item.key}`, { item, labelElement });
              labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
              shouldAddLabel = true;
            }
          } catch (error) {
            HM.log(1, `Error getting label for item ${item._source?.key}: ${error.message}`, { item, labelElement });
            labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
            shouldAddLabel = true;
          }
        }

        if (shouldAddLabel) {
          fragment.appendChild(labelElement);
        }
      }

      // Add the fragment to the container at the end
      itemContainer.appendChild(fragment);

      // First check if this is part of an OR choice
      if (item.group) {
        const parentItem = this.equipmentData.class.find((p) => p._id === item.group) || this.equipmentData.background.find((p) => p._id === item.group);
        if (parentItem?.type === 'OR') {
          return null;
        }
      }

      let result;

      try {
        switch (item.type) {
          case 'OR':
            result = await this.#renderOrBlock(item, itemContainer);
            break;
          case 'AND':
            if (!item.group || this.#isStandaloneAndBlock(item)) {
              result = await this.#renderAndBlock(item, itemContainer);
            }
            break;
          case 'linked':
            result = await this.#renderLinkedItem(item, itemContainer);
            break;
          case 'focus':
            result = await this.#renderFocusItem(item, itemContainer);
            break;
          case 'tool':
            result = await this.#renderToolItem(item, itemContainer);
            break;
          case 'weapon':
          case 'armor':
            break;
          default:
            return null;
        }
      } catch (error) {
        HM.log(1, `Error rendering item ${item.type}:`, error);

        // Create a simple fallback element
        const errorElement = document.createElement('div');
        errorElement.classList.add('equipment-item-error');
        errorElement.textContent = game.i18n.localize('hm.app.equipment.unknown-choice');
        itemContainer.appendChild(errorElement);

        result = itemContainer;
      }

      if (!result || result.innerHTML === '') {
        return;
      }
      EquipmentParser.renderedItems.add(item._id);
      return result;
    } catch (error) {
      HM.log(1, 'Critical error creating equipment element:', error);
      return null;
    }
  }

  /**
   * Gets linked item ID from equipment item
   * @param {object} item - Equipment item
   * @returns {string|null} Linked item ID
   * @private
   */
  #extractLinkedItemId(item) {
    const linkedItem = item.children.find((child) => child.type === 'linked');
    return linkedItem ? linkedItem._source.key : null;
  }

  /**
   * Finds weapon type child in equipment item
   * @param {object} item - Parent item
   * @returns {object|null} Weapon type child or null
   * @private
   */
  #findWeaponTypeChild(item) {
    return item.children.find((child) => child.type === 'weapon' && ['simpleM', 'simpleR', 'martialM', 'martialR', 'sim', 'mar'].includes(child.key));
  }

  /**
   * Gets the label for a lookup key using CONFIG.DND5E values
   * @param {string} key - The lookup key
   * @returns {string} The label for the key
   */
  #getLookupKeyLabel(key) {
    return EquipmentParser.lookupItems[key]?.label;
  }

  /**
   * Checks if an item has already been rendered
   * @param {object} item - Item to check
   * @returns {boolean} True if item ID exists in renderedItems
   * @private
   */
  #hasItemBeenRendered(item) {
    return EquipmentParser.renderedItems.has(item._id);
  }

  /**
   * Checks if item has multiple quantity choices
   * @param {object} item - Equipment item
   * @returns {boolean} True if multiple quantities
   * @private
   */
  #isMultiQuantityChoice(item) {
    let quantityChoices = 0;

    if (!item?.children?.length) {
      HM.log(1, 'Invalid item passed to #isMultiQuantityChoice', { item: item });
      return false;
    }

    for (const child of item.children) {
      if (child.count && child.count > 1) {
        quantityChoices++;
      }
    }
    return quantityChoices > 1;
  }

  /**
   * Checks if an AND block item is standalone (not part of an OR choice)
   * @param {object} item - Equipment item to check
   * @returns {boolean} True if standalone
   * @private
   */
  #isStandaloneAndBlock(item) {
    return !this.equipmentData.class.some((p) => p._id === item.group && p.type === 'OR') && !this.equipmentData.background.some((p) => p._id === item.group && p.type === 'OR');
  }

  /**
   * Checks if item represents a weapon/shield choice combination
   * @param {object} item - Equipment item to check
   * @returns {boolean} True if valid weapon/shield combination
   * @private
   */
  #isWeaponShieldChoice(item) {
    const andGroup = item.children.find((child) => child.type === 'AND');
    if (!andGroup) return false;

    const hasWeapon = andGroup.children?.some((child) => child.type === 'weapon' && ['martialM', 'mar', 'simpleM', 'sim'].includes(child.key));
    const hasShield = andGroup.children?.some((child) => child.type === 'armor' && child._source?.key?.includes('shield'));

    return hasWeapon && hasShield;
  }

  /**
   * Renders an AND block of equipment items
   * @async
   * @param {object} item - AND block item
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<HTMLElement>} Modified container
   * @private
   */
  async #renderAndBlock(item, itemContainer) {
    HM.log(3, `Processing AND block: ${item._id}`, { item, itemContainer });

    const processedIds = new Set();
    if (item.group) {
      const andLabelElement = document.createElement('h4');
      andLabelElement.classList.add('parent-label');
      andLabelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-all')}`;
      itemContainer.appendChild(andLabelElement);
    }

    const hasWeaponAmmoContainer = async (items) => {
      const itemDocs = await Promise.all(
        items.map(async (item) => {
          const doc = await fromUuidSync(item._source?.key);
          return doc;
        })
      );

      const hasWeapon = itemDocs.some((doc) => doc?.type === 'weapon' && doc?.system?.properties && Array.from(doc.system.properties).includes('amm'));
      const hasAmmo = itemDocs.some((doc) => doc?.system?.type?.value === 'ammo');
      const hasContainer = itemDocs.some((doc) => {
        // Check if it's a container type
        if (doc?.type !== 'container') return false;

        // Filter out packs by identifier
        const identifier = doc?.system?.identifier?.toLowerCase();
        return !identifier || !identifier.includes('pack');
      });

      const shouldGroup = hasWeapon || hasAmmo || hasContainer;
      return shouldGroup;
    };

    const lookupItems = item.children.filter((child) => child.type === 'weapon' && ['sim', 'mar', 'simpleM', 'simpleR', 'martialM', 'martialR'].includes(child.key));

    const linkedItems = await Promise.all(
      item.children
        .filter((child) => child.type === 'linked')
        .map(async (child) => {
          const shouldGroup = await hasWeaponAmmoContainer([child]);
          return shouldGroup ? child : null;
        })
    );

    const filteredLinkedItems = linkedItems.filter((item) => item !== null);
    const groupedItems = [];
    const processedItems = new Set();

    if (!item?.children?.length) {
      this.#addFavoriteStar(itemContainer, item);
      return itemContainer;
    }

    for (const child of filteredLinkedItems) {
      if (processedItems.has(child._source?.key)) continue;

      const relatedItems = await Promise.all(
        filteredLinkedItems.map(async (item) => {
          if (processedItems.has(item._source?.key) || item._source?.key === child._source?.key) return null;
          const result = await hasWeaponAmmoContainer([child, item]);
          return result ? item : null;
        })
      );

      const validRelatedItems = relatedItems.filter((item) => item !== null);

      if (validRelatedItems.length > 0) {
        groupedItems.push([child, ...validRelatedItems]);
        validRelatedItems.forEach((item) => processedItems.add(item._source?.key));
        processedItems.add(child._source?.key);
      } else if (!processedItems.has(child._source?.key)) {
        groupedItems.push([child]);
        processedItems.add(child._source?.key);
      }
    }

    for (const group of groupedItems) {
      let combinedLabel = '';
      const combinedIds = [];

      for (const child of group) {
        if (processedIds.has(child._source?.key)) continue;
        processedIds.add(child._source?.key);

        const linkedItem = await fromUuidSync(child._source?.key);

        if (!linkedItem) continue;

        const count = child._source?.count > 1 || child._source?.count !== null ? child._source?.count : '';
        combinedIds.push(child._source?.key);

        if (combinedLabel) combinedLabel += ', ';
        combinedLabel += `${count ? `${count} ` : ''}${linkedItem.name}`.trim();

        // Add to tracking sets immediately
        EquipmentParser.renderedItems.add(child._id);
        EquipmentParser.combinedItemIds.add(child._source?.key);

        child.specialGrouping = true;
        child.rendered = true;
      }

      if (combinedLabel && group.length > 1) {
        const h4 = document.createElement('h4');
        h4.innerHTML = `${combinedLabel}`;
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = combinedIds.join(',');
        checkbox.checked = true;
        label.innerHTML = `${combinedLabel}`;
        label.prepend(checkbox);
        itemContainer.appendChild(h4);
        itemContainer.appendChild(label);
      } else {
        for (const child of group) {
          child.rendered = false;
          child.specialGrouping = false;
          EquipmentParser.renderedItems.delete(child._id);
          EquipmentParser.combinedItemIds.delete(child._source?.key);
        }
      }
    }

    for (const lookupItem of lookupItems) {
      const lookupLabel = this.#getLookupKeyLabel(lookupItem.key);
      const header = document.createElement('h4');
      header.innerHTML = lookupLabel;
      itemContainer.appendChild(header);

      const select = document.createElement('select');
      select.id = lookupItem._source.key;

      const lookupKey =
        lookupItem.key === 'sim' ? 'sim'
        : lookupItem.key === 'simpleM' ? 'simpleM'
        : lookupItem.key === 'simpleR' ? 'simpleR'
        : lookupItem.key;

      const lookupOptions = Array.from(EquipmentParser.lookupItems[lookupKey].items || []);
      lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

      lookupOptions.forEach((weapon) => {
        const option = document.createElement('option');
        option.value = weapon?._source?.key;
        option.innerHTML = weapon.name;
        select.appendChild(option);
      });

      itemContainer.appendChild(select);
    }
    this.#addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Renders AND group equipment selection
   * @async
   * @param {object} child - AND group item
   * @param {HTMLSelectElement} select - Select element
   * @param {Set} renderedItemNames - Tracking set
   * @private
   */
  async #renderAndGroup(child, select, renderedItemNames) {
    HM.log(3, 'Processing AND group', { child, select, renderedItemNames });
    let combinedLabel = '';
    const combinedIds = [];
    const lookupKeys = ['sim', 'mar', 'simpleM', 'simpleR', 'martialM', 'martialR', 'shield'];
    const processedIds = new Set();

    // Mark all children as rendered if this is part of an OR choice
    const isPartOfOrChoice =
      (child.group && this.equipmentData.class.some((p) => p._id === child.group && p.type === 'OR')) || this.equipmentData.background.some((p) => p._id === child.group && p.type === 'OR');

    if (!child?.children?.length) {
      return;
    }

    for (const subChild of child.children) {
      try {
        if (processedIds.has(subChild._id)) continue;
        processedIds.add(subChild._id);
        if (lookupKeys.includes(subChild.key)) {
          if (combinedLabel) combinedLabel += ', ';
          const lookupLabel = this.#getLookupKeyLabel(subChild.key);
          combinedLabel +=
            `${subChild.count > 1 || subChild.count !== null ? subChild.count : ''} <a class="content-link" draggable="true" data-uuid="${subChild.key}" data-source="andGroup">${subChildItem.name}</a>`.trim();
          combinedIds.push(subChild._id);

          if (isPartOfOrChoice) {
            subChild.rendered = true;
            subChild.isSpecialCase = true;
          }
          continue;
        }

        // Handle normal linked items
        const subChildItem = await fromUuidSync(subChild.key);
        if (!subChildItem) throw new Error(`Item not found for UUID: ${subChild.key}`);

        if (combinedLabel) combinedLabel += ', ';
        combinedLabel += `${subChild.count > 1 || subChild.count !== null ? subChild.count : ''} <a class="content-link" draggable="true" data-uuid="${subChild.key}">${subChildItem.name}</a>`.trim();
        combinedIds.push(subChild._id);

        if (isPartOfOrChoice) {
          subChild.rendered = true;
          subChild.isSpecialCase = true;
        }
        EquipmentParser.combinedItemIds.add(subChild._id);
      } catch (error) {
        HM.log(1, `Error processing sub-child in AND group for child ${child._id}: ${error.message}`);
        continue;
      }
    }

    if (combinedLabel && !renderedItemNames.has(combinedLabel)) {
      renderedItemNames.add(combinedLabel);
      const optionElement = document.createElement('option');
      optionElement.value = combinedIds.join(',');
      optionElement.innerHTML = combinedLabel;
      select.appendChild(optionElement);

      // Mark all items in the combination as rendered
      combinedIds.forEach((id) => {
        EquipmentParser.renderedItems.add(id);
        EquipmentParser.combinedItemIds.add(id);
      });

      if (isPartOfOrChoice) {
        child.rendered = true;
        child.isSpecialCase = true;
      }
    }
  }

  /**
   * Renders arcane/divine focus equipment selection
   * @param {object} item - Focus item data
   * @param {HTMLElement} itemContainer - Container element
   * @returns {HTMLElement|null} Modified container or null if invalid
   * @private
   */
  async #renderFocusItem(item, itemContainer) {
    HM.log(3, `Processing Focus Item: ${item._id}`, { item, itemContainer });

    if (!item?.key) {
      HM.log(1, 'Invalid focus item:', item);
      return null;
    }

    if (this.#shouldItemUseDropdownDisplay(item)) return null;

    const focusType = item.key;
    const focusConfig = CONFIG.DND5E.focusTypes[focusType];

    if (!focusConfig) {
      HM.log(2, `No focus configuration found for type: ${focusType}`);
      return null;
    }

    const select = document.createElement('select');
    select.id = `${item.key}-focus`;

    const itemPacks = game.settings.get(HM.ID, 'itemPacks');

    for (const [focusName, itemId] of Object.entries(focusConfig.itemIds)) {
      let uuid = itemId.uuid || EquipmentParser.itemUuidMap.get(itemId);

      if (!uuid) {
        for (const packId of itemPacks) {
          const pack = game.packs.get(packId);
          if (!pack) continue;

          const index = await pack.getIndex();
          const matchingItem = index.find((i) => i.name.toLowerCase() === focusName.toLowerCase());

          if (matchingItem) {
            uuid = matchingItem.uuid;
            HM.log(3, `Found matching item by name: ${matchingItem.name}`);
            break;
          }
        }

        if (!uuid) {
          HM.log(2, `No matching item found for focus: ${focusName}`);
          continue;
        }
      }

      const option = document.createElement('option');
      option.value = uuid;
      option.innerHTML = focusName.charAt(0).toUpperCase() + focusName.slice(1);

      if (select.options.length === 0) {
        option.selected = true;
      }

      select.appendChild(option);
    }

    if (select.options.length === 0) {
      HM.log(1, `No valid focus items found for type: ${focusType}`);
      return null;
    }

    const label = document.createElement('h4');
    label.htmlFor = select.id;
    label.innerHTML = `${focusConfig.label}`;

    itemContainer.appendChild(label);
    itemContainer.appendChild(select);

    this.#addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Renders tool equipment selection
   * @param {object} item - Tool item data
   * @param {HTMLElement} itemContainer - Container element
   * @returns {HTMLElement|null} Modified container or null if invalid
   * @private
   */
  async #renderToolItem(item, itemContainer) {
    HM.log(3, `Processing Tool: ${item._id}`, { item, itemContainer });
    if (!item?.key) {
      HM.log(1, 'Invalid tool item:', item);
      return null;
    }

    if (this.#shouldItemUseDropdownDisplay(item)) return null;

    const toolType = item.key;
    const toolConfig = CONFIG.DND5E.toolTypes[toolType];

    if (!toolConfig) {
      HM.log(2, `No tool configuration found for type: ${toolType}`);
      return null;
    }

    const select = document.createElement('select');
    select.id = `${item.key}-tool`;

    // Get tools of this specific type
    const toolItems = Array.from(EquipmentParser.lookupItems[toolType].items || []);
    toolItems.sort((a, b) => a.name.localeCompare(b.name));

    for (const tool of toolItems) {
      const option = document.createElement('option');
      option.value = tool.uuid || tool._source?.key;
      option.innerHTML = tool.name;

      if (select.options.length === 0) {
        option.selected = true;
      }

      select.appendChild(option);
    }

    if (select.options.length === 0) {
      HM.log(2, `No valid tool items found for type: ${toolType}`);
      return null;
    }

    const label = document.createElement('h4');
    label.htmlFor = select.id;
    label.innerHTML = `${toolConfig}`;

    itemContainer.appendChild(label);
    itemContainer.appendChild(select);

    this.#addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Renders individual equipment item as dropdown option
   * @async
   * @param {object} child - Item to render
   * @param {HTMLSelectElement} select - Select element to add option to
   * @param {Set<string>} renderedItemNames - Set of already rendered names
   * @returns {Promise<void>}
   * @throws {Error} If item lookup fails
   * @private
   */
  async #renderIndividualItem(child, select, renderedItemNames) {
    HM.log(3, 'Processing Individual Item', { child, select, renderedItemNames });

    if (child.type === 'linked') {
      if (EquipmentParser.combinedItemIds.has(child._source.key)) return;
      const label = child.label.trim();
      const [, count, name] = label.match(/^(\d+)\s*(.+)$/) || [null, null, label];
      const displayName = name || label.replace(/\s*\(.*?\)\s*/g, '');
      const cleanDisplayName = displayName.replace(/\s*\(if proficient\)\s*/gi, '');

      if (renderedItemNames.has(displayName) || EquipmentParser.combinedItemIds.has(child._source.key)) return;
      renderedItemNames.add(displayName);

      const optionElement = document.createElement('option');
      optionElement.value = child._source.key;
      optionElement.innerHTML = `${count > 1 ? `${count} ${cleanDisplayName}` : cleanDisplayName}`;

      if (select.options.length === 0) {
        optionElement.selected = true;
        const defaultSelection = select.parentElement.querySelector(`#\\3${select.id}-default`);
        if (defaultSelection) {
          defaultSelection.value = child._source?.key || child._id;
        }
      }

      if (child.requiresProficiency) {
        const requiredProficiency = `${child.type}:${child.key}`;
        if (!this.proficiencies.has(requiredProficiency)) {
          optionElement.disabled = true;
          optionElement.innerHTML = `${optionElement.innerHTML} (${game.i18n.localize('hm.app.equipment.lacks-proficiency')})`;
        }
      }

      select.appendChild(optionElement);
    } else if (['weapon', 'armor', 'tool', 'shield'].includes(child.type)) {
      await this.#renderLookupOptions(child, select, renderedItemNames);
    }
  }

  /**
   * Renders a linked equipment item
   * @param {object} item - Linked item to render
   * @param {HTMLElement} itemContainer - Container element
   * @returns {HTMLElement|null} Modified container or null if skipped
   * @private
   */
  #renderLinkedItem(item, itemContainer) {
    HM.log(3, `Processing Linked item: ${item._id}`, { item, itemContainer });

    if (!item?._source?.key) {
      HM.log(1, 'Invalid linked item:', item);
      return null;
    }

    if (item.group) {
      const parentItem = this.equipmentData.class.find((p) => p._id === item.group) || this.equipmentData.background.find((p) => p._id === item.group);
      if (parentItem?.type === 'OR') {
        return null;
      }
    }
    // Don't mark as rendered until we confirm the item should be displayed
    if (EquipmentParser.combinedItemIds.has(item._source.key) || this.#shouldItemUseDropdownDisplay(item) || EquipmentParser.renderedItems.has(item._id)) {
      return null;
    }

    // Create elements
    const labelElement = document.createElement('label');
    const linkedCheckbox = document.createElement('input');
    linkedCheckbox.type = 'checkbox';
    linkedCheckbox.id = item._source.key;
    linkedCheckbox.value = item._source.key;
    linkedCheckbox.checked = true;

    // Process display label
    let displayLabel = item.label;
    let displayCount = '';

    if (item.label?.includes('<a class')) {
      const countMatch = item.label.match(/^(\d+)&times;/);
      if (countMatch) {
        displayCount = countMatch[1];
        displayLabel = item.label.replace(/^\d+&times;\s*/, '').replace('</i>', `</i>${displayCount} `);
      }
    } else {
      displayCount = item._source.count > 1 || item._source.count !== null ? item._source.count : '';
    }

    labelElement.innerHTML = `${displayLabel?.trim() || game.i18n.localize('hm.app.equipment.unknown-choice')}`;
    labelElement.prepend(linkedCheckbox);
    itemContainer.appendChild(labelElement);

    EquipmentParser.renderedItems.add(item._id);

    this.#addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Renders lookup options for weapons/armor/tools
   * @async
   * @param {object} child - Equipment child with lookup key
   * @param {HTMLSelectElement} select - Select element
   * @param {Set<string>} renderedItemNames - Tracking set
   * @returns {Promise<void>}
   * @private
   */
  async #renderLookupOptions(child, select, renderedItemNames) {
    HM.log(3, 'Processing Lookup Options', { child, select, renderedItemNames });

    try {
      const lookupOptions = Array.from(EquipmentParser.lookupItems[child.key].items || []);
      lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

      let defaultSelection = select.parentElement.querySelector(`#\\3${select.id}-default`);
      if (!defaultSelection) {
        defaultSelection = document.createElement('input');
        defaultSelection.type = 'hidden';
        defaultSelection.id = `${select.id}-default`;
        select.parentElement.appendChild(defaultSelection);
      }

      let shouldSelectFirst = select.options.length === 0;
      let isFirstEnabledOption = true;

      lookupOptions.forEach((option) => {
        if (renderedItemNames.has(option.name)) return;
        if (option.rendered && option.sort === child.sort && option.group === child.group) return;

        const uuid = option.uuid;
        if (!uuid) {
          HM.log(2, `No UUID found for item ${option.id}`, option);
          return;
        }

        option.rendered = true;
        option.group = child.group;
        option.sort = child.sort;
        option.key = child.key;

        renderedItemNames.add(option.name);

        const optionElement = document.createElement('option');
        optionElement.value = uuid;
        optionElement.innerHTML = option.name;
        let isEnabled = true;
        if (child.requiresProficiency) {
          const requiredProficiency = `${child.type}:${child.key}`;
          if (!this.proficiencies.has(requiredProficiency)) {
            optionElement.disabled = true;
            optionElement.innerHTML = `${option.name} (${game.i18n.localize('hm.app.equipment.lacks-proficiency')})`;
            isEnabled = false;
          }
        }

        // Only set as selected if this is the first enabled option AND we should select first
        if (shouldSelectFirst && isFirstEnabledOption && !optionElement.disabled && isEnabled) {
          optionElement.selected = true;
          defaultSelection.value = uuid;
          select.value = uuid;
          isFirstEnabledOption = false;
        }

        select.appendChild(optionElement);
      });
    } catch (error) {
      HM.log(1, `Error retrieving lookup options for ${child.key}: ${error.message}`);
    }
  }

  /**
   * Renders an OR-type equipment selection block
   * @async
   * @param {object} item - OR block item data
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<HTMLElement>} Modified container with selection elements
   * @private
   */
  async #renderOrBlock(item, itemContainer) {
    HM.log(3, `Processing OR block: ${item._id}`, { item, itemContainer });

    if (!item?.children?.length) {
      HM.log(1, 'Invalid OR block item:', item);
      return itemContainer;
    }

    if (!item._source) {
      HM.log(1, 'Missing _source property on OR block item:', item);
      return itemContainer;
    }

    const labelElement = document.createElement('h4');
    labelElement.classList.add('parent-label');

    // Determine if this is a weapon-or-lookup case
    const hasLinkedItem = item.children.some((child) => child.type === 'linked');
    const hasWeaponLookup = item.children.some((child) => child.type === 'weapon' && ['simpleM', 'simpleR', 'martialM', 'martialR', 'sim', 'mar'].includes(child.key));

    if (hasLinkedItem && hasWeaponLookup) {
      // Create a more descriptive label for this case
      const linkedItem = item.children.find((child) => child.type === 'linked');
      const weaponItem = item.children.find((child) => child.type === 'weapon' && ['simpleM', 'simpleR', 'martialM', 'martialR', 'sim', 'mar'].includes(child.key));

      if (linkedItem && weaponItem) {
        try {
          const itemDoc = await fromUuidSync(linkedItem._source?.key);
          if (itemDoc) {
            // Format: "Greataxe or any Martial Melee Weapon"
            const lookupLabel = this.#getLookupKeyLabel(weaponItem.key);
            labelElement.innerHTML = `${itemDoc.name} or any ${lookupLabel}`;
          } else {
            labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
          }
        } catch (error) {
          HM.log(2, `Error getting name for linked item in OR block: ${error.message}`);
          labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
        }
      } else {
        labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
      }
    } else {
      labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
    }

    itemContainer.appendChild(labelElement);

    const select = document.createElement('select');
    select.id = item._source?.key || item._id || `or-select-${Date.now()}`;

    const defaultSelection = document.createElement('input');
    defaultSelection.type = 'hidden';
    defaultSelection.id = `${select.id}-default`;
    itemContainer.appendChild(defaultSelection);

    // Create an event handler to track selections
    select.addEventListener('change', (event) => {
      defaultSelection.value = event.target.value;
    });

    itemContainer.appendChild(select);

    // Check for different types of specialized choices
    const isMultiQuantityChoice = this.#isMultiQuantityChoice(item);
    const weaponTypeChild = this.#findWeaponTypeChild(item);
    const hasFocusOption = item.children.some((child) => child.type === 'focus');
    const isWeaponShieldChoice = this.#isWeaponShieldChoice(item);
    const hasDualWeaponOption = item.children.some((child) => child.type === 'weapon' && child.count === 2);
    let secondSelect = null;

    // Handle weapon-shield choice pattern
    if (isWeaponShieldChoice && hasDualWeaponOption) {
      const dropdownContainer = document.createElement('div');
      dropdownContainer.classList.add('dual-weapon-selection');

      secondSelect = document.createElement('select');
      secondSelect.id = `${item._source?.key || item._id || Date.now()}-second`;
      dropdownContainer.appendChild(secondSelect);
      itemContainer.appendChild(dropdownContainer);

      // Find the weapon child to determine which lookup key to use
      const andGroup = item.children.find((child) => child.type === 'AND');
      const weaponChild = andGroup.children.find((child) => child.type === 'weapon' && ['martialM', 'mar', 'simpleM', 'sim'].includes(child.key));
      const weaponLookupKey = weaponChild.key;

      // Populate first dropdown with weapons
      const weaponOptions = Array.from(EquipmentParser.lookupItems[weaponLookupKey].items || []);
      weaponOptions.sort((a, b) => a.name.localeCompare(b.name));

      // Add weapons to first dropdown and select the first one
      weaponOptions.forEach((weapon, index) => {
        const option = document.createElement('option');
        option.value = weapon?._id || weapon?.uuid || `weapon-${index}`;
        option.innerHTML = weapon.name;
        if (index === 0) option.selected = true; // Select first weapon
        select.appendChild(option);
      });

      const populateSecondDropdown = () => {
        secondSelect.innerHTML = '';
        weaponOptions.forEach((weapon, index) => {
          const option = document.createElement('option');
          option.value = weapon?._id || weapon?.uuid || `weapon-${index}`;
          option.innerHTML = weapon.name;
          if (index === 0) option.selected = true; // Select first weapon
          secondSelect.appendChild(option);
        });

        // Add shield options
        const shieldOptions = Array.from(EquipmentParser.lookupItems.shield.items || []);
        shieldOptions.sort((a, b) => a.name.localeCompare(b.name));

        shieldOptions.forEach((shield) => {
          const option = document.createElement('option');
          option.value = shield?._id || shield?.uuid || `shield-${index}`;
          option.innerHTML = shield.name;
          secondSelect.appendChild(option);
        });
      };

      populateSecondDropdown();
      select.addEventListener('change', populateSecondDropdown);
      this.#addFavoriteStar(itemContainer, item);
      return itemContainer;
    }
    // Handle regular weapon quantity choices
    else if (isMultiQuantityChoice && weaponTypeChild) {
      const dropdownContainer = document.createElement('div');
      dropdownContainer.classList.add('dual-weapon-selection');

      const secondSelect = document.createElement('select');
      secondSelect.id = `${item._source.key}-second`;
      secondSelect.style.display = 'none';

      const secondLabel = document.createElement('label');
      secondLabel.htmlFor = secondSelect.id;
      secondLabel.innerHTML = game.i18n.localize('hm.app.equipment.choose-second-weapon');
      secondLabel.style.display = 'none';
      secondLabel.classList.add('second-weapon-label');

      dropdownContainer.appendChild(secondLabel);
      dropdownContainer.appendChild(secondSelect);
      itemContainer.appendChild(dropdownContainer);

      select.addEventListener('change', async (event) => {
        const isWeaponSelection = event.target.value !== this.#extractLinkedItemId(item);
        secondLabel.style.display = isWeaponSelection ? 'block' : 'none';
        secondSelect.style.display = isWeaponSelection ? 'block' : 'none';

        if (isWeaponSelection) {
          secondSelect.innerHTML = `<option value="">${game.i18n.localize('hm.app.equipment.select-weapon')}</option>`;
          const lookupOptions = Array.from(EquipmentParser.lookupItems[weaponTypeChild.key] || []);
          lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

          lookupOptions.forEach((option) => {
            const optionElement = document.createElement('option');
            const itemQuantityMatch = child.label?.match(/^(\d+)\s+(.+)$/i);
            if (itemQuantityMatch) {
              optionElement.dataset.quantity = itemQuantityMatch[1];
              optionElement.innerHTML = child.label;
            } else {
              optionElement.dataset.quantity = child.count || 1;
              optionElement.innerHTML = child.count > 1 ? `${child.count} ${option.name}` : option.name;
            }
            optionElement.value = option._source.key;
            optionElement.innerHTML = option.name;
            secondSelect.appendChild(optionElement);
          });
        }
      });
    } else if (isMultiQuantityChoice && !weaponTypeChild) {
      HM.log(1, 'Multi-quantity choice missing weapon type child');
    }

    // Handle regular items and focus items separately
    const renderedItemNames = new Set();
    const nonFocusItems = item.children.filter((child) => child.type !== 'focus');
    const focusItem = item.children.find((child) => child.type === 'focus');

    // Handle focus option if present
    if (hasFocusOption && focusItem) {
      const focusType = focusItem.key;
      const focusConfig = CONFIG.DND5E.focusTypes[focusType];

      if (focusConfig) {
        const pouchItem = nonFocusItems.find((child) => child.type === 'linked' && child.label?.toLowerCase().includes(game.i18n.localize('hm.app.equipment.pouch').toLowerCase()));
        if (pouchItem) {
          pouchItem.rendered = true;
          renderedItemNames.add('Component Pouch');

          const pouchOption = document.createElement('option');
          pouchOption.value = pouchItem?._source?.key;
          pouchOption.innerHTML = pouchItem.label || pouchItem.name;
          pouchOption.selected = true;
          select.appendChild(pouchOption);
          defaultSelection.value = pouchItem._source.key;
        }

        // Add focus options
        Object.entries(focusConfig.itemIds).forEach(([focusName, itemId]) => {
          const option = document.createElement('option');
          option.value = itemId;
          option.innerHTML = focusName.charAt(0).toUpperCase() + focusName.slice(1);
          select.appendChild(option);
        });
      } else {
        HM.log(2, `No focus configuration found for type: ${focusType}`);
      }
    }

    for (const child of nonFocusItems) {
      if (child.type === 'AND') {
        await this.#renderAndGroup(child, select, renderedItemNames);
      } else if (['linked', 'weapon', 'tool', 'armor'].includes(child.type)) {
        await this.#renderIndividualItem(child, select, renderedItemNames);
      } else if (child.key && !child.type) {
        // Handle edge case of items with key but no type
        const optionElement = document.createElement('option');
        optionElement.value = child.key || child._id;
        optionElement.innerHTML = `${child.label || child.name || child.key || game.i18n.localize('hm.app.equipment.unknown-choice')}`;
        select.appendChild(optionElement);
        renderedItemNames.add(optionElement.innerHTML);
      }
    }

    this.#addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Determines if item should be rendered as dropdown
   * @param {object} item - Equipment item
   * @returns {boolean} True if should render as dropdown
   * @private
   */
  #shouldItemUseDropdownDisplay(item) {
    if (item.group) {
      const parentItem = this.equipmentData.class.find((p) => p._source.key === item.group) || this.equipmentData.background.find((p) => p._source.key === item.group);
      return parentItem?.type === 'OR';
    }

    // Check for combined items that should be rendered in a dropdown
    if (item.type === 'AND' && item.children?.length > 1) {
      const parent = this.equipmentData.class.find((p) => p._source.key === item.group) || this.equipmentData.background.find((p) => p._source.key === item.group);
      if (parent?.type === 'OR') {
        return true;
      }
    }

    // Check if item is already part of a combined selection
    if (EquipmentParser.combinedItemIds.has(item._source.key)) {
      return true;
    }

    // Top-level OR blocks should be dropdowns
    return item.type === 'OR';
  }

  /**
   * Creates and adds a favorite star checkbox to an equipment item container
   * @param {HTMLElement} container - The item container element
   * @param {object} item - The item data object
   * @returns {HTMLElement} The created favorite checkbox
   * @private
   */
  #addFavoriteStar(container, item) {
    if (container.innerHTML === '') return;

    const favoriteContainer = document.createElement('div');
    favoriteContainer.classList.add('equipment-favorite-container');

    const favoriteLabel = document.createElement('label');
    favoriteLabel.classList.add('equipment-favorite-label');
    favoriteLabel.title = 'Add to favorites';

    const favoriteCheckbox = document.createElement('input');
    favoriteCheckbox.type = 'checkbox';
    favoriteCheckbox.classList.add('equipment-favorite-checkbox');

    // Extract display name from container
    let itemName = '';
    const itemHeader = container.querySelector('h4');
    const itemLabel = container.querySelector('label');

    if (itemHeader && itemHeader.textContent) {
      itemName = itemHeader.textContent.trim();
    } else if (itemLabel && itemLabel.textContent) {
      itemName = itemLabel.textContent.trim();
    } else {
      itemName = item.name || item.label || '';
    }

    // Clean up the name
    itemName = itemName.replace(/^\s*☐\s*|\s*☑\s*/g, '').trim();
    favoriteCheckbox.dataset.itemName = itemName;

    // Check for combined items first (these have comma-separated UUIDs in the ID)
    const parentCheckbox = container.querySelector('input[type="checkbox"]');
    if (parentCheckbox && parentCheckbox.id && parentCheckbox.id.includes(',')) {
      // This is a combined item with multiple UUIDs in the ID
      favoriteCheckbox.dataset.itemUuids = parentCheckbox.id;
      favoriteCheckbox.id = parentCheckbox.id;

      HM.log(3, `Setting up favorite for combined item "${itemName}" with IDs:`, parentCheckbox.id);
    } else {
      // Check for data-uuid attributes in the container
      const uuids = this.extractUUIDsFromContent(container.innerHTML);

      if (uuids.length > 0) {
        // Store all UUIDs for multi-item favorites
        favoriteCheckbox.dataset.itemUuids = uuids.join(',');
        favoriteCheckbox.id = uuids.join(',');

        HM.log(3, `Setting up favorite for "${itemName}" with ${uuids.length} UUIDs:`, uuids);
      } else if (item._source?.key) {
        // For linked items that have a source key
        const sourceKey = item._source.key;
        favoriteCheckbox.dataset.itemUuids = sourceKey;
        favoriteCheckbox.id = sourceKey;

        HM.log(3, `Setting up favorite for "${itemName}" with source key:`, sourceKey);
      } else {
        // Fallback for other items
        const itemId = item._id || '';
        favoriteCheckbox.dataset.itemId = itemId;
        favoriteCheckbox.id = itemId;

        HM.log(3, `Setting up favorite for "${itemName}" with ID:`, itemId);
      }
    }

    // Create the star icon
    const starIcon = document.createElement('i');
    starIcon.classList.add('fa-bookmark', 'equipment-favorite-star', 'fa-thin');

    // Add event listener to update icon when checkbox state changes
    favoriteCheckbox.addEventListener('change', function () {
      if (this.checked) {
        starIcon.classList.remove('fa-thin');
        starIcon.classList.add('fa-solid');
      } else {
        starIcon.classList.remove('fa-solid');
        starIcon.classList.add('fa-thin');
      }
    });

    // Assemble the components
    favoriteLabel.appendChild(favoriteCheckbox);
    favoriteLabel.appendChild(starIcon);
    favoriteContainer.appendChild(favoriteLabel);

    // Find where to append the star
    if (container.querySelector('label')) {
      container.querySelector('label').insertAdjacentElement('afterend', favoriteContainer);
    } else if (container.querySelector('h4')) {
      container.querySelector('h4').insertAdjacentElement('afterend', favoriteContainer);
    } else if (container.querySelector('select')) {
      container.querySelector('select').insertAdjacentElement('afterend', favoriteContainer);
    } else {
      container.appendChild(favoriteContainer);
    }

    return favoriteCheckbox;
  }

  extractUUIDsFromContent(content) {
    const uuidRegex = /data-uuid="([^"]+)"/g;
    const uuids = [];
    let match;

    while ((match = uuidRegex.exec(content)) !== null) {
      uuids.push(match[1]);
    }

    return uuids;
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Collects equipment selections from the HTML form
   * @param {Event} event - The form submission event
   * @param {object} options - Collection options
   * @param {boolean} [options.includeClass=true] - Whether to include class equipment
   * @param {boolean} [options.includeBackground=true] - Whether to include background equipment
   * @returns {Promise<Array<object>>} An array of equipment items
   * @static
   */
  static async collectEquipmentSelections(event, options = { includeClass: true, includeBackground: true }) {
    const equipment = [];
    const equipmentContainer = event.target?.querySelector('#equipment-container');
    if (!equipmentContainer) return equipment;

    async function findItemInPacks(itemId) {
      if (!itemId) return null;

      // Check if this is a comma-separated list of IDs
      if (itemId.includes(',')) {
        const ids = itemId.split(',').filter((id) => id.trim());

        // For equipment groups, we should return a collection of items
        const items = [];

        for (const id of ids) {
          // Try to find the item
          const item = await findItemInPacks(id.trim());
          if (item) items.push(item);
        }

        // Return first item for backward compatibility
        return items.length > 0 ? items[0] : null;
      }

      try {
        // Check if it's a valid UUID
        let parsed;
        try {
          parsed = foundry.utils.parseUuid(itemId);
        } catch (e) {
          // Not a valid UUID format
        }

        // If it's not a valid UUID, try to find a UUID for this ID
        if (!parsed && !itemId.includes('.')) {
          // Look through the select options to find matching UUID
          const selectOptions = Array.from(document.querySelectorAll('select option'));
          for (const option of selectOptions) {
            if (option.value.split(',').includes(itemId)) {
              // Find content links within this option
              const links = option.querySelectorAll('a.content-link');
              for (const link of links) {
                const uuid = link.dataset.uuid;
                if (uuid) {
                  HM.log(3, `Found UUID ${uuid} for ID ${itemId}`);
                  const item = await fromUuidSync(uuid);
                  if (item) {
                    return item;
                  }
                }
              }
            }
          }
        }

        // Regular UUID lookup
        const indexItem = fromUuidSync(itemId);
        if (indexItem) {
          const packId = indexItem.pack;
          const pack = game.packs.get(packId);
          if (pack) {
            const fullItem = await pack.getDocument(indexItem._id);
            HM.log(3, `Found full item ${itemId}`);
            return fullItem;
          }
        }

        HM.log(2, `Could not find item ${itemId} in any pack`);
        return null;
      } catch (error) {
        HM.log(1, `Error finding item ${itemId}:`, error);
        return null;
      }
    }

    async function processContainerItem(containerItem, quantity) {
      if (!containerItem) return;

      try {
        const packId = containerItem.pack;
        const pack = game.packs.get(packId);

        if (pack) {
          const fullContainer = await pack.getDocument(containerItem._id);
          if (fullContainer) {
            const containerData = await CONFIG.Item.documentClass.createWithContents([fullContainer], {
              keepId: true,
              transformAll: async (doc) => {
                const transformed = doc.toObject();
                if (doc.id === fullContainer.id) {
                  transformed.system = transformed.system || {};
                  transformed.system.quantity = quantity;
                  transformed.system.currency = fullContainer.system?.currency;
                  transformed.system.equipped = true;
                }
                return transformed;
              }
            });

            if (containerData?.length) {
              equipment.push(...containerData);
              HM.log(3, `Added container ${fullContainer.name} and its contents to equipment`);
            }
          }
        }
      } catch (error) {
        HM.log(1, `Error processing container ${containerItem?.name || containerItem?._id}:`, error);
      }
    }

    // Get all appropriate sections based on options
    const allSections = Array.from(equipmentContainer.querySelectorAll('.equipment-choices > div'));
    HM.log(
      3,
      `Found ${allSections.length} total equipment sections:`,
      allSections.map((s) => s.className)
    );

    const equipmentSections = allSections.filter((section) => {
      const isClassSection = section.classList.contains('class-equipment-section');
      const isBackgroundSection = section.classList.contains('background-equipment-section');

      HM.log(3, `Section "${section.className}": isClass=${isClassSection}, isBackground=${isBackgroundSection}`);

      if (isClassSection && !options.includeClass) {
        HM.log(3, `Skipping class section because options.includeClass=${options.includeClass}`);
        return false;
      }
      if (isBackgroundSection && !options.includeBackground) {
        HM.log(3, `Skipping background section because options.includeBackground=${options.includeBackground}`);
        return false;
      }
      return true;
    });

    HM.log(3, `After filtering, using ${equipmentSections.length} equipment sections`);

    // Process all sections in parallel
    await Promise.all(
      equipmentSections.map(async (section) => {
        HM.log(3, 'Processing section:', section.className);

        // Get wealth checkbox for this section
        const sectionType = section.classList.contains('class-equipment-section') ? 'class' : 'background';
        const wealthChecked = section.querySelector(`input[id="use-starting-wealth-${sectionType}"]`)?.checked || false;

        // Process dropdowns in parallel - skip if wealth is checked or elements are disabled
        const dropdowns = Array.from(section.querySelectorAll('select')).filter(
          (dropdown) => !dropdown.disabled && !dropdown.closest('.disabled') && (!wealthChecked || !dropdown.closest('.equipment-item'))
        );

        const dropdownPromises = dropdowns.map(async (dropdown) => {
          // Get value (could be IDs or UUIDs)
          const value = dropdown.value || document.getElementById(`${dropdown.id}-default`)?.value;
          if (!value) return;

          try {
            // Try to find the items - value could be single ID/UUID or comma-separated list
            let items = [];

            // Check for comma-separated values (2024 format)
            if (value.includes(',')) {
              // Get UUIDs from option content
              const selectedOption = dropdown.querySelector(`option[value="${value}"]`);
              if (selectedOption) {
                const contentLinks = selectedOption.querySelectorAll('a.content-link');
                if (contentLinks.length) {
                  // Get items from content links
                  items = await Promise.all(Array.from(contentLinks).map((link) => fromUuidSync(link.dataset.uuid)));
                }
              }

              // If no content links, try using IDs directly
              if (!items.length) {
                const ids = value.split(',').filter((id) => id.trim());
                items = await Promise.all(ids.map(async (id) => await findItemInPacks(id)));
              }

              // Filter out nulls
              items = items.filter((item) => item);
            } else {
              // Regular single item lookup
              const item = await findItemInPacks(value);
              if (item) items = [item];
            }

            if (!items.length) return;

            // Process each item
            for (const item of items) {
              const selectedOption = dropdown.querySelector(`option[value="${value}"]`);
              const optionText = selectedOption?.textContent || '';
              const favoriteCheckbox = dropdown.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
              const isFavorite = favoriteCheckbox?.checked || false;

              // Try to find quantity in option text for this specific item
              let quantity = 1;
              const itemNamePattern = new RegExp(`(\\d+)\\s*(?:×|x)?\\s*${item.name}`, 'i');
              const quantityMatch = optionText.match(itemNamePattern);

              if (quantityMatch) {
                quantity = parseInt(quantityMatch[1]);
              } else {
                // Fallback patterns
                const startQuantityMatch = optionText.match(/^(\d+)\s+(.+)$/i);
                const endQuantityMatch = optionText.match(/(.+)\s+\((\d+)\)$/i);
                const midQuantityMatch = optionText.match(/(.+?)\s+[x×](\d+)/i);

                if (startQuantityMatch) quantity = parseInt(startQuantityMatch[1]);
                else if (endQuantityMatch) quantity = parseInt(endQuantityMatch[2]);
                else if (midQuantityMatch) quantity = parseInt(midQuantityMatch[2]);
              }

              HM.log(3, `Processing item ${item.name} with quantity ${quantity}`, { item: item });

              const itemData = item.toObject();
              if (itemData.type === 'container') {
                await processContainerItem(item, quantity);
              } else {
                equipment.push({
                  ...itemData,
                  system: {
                    ...itemData.system,
                    quantity: quantity,
                    equipped: true
                  },
                  favorite: isFavorite
                });
              }
            }
          } catch (error) {
            HM.log(1, `Error processing dropdown ${dropdown.id}:`, error);
          }
        });

        await Promise.all(dropdownPromises);

        // Process checkboxes in parallel - skip if wealth is checked or elements are disabled
        const checkboxes = Array.from(section.querySelectorAll('input[type="checkbox"]')).filter((cb) => {
          return (
            cb.checked &&
            !cb.id.includes('use-starting-wealth') &&
            !cb.classList.contains('equipment-favorite-checkbox') &&
            !cb.disabled &&
            !cb.closest('.disabled') &&
            (!wealthChecked || !cb.closest('.equipment-item'))
          );
        });

        const checkboxPromises = checkboxes.map(async (checkbox) => {
          try {
            // Get the actual label text
            const labelElement = checkbox.parentElement;
            const fullLabel = labelElement.textContent.trim();

            const itemIds = checkbox.id.split(',').filter((id) => id);
            // Split on '+' and trim each part
            const entries = fullLabel.split('+').map((entry) => entry.trim());
            const favoriteCheckbox = checkbox.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
            const isFavorite = favoriteCheckbox?.checked || false;

            // Fetch all items in parallel
            const items = await Promise.all(
              itemIds.map(async (itemId) => {
                return {
                  itemId,
                  item: await findItemInPacks(itemId)
                };
              })
            );

            // Process each found item
            for (const { itemId, item } of items) {
              if (!item) {
                HM.log(1, `Could not find item for ID: ${itemId}`);
                continue;
              }

              // Search all entries for this item's quantity
              let quantity = 1;

              for (const entry of entries) {
                const itemPattern = new RegExp(`(\\d+)\\s+${item.name}`, 'i');
                const match = entry.match(itemPattern);

                if (match) {
                  quantity = parseInt(match[1]);
                  break;
                }
              }

              const itemData = item.toObject();
              if (itemData.type === 'container') {
                await processContainerItem(item, quantity);
              } else {
                equipment.push({
                  ...itemData,
                  system: {
                    ...itemData.system,
                    quantity: quantity,
                    equipped: true
                  },
                  favorite: isFavorite
                });
                HM.log(3, `Added item to equipment: ${item.name} (qty: ${quantity})`);
              }
            }
          } catch (error) {
            HM.log(1, 'Error processing checkbox:', error);
          }
        });

        await Promise.all(checkboxPromises);
      })
    );

    return equipment;
  }

  /**
   * Retrieves all selected compendium packs from settings.
   * Combines item packs, class packs, background packs, and race packs into a single array.
   * @async
   * @returns {Promise<string[]>} Array of compendium pack IDs
   * @static
   */
  static async getSelectedPacks() {
    const itemPacks = (await game.settings.get(HM.ID, 'itemPacks')) || [];
    const classPacks = (await game.settings.get(HM.ID, 'classPacks')) || [];
    const backgroundPacks = (await game.settings.get(HM.ID, 'backgroundPacks')) || [];
    const racePacks = (await game.settings.get(HM.ID, 'racePacks')) || [];

    return [...itemPacks, ...classPacks, ...backgroundPacks, ...racePacks];
  }

  /**
   * Initializes and categorizes equipment lookup items from compendiums
   * @static
   * @async
   * @throws {Error} If initialization or categorization fails
   */
  static async initializeLookupItems() {
    const startTime = performance.now();

    if (this.lookupItemsInitialized) return;
    this.lookupItemsInitialized = true;
    this.itemUuidMap = new Map();

    const selectedPacks = await this.getSelectedPacks();

    try {
      const allItems = await this.#collectAllItems(selectedPacks);
      if (!allItems?.length) {
        HM.log(1, 'No items collected from compendiums');
        return;
      }

      // Create categories for all item types we care about
      const categories = {
        // Weapons
        simpleM: { items: new Set(), label: game.i18n.localize('DND5E.WeaponSimpleM') },
        simpleR: { items: new Set(), label: game.i18n.localize('DND5E.WeaponSimpleR') },
        martialM: { items: new Set(), label: game.i18n.localize('DND5E.WeaponMartialM') },
        martialR: { items: new Set(), label: game.i18n.localize('DND5E.WeaponMartialR') },

        // Tools
        art: { items: new Set(), label: game.i18n.localize('DND5E.ToolArtisans') },
        game: { items: new Set(), label: game.i18n.localize('DND5E.ToolGamingSet') },
        music: { items: new Set(), label: game.i18n.localize('DND5E.ToolMusicalInstrument') },

        // Armor types
        light: { items: new Set(), label: game.i18n.localize('DND5E.EquipmentLight') },
        medium: { items: new Set(), label: game.i18n.localize('DND5E.EquipmentMedium') },
        heavy: { items: new Set(), label: game.i18n.localize('DND5E.EquipmentHeavy') },
        shield: { items: new Set(), label: game.i18n.localize('DND5E.EquipmentShield') },

        // Other
        focus: { items: new Set(), label: game.i18n.localize('DND5E.Item.Property.Focus') }
      };

      // Process in chunks to avoid overwhelming the event loop
      const CHUNK_SIZE = 200;
      const chunks = [];

      for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
        chunks.push(allItems.slice(i, i + CHUNK_SIZE));
      }

      let categorizedCount = 0;

      await Promise.all(
        chunks.map(async (chunk) => {
          chunk.forEach((item) => {
            const itemType = item.type;
            const subType = item.system?.type?.value;

            // Categorize based on item type and subtype
            if (itemType === 'weapon') {
              const weaponType = subType;
              if (categories[weaponType]) {
                categories[weaponType].items.add(item);
                categorizedCount++;
              }
            } else if (itemType === 'equipment') {
              // Check if it's an armor type
              if (Object.keys(CONFIG.DND5E.armorTypes).includes(subType)) {
                categories[subType].items.add(item);
                categorizedCount++;
              }
            } else if (itemType === 'tool') {
              const toolType = subType;
              if (categories[toolType]) {
                categories[toolType].items.add(item);
                categorizedCount++;
              }
            } else if (itemType === 'consumable' && subType === 'focus') {
              categories.focus.items.add(item);
              categorizedCount++;
            }
          });
        })
      );

      // Create aggregated categories
      const aggregatedCategories = {
        // Weapon proficiency groups
        sim: {
          items: new Set([...categories.simpleM.items, ...categories.simpleR.items]),
          label: game.i18n.format('DND5E.WeaponCategory', { category: game.i18n.localize('DND5E.WeaponSimpleProficiency') })
        },
        mar: {
          items: new Set([...categories.martialM.items, ...categories.martialR.items]),
          label: game.i18n.format('DND5E.WeaponCategory', { category: game.i18n.localize('DND5E.WeaponMartialProficiency') })
        },

        // Tool category
        tool: {
          items: new Set([...categories.art.items, ...categories.game.items, ...categories.music.items]),
          label: game.i18n.localize('TYPES.Item.tool')
        },
        // Armor category
        armor: {
          items: new Set([...categories.light.items, ...categories.medium.items, ...categories.heavy.items]),
          label: game.i18n.localize('DND5E.Armor')
        }
      };

      // Combine all categories
      const allCategories = { ...categories, ...aggregatedCategories };

      // Store the item sets directly
      Object.entries(allCategories).forEach(([key, value]) => {
        this[key] = value.items;
      });

      // Store the complete lookup structure
      this.lookupItems = allCategories;
      const endTime = performance.now();
      HM.log(3, `Equipment lookup initialized in ${(endTime - startTime).toFixed(0)}ms. ${categorizedCount} items categorized.`, { lookup: this.lookupItems });
    } catch (error) {
      const endTime = performance.now();
      HM.log(1, `Equipment lookup initialization failed after ${(endTime - startTime).toFixed(0)}ms:`, error);
    }
  }

  /**
   * Processes starting wealth form data into currency amounts
   * @param {object} formData - Form data containing wealth options
   * @returns {object|null} Currency amounts or null if invalid
   * @static
   */
  static async convertWealthStringToCurrency(formData) {
    // Check both possible wealth sources
    const useClassWealth = formData['use-starting-wealth-class'];
    const useBackgroundWealth = formData['use-starting-wealth-background'];

    // Determine which wealth to use (or none)
    if (!useClassWealth && !useBackgroundWealth) {
      return null;
    }

    // Get the appropriate wealth amount
    let wealthAmount;
    if (useClassWealth) {
      wealthAmount = formData['starting-wealth-amount-class'];
    } else if (useBackgroundWealth) {
      wealthAmount = formData['starting-wealth-amount-background'];
    }

    if (!wealthAmount) return null;

    // Initialize currencies object with zeros using CONFIG
    const currencies = {};
    Object.keys(CONFIG.DND5E.currencies).forEach((key) => {
      currencies[key] = 0;
    });

    // Build regex pattern from abbreviations in CONFIG
    const abbrs = Object.values(CONFIG.DND5E.currencies)
      .map((c) => c.abbreviation)
      .join('|');
    const regex = new RegExp(`(\\d+)\\s*(${abbrs})`, 'gi');

    // Process the wealth amount
    const matches = wealthAmount.match(regex);
    if (!matches) return null;

    matches.forEach((match) => {
      const [num, currency] = match.toLowerCase().split(/\s+/);
      const value = parseInt(num);

      if (!isNaN(value)) {
        // Find the currency key that matches this abbreviation
        const currKey = Object.entries(CONFIG.DND5E.currencies).find(([_, data]) => data.abbreviation.toLowerCase() === currency)?.[0];

        if (currKey) {
          currencies[currKey] += value; // Add to existing amount
        } else {
          currencies.gp += value; // Default to gold if currency not recognized
        }
      }
    });

    return currencies;
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Collects and filters equipment items from selected compendiums
   * @param {string[]} selectedPacks - Array of selected compendium IDs
   * @returns {Promise<Array<object>>} Array of non-magical equipment items
   * @throws {Error} If item collection fails
   * @private
   * @static
   */
  static async #collectAllItems(selectedPacks) {
    const startTime = performance.now();
    const skipTypes = ['race', 'feat', 'background', 'class', 'natural', 'spell'];
    const packs = selectedPacks.map((id) => game.packs.get(id)).filter((p) => p?.documentName === 'Item');
    const focusItemIds = new Set();

    // Collect focus item IDs
    Object.values(CONFIG.DND5E.focusTypes).forEach((config) => {
      if (config?.itemIds) {
        Object.values(config.itemIds).forEach((id) => focusItemIds.add(id));
      }
    });

    try {
      const packIndices = await Promise.all(packs.map((pack) => pack.getIndex()));

      // Process all items from all packs in parallel
      const itemProcessingResults = await Promise.all(
        packIndices.map(async (index) => {
          const packItems = [];
          const skipItems = [];
          let processedCount = 0;
          let skippedCount = 0;

          for (const item of index) {
            const isMagic = Array.isArray(item.system?.properties) && item.system.properties.includes('mgc');

            this.itemUuidMap.set(item._id, item.uuid);

            if (skipTypes.includes(item.type) || skipTypes.includes(item.system?.type?.value) || item.system?.identifier === 'unarmed-strike' || isMagic) {
              skippedCount++;
              skipItems.push(item);
              continue;
            }

            if (focusItemIds.has(item._id)) {
              item.system.type.value = 'focus';
            }

            if (item.type === 'tool' && item.system?.type?.value) {
              const toolType = item.system.type.value;
              if (Object.keys(CONFIG.DND5E.toolTypes).includes(toolType)) {
                item.system.type.value = toolType;
              }
            }
            processedCount++;
            packItems.push(item);
          }
          return { packItems, processedCount, skippedCount };
        })
      );
      HM.log(3, 'Collection finished:', { itemProcessingResults });

      // Combine results
      const items = [];
      let totalProcessed = 0;
      let totalSkipped = 0;

      for (const result of itemProcessingResults) {
        items.push(...result.packItems);
        totalProcessed += result.processedCount;
        totalSkipped += result.skippedCount;
      }

      const endTime = performance.now();
      HM.log(3, `Items collected in ${(endTime - startTime).toFixed(0)}ms. Processed: ${totalProcessed}, Included: ${items.length}, Skipped: ${totalSkipped}`);
      return items;
    } catch (error) {
      const endTime = performance.now();
      HM.log(1, `Item collection failed after ${(endTime - startTime).toFixed(0)}ms:`, error);
      return [];
    }
  }
}
