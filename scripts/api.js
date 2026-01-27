import { DocumentService, EquipmentCollection, EquipmentManager, EquipmentUI, HM } from './utils/index.js';

/**
 * Public API for equipment selection functionality
 * @type {object}
 */
export const API = {
  /**
   * Initialize equipment selection for a specific actor.
   * @param {object} actor - The actor to select equipment for
   * @returns {Promise<void>}
   */
  initializeEquipmentSelector: async (actor) => {
    if (!actor) throw new Error('Actor is required');
    await DocumentService.loadAndInitializeDocuments();
    const classItem = actor.items.find((i) => i.type === 'class');
    const backgroundItem = actor.items.find((i) => i.type === 'background');
    if (classItem) HM.SELECTED.class = { value: classItem.name, id: classItem.id, uuid: classItem.uuid };
    if (backgroundItem) HM.SELECTED.background = { value: backgroundItem.name, id: backgroundItem.id, uuid: backgroundItem.uuid };
    EquipmentManager.clearCache();
    await EquipmentManager.initializeLookup();
  },

  /**
   * Generate equipment selection UI for display.
   * @param {HTMLElement} container - Container element to render UI into
   * @returns {Promise<HTMLElement>} The updated container with UI
   */
  generateEquipmentUI: async (container) => {
    await EquipmentUI.render(container);
    Hooks.callAll('heroMancer.EquipmentUIRendered', container);
    return container;
  },

  /**
   * Collect and process equipment selections.
   * @param {Event} event - The form submission event
   * @param {object} [options] - Collection options
   * @param {boolean} [options.includeClass] - Whether to include class equipment
   * @param {boolean} [options.includeBackground] - Whether to include background equipment
   * @returns {Promise<Array>} Array of equipment items
   */
  collectEquipmentSelections: async (event, options = {}) => {
    return await EquipmentCollection.collectSelections(event, options);
  },

  /**
   * Process starting wealth selections.
   * @param {Event} event - Form submission event
   * @returns {Promise<object[]>} Currency items to add
   */
  processWealth: async (event) => {
    return await EquipmentCollection.processWealth(event);
  },

  /**
   * Check if wealth is selected for a type.
   * @param {HTMLElement} container - Equipment container
   * @param {string} type - Source type (class or background)
   * @returns {boolean}
   */
  isWealthSelected: (container, type) => {
    return EquipmentCollection.isWealthSelected(container, type);
  }
};
