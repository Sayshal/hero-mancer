import { HM } from '../index.js';

/**
 * Handles data fetching and processing for equipment
 */
export class EquipmentDataService {
  /**
   * Creates a new EquipmentDataService
   * @param {Object} parser - The parent EquipmentParser instance
   */
  constructor(parser) {
    this.parser = parser;
  }

  /**
   * Retrieves and combines equipment data from class and background selections
   * @async
   * @returns {Promise<object>} Combined equipment data
   */
  async fetchEquipmentData() {
    const classEquipment = await this.getStartingEquipment('class');
    const backgroundEquipment = await this.getStartingEquipment('background');

    return {
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
    const selectedPacks = await this.getSelectedPacks();
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
      this.parser.proficiencies = await this.extractProficienciesFromAdvancements(doc.system.advancement || []);

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
   * Retrieves all selected compendium packs from settings.
   * @async
   * @returns {Promise<string[]>} Array of compendium pack IDs
   */
  async getSelectedPacks() {
    const itemPacks = (await game.settings.get(HM.ID, 'itemPacks')) || [];
    const classPacks = (await game.settings.get(HM.ID, 'classPacks')) || [];
    const backgroundPacks = (await game.settings.get(HM.ID, 'backgroundPacks')) || [];
    const racePacks = (await game.settings.get(HM.ID, 'racePacks')) || [];

    return [...itemPacks, ...classPacks, ...backgroundPacks, ...racePacks];
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

    // Case 1: Check for "Starting Equipment" pattern
    const startingEquipmentElements = findElementsWithText(tempDiv, 'b, strong', 'Starting Equipment');
    if (startingEquipmentElements.length > 0) {
      return this.extractStartingEquipmentPattern(startingEquipmentElements[0]);
    }

    // Case 2: Look for Equipment: label
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

    // Case 3: Look for definition list format
    const definitionTerms = tempDiv.querySelectorAll('dt');
    for (const dt of definitionTerms) {
      if (dt.textContent.toLowerCase().includes(`${game.i18n.localize('TYPES.Item.equipment').toLowerCase()}:`)) {
        HM.log(3, 'Found equipment in definition list');
        return dt.outerHTML;
      }
    }

    // Case 4: Look for equipment headings
    const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const heading of headings) {
      if (isEquipmentHeading(heading)) {
        return this.extractContentFromHeading(heading);
      }
    }

    // Case 5: Generic search for paragraphs
    const paragraphs = tempDiv.querySelectorAll('p');
    for (const para of paragraphs) {
      if (isEquipmentHeading(para)) {
        return this.extractContentFromParagraph(para);
      }
    }

    // Final fallback - check for plain text mentions
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

  /**
   * Extract equipment content using Starting Equipment pattern
   * @param {HTMLElement} element - The starting element
   * @returns {string} HTML content
   * @private
   */
  extractStartingEquipmentPattern(element) {
    HM.log(3, 'Found Starting Equipment heading');
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
    return null;
  }

  /**
   * Extract content from a heading element
   * @param {HTMLElement} heading - The heading element
   * @returns {string} HTML content
   * @private
   */
  extractContentFromHeading(heading) {
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

  /**
   * Extract content from a paragraph
   * @param {HTMLElement} para - The paragraph element
   * @returns {string} HTML content
   * @private
   */
  extractContentFromParagraph(para) {
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
