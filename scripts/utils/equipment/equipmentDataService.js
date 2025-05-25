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
    HM.log(3, 'EquipmentDataService: Initialized');
  }

  /**
   * Retrieves and combines equipment data from class and background selections
   * @async
   * @returns {Promise<object>} Combined equipment data
   * @throws {Error} If data fetching fails
   */
  async fetchEquipmentData() {
    HM.log(3, 'Beginning equipment data fetch');

    try {
      const [classEquipment, backgroundEquipment] = await Promise.all([this.getStartingEquipment('class'), this.getStartingEquipment('background')]);

      const result = {
        class: classEquipment || [],
        background: backgroundEquipment || []
      };

      HM.log(3, `Retrieved ${result.class.length} class items and ${result.background.length} background items`);
      return result;
    } catch (error) {
      HM.log(1, `Failed to fetch equipment data: ${error.message}`);
      // Return empty data structure rather than null
      return { class: [], background: [] };
    }
  }

  /**
   * Searches all selectedPacks for a document by ID
   * @async
   * @param {string} itemId - Item ID to search for
   * @returns {Promise<Item|null>} Found item document or null
   */
  async findItemDocumentById(itemId) {
    HM.log(3, `Searching for item ${itemId}`);
    const selectedPacks = this.getSelectedPacks();

    for (const packId of selectedPacks) {
      const pack = game.packs.get(packId);
      if (pack?.documentName === 'Item') {
        const item = await pack.getDocument(itemId);
        if (item) {
          HM.log(3, `Found item ${itemId} in pack ${packId}`);
          return item;
        }
      }
    }

    HM.log(3, `Item ${itemId} not found in any pack`);
    return null;
  }

  /**
   * Extracts granted proficiencies from advancement data
   * @async
   * @param {Array<object>} advancements - Array of advancement configurations
   * @returns {Promise<Set<string>>} Set of granted proficiency strings
   */
  async extractProficienciesFromAdvancements(advancements) {
    HM.log(3, `Processing ${advancements?.length || 0} advancements`);
    const proficiencies = new Set();

    for (const advancement of advancements) {
      if (advancement.configuration && advancement.configuration.grants) {
        for (const grant of advancement.configuration.grants) {
          proficiencies.add(grant);
        }
      }
    }

    HM.log(3, `Collected ${proficiencies.size} proficiencies`);
    return proficiencies;
  }

  /**
   * Fetches starting equipment and proficiencies for a given selection type
   * @async
   * @param {'class'|'background'} type - Selection type to fetch equipment for
   * @returns {Promise<Array<object>>} Starting equipment array
   */
  async getStartingEquipment(type) {
    HM.log(3, `Fetching ${type} equipment`);

    const storedData = HM.SELECTED[type] || {};
    const id = storedData.id;
    const uuid = storedData.uuid;

    if (!id) {
      HM.log(3, `No ${type} selected`);
      return [];
    }

    const doc = await this.fetchDocumentByUuidOrId(type, uuid, id);

    if (!doc) {
      HM.log(2, `No document found for ${type} with id ${id}`);
      return [];
    }

    // Extract proficiencies from document
    this.parser.proficiencies = await this.extractProficienciesFromAdvancements(doc.system.advancement || []);

    // Return equipment if available
    if (doc.system.startingEquipment) {
      HM.log(3, `Found ${doc.system.startingEquipment.length} equipment items for ${type} ${doc.name}`);
      return doc.system.startingEquipment;
    } else {
      HM.log(2, `Document found but has no startingEquipment property: ${doc.name}`);
      return [];
    }
  }

  /**
   * Helper method to fetch document by UUID or ID
   * @async
   * @param {string} type - Document type ('class' or 'background')
   * @param {string} uuid - UUID to try first
   * @param {string} id - ID to use as fallback
   * @returns {Promise<Document|null>} Found document or null
   * @private
   */
  async fetchDocumentByUuidOrId(type, uuid, id) {
    HM.log(3, `Fetching ${type} document with UUID ${uuid} or ID ${id}`);

    let doc = null;
    try {
      // Try to get by UUID first
      if (uuid) {
        HM.log(3, `Attempting to get document by UUID: ${uuid}`);
        doc = await fromUuidSync(uuid);
      }

      // If UUID fails, try by ID
      if (!doc) {
        HM.log(2, `UUID lookup failed, trying ID: ${id}`);
        doc = await this.findItemDocumentById(id);
      }
    } catch (error) {
      HM.log(1, `Error retrieving document for ${type}: ${error.message}`);
    }

    if (doc) {
      HM.log(3, `Successfully found document ${doc.name}`);
    } else {
      HM.log(2, 'Failed to find document');
    }

    return doc;
  }

  /**
   * Retrieves all selected compendium packs from settings.
   * @returns {Promise<string[]>} Array of compendium pack IDs
   */
  getSelectedPacks() {
    HM.log(3, 'Retrieving selected packs');
    const itemPacks = game.settings.get(HM.ID, 'itemPacks') || [];
    const classPacks = game.settings.get(HM.ID, 'classPacks') || [];
    const backgroundPacks = game.settings.get(HM.ID, 'backgroundPacks') || [];
    const racePacks = game.settings.get(HM.ID, 'racePacks') || [];

    const result = [...itemPacks, ...classPacks, ...backgroundPacks, ...racePacks];
    HM.log(3, `Retrieved ${result.length} total packs`);
    return result;
  }

  /**
   * Extract equipment description from document HTML
   * @param {Document} document - The document to extract equipment info from
   * @returns {string|null} - HTML string with equipment description or null if not found
   */
  extractEquipmentDescription(document) {
    HM.log(3, `Extracting from ${document?.name || 'unknown document'}`);

    if (!document) {
      HM.log(2, 'No document provided');
      return null;
    }

    // Get the document's description
    const description = document.system?.description?.value;
    if (!description) {
      HM.log(2, 'Document has no description');
      return null;
    }

    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = description;

    // Try all extraction methods in sequence
    let equipmentHtml =
      this.findStartingEquipmentPattern(tempDiv) ||
      this.findEquipmentLabel(tempDiv) ||
      this.findDefinitionListFormat(tempDiv) ||
      this.findEquipmentHeadings(tempDiv) ||
      this.findEquipmentParagraphs(tempDiv) ||
      this.findPlainTextMentions(description);

    if (equipmentHtml) {
      HM.log(3, 'Successfully extracted equipment description');
    } else {
      HM.log(1, 'Failed to extract equipment description using any method');
    }

    return equipmentHtml;
  }

  /**
   * Checks if an element is related to equipment
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} - True if element is equipment-related
   * @private
   */
  isEquipmentHeading(element) {
    const text = element.textContent.toLowerCase();
    const isEquipment = text.includes(game.i18n.localize('TYPES.Item.equipment').toLowerCase()) || text.toLowerCase().includes(game.i18n.localize('hm.app.equipment.starting-equipment').toLowerCase());

    if (!isEquipment) {
      HM.log(3, `EquipmentDataService: Skipping non-equipment heading: "${element.textContent}"`);
    }

    return isEquipment;
  }

  /**
   * Find elements with specific text
   * @param {HTMLElement} parent - Parent element to search
   * @param {string} selector - CSS selector
   * @param {string} text - Text to search for
   * @returns {HTMLElement[]} - Matching elements
   * @private
   */
  findElementsWithText(parent, selector, text) {
    const elements = parent.querySelectorAll(selector);
    const matches = Array.from(elements).filter((el) => el.textContent.toLowerCase().includes(text.toLowerCase()));
    HM.log(3, `Found ${matches.length} elements matching "${text}"`);
    return matches;
  }

  /**
   * Case 1: Find Starting Equipment pattern
   * @param {HTMLElement} tempDiv - Temporary div with document HTML
   * @returns {string|null} - Extracted HTML or null
   * @private
   */
  findStartingEquipmentPattern(tempDiv) {
    HM.log(3, 'Searching for Starting Equipment pattern');
    const startingEquipmentElements = this.findElementsWithText(tempDiv, 'b, strong', 'Starting Equipment');

    if (startingEquipmentElements.length > 0) {
      HM.log(3, 'Found Starting Equipment heading');
      return this.extractStartingEquipmentPattern(startingEquipmentElements[0]);
    }

    return null;
  }

  /**
   * Case 2: Find Equipment: label
   * @param {HTMLElement} tempDiv - Temporary div with document HTML
   * @returns {string|null} - Extracted HTML or null
   * @private
   */
  findEquipmentLabel(tempDiv) {
    HM.log(3, 'Searching for Equipment: label');
    const equipmentLabels = this.findElementsWithText(tempDiv, '.Serif-Character-Style_Bold-Serif, .Bold-Serif, strong, b, span[class*="bold"], span[style*="font-weight"]', 'Equipment:');

    if (equipmentLabels.length > 0) {
      const equipmentLabel = equipmentLabels[0];
      const parentParagraph = equipmentLabel.closest('p');

      if (parentParagraph) {
        const paragraphHTML = parentParagraph.outerHTML;
        HM.log(3, 'Found equipment paragraph');
        return paragraphHTML;
      }
    }

    return null;
  }

  /**
   * Case 3: Find definition list format
   * @param {HTMLElement} tempDiv - Temporary div with document HTML
   * @returns {string|null} - Extracted HTML or null
   * @private
   */
  findDefinitionListFormat(tempDiv) {
    HM.log(3, 'Searching for definition list format');
    const definitionTerms = tempDiv.querySelectorAll('dt');

    for (const dt of definitionTerms) {
      if (dt.textContent.toLowerCase().includes(`${game.i18n.localize('TYPES.Item.equipment').toLowerCase()}:`)) {
        HM.log(3, 'Found equipment in definition list');
        return dt.outerHTML;
      }
    }

    return null;
  }

  /**
   * Case 4: Find equipment headings
   * @param {HTMLElement} tempDiv - Temporary div with document HTML
   * @returns {string|null} - Extracted HTML or null
   * @private
   */
  findEquipmentHeadings(tempDiv) {
    HM.log(3, 'Searching for equipment headings');
    const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');

    for (const heading of headings) {
      if (this.isEquipmentHeading(heading)) {
        HM.log(3, `Found equipment heading: ${heading.textContent}`);
        return this.extractContentFromHeading(heading);
      }
    }

    return null;
  }

  /**
   * Case 5: Find paragraphs mentioning equipment
   * @param {HTMLElement} tempDiv - Temporary div with document HTML
   * @returns {string|null} - Extracted HTML or null
   * @private
   */
  findEquipmentParagraphs(tempDiv) {
    HM.log(3, 'Searching for paragraphs mentioning equipment');
    const paragraphs = tempDiv.querySelectorAll('p');

    for (const para of paragraphs) {
      if (this.isEquipmentHeading(para)) {
        HM.log(3, `Found paragraph with equipment: ${para.textContent.substring(0, 40)}...`);
        return this.extractContentFromParagraph(para);
      }
    }

    return null;
  }

  /**
   * Final fallback: Find plain text mentions of equipment
   * @param {string} description - Document description HTML
   * @returns {string|null} - Extracted HTML or null
   * @private
   */
  findPlainTextMentions(description) {
    HM.log(3, 'Searching for plain text mentions');
    const equipmentRegex = /equipment:([^<]+)(?:<\/|<br|$)/i;
    const match = description.match(equipmentRegex);

    if (match) {
      const equipmentText = match[1].trim();
      HM.log(3, `Found equipment via regex: "${equipmentText.substring(0, 40)}..."`);
      return `<p><strong>${game.i18n.localize('TYPES.Item.equipment')}:</strong> ${equipmentText}</p>`;
    }

    return null;
  }

  /**
   * Extract equipment content using Starting Equipment pattern
   * @param {HTMLElement} element - The starting element
   * @returns {string|null} HTML content
   */
  extractStartingEquipmentPattern(element) {
    HM.log(3, 'Processing Starting Equipment pattern');
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

      HM.log(3, 'Extracted complete equipment section');
      return combinedContent;
    }
    return null;
  }

  /**
   * Extract content from a heading element
   * @param {HTMLElement} heading - The heading element
   * @returns {string|null} HTML content or null if invalid
   */
  extractContentFromHeading(heading) {
    HM.log(3, 'Extracting content from heading');

    // Validate input
    if (!heading || !heading.tagName || !heading.tagName.match(/^H[1-6]$/)) {
      HM.log(2, 'Invalid heading element provided');
      return null;
    }

    let content = heading.outerHTML;
    let currentElement = heading.nextElementSibling;
    let elementCount = 0;
    const MAX_ELEMENTS = 10; // Prevent excessive inclusion

    // Include relevant content after the heading
    while (currentElement && !currentElement.tagName.match(/^H[1-6]$/) && content.length < 1000 && elementCount < MAX_ELEMENTS) {
      if (['P', 'UL', 'OL'].includes(currentElement.tagName)) {
        content += currentElement.outerHTML;
        elementCount++;
      } else {
        // Non-content element encountered
        break;
      }

      currentElement = currentElement.nextElementSibling;
    }

    if (content === heading.outerHTML) {
      HM.log(3, 'No additional content found after heading');
    } else {
      HM.log(3, `Extracted equipment section from heading with ${elementCount} additional elements`);
    }

    return content;
  }

  /**
   * Extract content from a paragraph
   * @param {HTMLElement} para - The paragraph element
   * @returns {string} HTML content
   */
  extractContentFromParagraph(para) {
    HM.log(3, `Extracting from paragraph starting with "${para.textContent.substring(0, 40)}..."`);

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

    HM.log(3, 'Extracted equipment paragraph and related content');
    return content;
  }
}
