import { DocumentService, EquipmentParser, HM } from './utils/index.js';
/**
 * Hero Mancer Equipment API
 *
 * Usage workflow:
 * 1. Initialize with an actor: `await heroMancer.initializeEquipmentSelector(actor)`
 * 2. Generate UI in a container: `await heroMancer.generateEquipmentUI(container, parser)`
 * 3. When form is submitted, either:
 *    - Collect equipment: `await heroMancer.collectEquipmentSelections(event)`
 *    - Or process wealth: `await heroMancer.convertWealthToCurrency(formData)`
 */

/**
 * Public API for equipment selection functionality
 * @type {Object}
 */
export const API = {
  /**
   * Initialize equipment selection for a specific actor
   * @param {Actor} actor - The actor to select equipment for
   * @returns {Promise<EquipmentParser>} Initialized equipment parser
   */
  initializeEquipmentSelector: async (actor) => {
    if (!actor) {
      throw new Error('Actor is required');
    }

    // Ensure documents are loaded
    await DocumentService.loadAndInitializeDocuments();

    // Create a parser instance
    const parser = EquipmentParser.getInstance();

    // Extract class and background data from actor
    const classItem = actor.items.find((i) => i.type === 'class');
    const backgroundItem = actor.items.find((i) => i.type === 'background');

    if (classItem) {
      HM.SELECTED.class = {
        value: classItem.name,
        id: classItem.id,
        uuid: classItem.uuid
      };
      parser.classId = classItem.id;
      parser.classUUID = classItem.uuid;
    }

    if (backgroundItem) {
      HM.SELECTED.background = {
        value: backgroundItem.name,
        id: backgroundItem.id,
        uuid: backgroundItem.uuid
      };
      parser.backgroundId = backgroundItem.id;
      parser.backgroundUUID = backgroundItem.uuid;
    }

    // Reset equipment data to force refresh
    parser.equipmentData = null;

    // Initialize lookup items if needed
    await EquipmentParser.initializeLookupItems();

    return parser;
  },

  /**
   * Generate equipment selection UI for display
   * @param {HTMLElement} container - Container element to render UI into
   * @param {EquipmentParser} parser - Initialized equipment parser
   * @returns {Promise<HTMLElement>} The updated container with UI
   */
  generateEquipmentUI: async (container, parser) => {
    if (!parser) {
      parser = EquipmentParser.getInstance();
    }

    // Generate equipment UI
    const equipmentUI = await parser.generateEquipmentSelectionUI();

    // If equipmentUI is returned directly, append it to the container
    if (equipmentUI instanceof HTMLElement) {
      container.appendChild(equipmentUI);
    }
    // Otherwise, look for the equipment-choices element and append it
    else {
      const equipmentChoices = document.querySelector('.equipment-choices');
      if (equipmentChoices) {
        // Move the element to our container instead of just cloning
        container.appendChild(equipmentChoices);
      }
    }

    // Trigger hook for when UI generation is complete
    Hooks.callAll('heroMancer.EquipmentUIRendered', container, parser);

    return container;
  },

  /**
   * Collect and process equipment selections
   * @param {Event} event - The form submission event
   * @param {Object} options - Collection options
   * @param {boolean} [options.includeClass=true] - Whether to include class equipment
   * @param {boolean} [options.includeBackground=true] - Whether to include background equipment
   * @returns {Promise<Array>} Array of equipment items
   */
  collectEquipmentSelections: async (event, options = {}) => {
    return await EquipmentParser.collectEquipmentSelections(event, options);
  },

  /**
   * Process starting wealth into currency amounts
   * @param {Object} formData - Form data containing wealth options
   * @returns {Promise<Object>} Currency amounts
   */
  convertWealthToCurrency: async (formData) => {
    return await EquipmentParser.convertWealthStringToCurrency(formData);
  }
};
