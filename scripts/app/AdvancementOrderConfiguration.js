import { HM } from '../hero-mancer.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DragDropClass = foundry.utils.isNewerVersion(game.version, '12.999') ? foundry?.applications?.ux?.DragDrop?.implementation : DragDrop;

/**
 * Application to configure advancement processing order
 */
export class AdvancementOrderConfiguration extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `advancement-order-config-${HM.ID}`,
    tag: 'form',
    window: {
      title: 'hm.settings.advancement-order.menu.name',
      icon: 'fa-solid fa-sort',
      width: 'auto',
      height: 'auto',
      resizable: false,
      minimizable: true
    },
    classes: ['advancement-order-configuration'],
    form: {
      handler: AdvancementOrderConfiguration.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: {
      top: 75
    },
    actions: {
      reset: AdvancementOrderConfiguration.handleReset
    },
    dragDrop: [
      {
        dragSelector: '.advancement-order-item',
        dropSelector: '.advancement-order-list'
      }
    ]
  };

  /** @override */
  static PARTS = { form: { template: `modules/${HM.ID}/templates/settings/advancement-order-config.hbs` } };

  parentApp = null;

  config = [];

  /**
   * @param {Application} parentApp - The parent application that opened this configuration
   * @param {Object} [options={}] - Additional application options
   */
  constructor(parentApp, options = {}) {
    super(options);
    this.parentApp = parentApp;
    this.initializeConfig();
  }

  /**
   * Initialize the advancement order configuration from settings or defaults
   */
  initializeConfig() {
    try {
      HM.log(3, 'Initializing advancement order configuration');
      let config = game.settings.get(HM.ID, 'advancementOrder');

      if (!config || !Array.isArray(config) || config.length === 0) {
        HM.log(2, 'No valid configuration found, using defaults');
        config = [
          { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
          { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
          { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
        ];
      } else {
        config = config.map((item) => {
          return {
            ...item,
            sortable: item.sortable !== undefined ? item.sortable : true
          };
        });
      }

      this.config = foundry.utils.deepClone(config);
      HM.log(3, 'Advancement order configuration initialized successfully');
    } catch (error) {
      HM.log(1, 'Error initializing advancement order configuration:', error);
      this.config = [
        { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
        { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
        { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
      ];
    }
  }

  /**
   * Get the current valid advancement order configuration
   * @returns {Array} The current advancement order configuration or default if invalid
   * @static
   */
  static getValidConfiguration() {
    try {
      const config = game.settings.get(HM.ID, 'advancementOrder');
      if (!config || !Array.isArray(config) || config.length === 0) {
        return [
          { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
          { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
          { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
        ];
      }
      return config;
    } catch (error) {
      HM.log(1, 'Error retrieving advancement order configuration, using defaults:', error);
      return [
        { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
        { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
        { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
      ];
    }
  }

  /**
   * Prepare advancement order configuration form data
   * @returns {Array} Array of advancement order configuration objects
   * @private
   */
  _prepareAdvancementOrderFormData() {
    try {
      return this.config.map((item) => {
        return {
          ...item,
          localizedLabel: game.i18n.localize(item.label),
          sortable: item.sortable !== undefined ? item.sortable : true
        };
      });
    } catch (error) {
      HM.log(1, 'Error preparing advancement order form data:', error);
      return [];
    }
  }

  /**
   * Prepare form buttons configuration
   * @returns {Array} Array of button configurations
   * @private
   */
  _prepareFormButtons() {
    return [
      {
        type: 'submit',
        icon: 'fas fa-save',
        label: 'hm.settings.save'
      },
      {
        type: 'button',
        action: 'reset',
        icon: 'fas fa-undo',
        label: 'hm.settings.reset'
      }
    ];
  }

  /** @override */
  _prepareContext(options) {
    const context = super._prepareContext(options);
    try {
      if (!Array.isArray(this.config) || this.config.length === 0) this.initializeConfig();
      return {
        ...context,
        advancementConfig: this._prepareAdvancementOrderFormData(),
        buttons: this._prepareFormButtons()
      };
    } catch (error) {
      HM.log(1, 'Error preparing context:', error);
      return { ...context, advancementConfig: [], buttons: [] };
    }
  }

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.modal = true;
    return options;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.setDraggableAttributes();
    this.setupDragDrop();
  }

  /**
   * Set up drag and drop handlers for advancement reordering
   */
  setupDragDrop() {
    this.options.dragDrop.forEach((dragDropOptions) => {
      dragDropOptions.permissions = {
        dragstart: this.canDragStart.bind(this),
        drop: this.canDragDrop.bind(this)
      };

      dragDropOptions.callbacks = {
        dragstart: this.onDragStart.bind(this),
        dragover: this.onDragOver.bind(this),
        drop: this.onDrop.bind(this)
      };

      const dragDropHandler = new DragDropClass(dragDropOptions);
      dragDropHandler.bind(this.element);
    });
  }

  /**
   * Set draggable attributes on advancement items
   */
  setDraggableAttributes() {
    const items = this.element.querySelectorAll('.advancement-order-item');
    items.forEach((item) => {
      const li = item.closest('li');
      const isSortable = !li.classList.contains('not-sortable');
      item.setAttribute('draggable', isSortable ? 'true' : 'false');
    });
  }

  /**
   * Check if dragging is allowed
   * @param {DragEvent} _event - The drag event
   * @param {string} _selector - The selector for drag targets
   * @returns {boolean} Whether dragging is allowed
   */
  canDragStart(_event, _selector) {
    return true;
  }

  /**
   * Check if dropping is allowed
   * @param {DragEvent} _event - The drag event
   * @param {string} _selector - The selector for drop targets
   * @returns {boolean} Whether dropping is allowed
   */
  canDragDrop(_event, _selector) {
    return true;
  }

  /**
   * Handle drag start event
   * @param {DragEvent} event - The drag event
   * @returns {boolean} Whether drag start was successful
   */
  onDragStart(event) {
    try {
      const li = event.currentTarget.closest('li');
      if (!li || li.classList.contains('not-sortable')) return false;
      const itemIndex = li.dataset.index;
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'advancement-order', index: itemIndex }));
      li.classList.add('dragging');
      return true;
    } catch (error) {
      HM.log(1, 'Error starting drag:', error);
      return false;
    }
  }

  /**
   * Handle drag over event to show drop position
   * @param {DragEvent} event - The drag event
   * @param {string} _selector - The selector for drag targets
   */
  onDragOver(event, _selector) {
    event.preventDefault();
    const list = this.element.querySelector('.advancement-order-list');
    if (!list) return;
    const draggingItem = list.querySelector('.dragging');
    if (!draggingItem) return;
    const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
    if (!items.length) return;
    const targetItem = this.getDragTarget(event, items);
    if (!targetItem) return;
    const rect = targetItem.getBoundingClientRect();
    const dropAfter = event.clientY > rect.top + rect.height / 2;
    this.removeDropPlaceholders();
    this.createDropPlaceholder(targetItem, dropAfter);
  }

  /**
   * Find the target element for dropping
   * @param {DragEvent} event - The drag event
   * @param {Array<HTMLElement>} items - List of potential drop targets
   * @returns {HTMLElement|null} The target element
   */
  getDragTarget(event, items) {
    try {
      return (
        items.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = event.clientY - (box.top + box.height / 2);
          if (closest === null || Math.abs(offset) < Math.abs(closest.offset)) return { element: child, offset: offset };
          else return closest;
        }, null)?.element || null
      );
    } catch (error) {
      HM.log(1, 'Error finding drag target:', error);
      return null;
    }
  }

  /**
   * Handle drop event to reorder advancements
   * @param {DragEvent} event - The drop event
   * @returns {Promise<boolean>} Whether drop was successful
   */
  async onDrop(event) {
    try {
      event.preventDefault();
      const dataString = event.dataTransfer.getData('text/plain');
      if (!dataString) return false;
      const data = JSON.parse(dataString);
      if (!data || data.type !== 'advancement-order') return false;
      const sourceIndex = parseInt(data.index);
      if (isNaN(sourceIndex)) return false;
      const list = this.element.querySelector('.advancement-order-list');
      const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
      const targetItem = this.getDragTarget(event, items);
      if (!targetItem) return false;
      const targetIndex = parseInt(targetItem.dataset.index);
      if (isNaN(targetIndex)) return false;
      const rect = targetItem.getBoundingClientRect();
      const dropAfter = event.clientY > rect.top + rect.height / 2;
      let newIndex = dropAfter ? targetIndex + 1 : targetIndex;
      if (sourceIndex < newIndex) newIndex--;
      const [movedItem] = this.config.splice(sourceIndex, 1);
      this.config.splice(newIndex, 0, movedItem);
      this.updateAdvancementOrder();
      this.render(false);
      return true;
    } catch (error) {
      HM.log(1, 'Error handling drop:', error);
      return false;
    } finally {
      this.cleanupDragElements();
    }
  }

  /**
   * Update advancement order values after reordering
   */
  updateAdvancementOrder() {
    this.config.forEach((item, idx) => {
      item.order = (idx + 1) * 10;
    });
  }

  /**
   * Create a visual placeholder for drop position
   * @param {HTMLElement} targetItem - The target element
   * @param {boolean} dropAfter - Whether to drop after the target
   */
  createDropPlaceholder(targetItem, dropAfter) {
    const placeholder = document.createElement('div');
    placeholder.classList.add('drop-placeholder');
    if (dropAfter) targetItem.after(placeholder);
    else targetItem.before(placeholder);
  }

  /**
   * Remove all drop placeholders
   */
  removeDropPlaceholders() {
    const placeholders = this.element.querySelectorAll('.drop-placeholder');
    placeholders.forEach((el) => el.remove());
  }

  /**
   * Clean up visual elements after dragging
   */
  cleanupDragElements() {
    const draggingItems = this.element.querySelectorAll('.dragging');
    draggingItems.forEach((el) => el.classList.remove('dragging'));
    this.removeDropPlaceholders();
  }

  /**
   * Handle form reset action
   * @param {Event} event - The click event
   * @param {HTMLFormElement} _form - The form element
   * @static
   */
  static handleReset(event, _form) {
    event.preventDefault();
    this.config = [
      { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
      { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
      { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
    ];
    this.render(false);
  }

  /**
   * Process and save advancement order configuration from form submission
   * @param {Event} event - The submit event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @static
   */
  static formHandler(event, form, formData) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const currentConfig = AdvancementOrderConfiguration.getValidConfiguration();

      // Sort by current DOM order
      const sortableAdvancementElements = Array.from(form.querySelectorAll('.advancement-item:not(.not-sortable)'));
      const orderMap = {};
      sortableAdvancementElements.forEach((el, idx) => {
        const itemId = el.dataset.itemId;
        if (itemId) orderMap[itemId] = idx;
      });

      const updatedConfig = currentConfig.map((item) => ({ ...item }));
      updatedConfig.sort((a, b) => {
        const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : a.order;
        const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : b.order;
        return orderA - orderB;
      });

      // Update order values
      updatedConfig.forEach((item, idx) => {
        item.order = (idx + 1) * 10;
      });

      game.settings.set(HM.ID, 'advancementOrder', updatedConfig);
      ui.notifications.info(game.i18n.localize('hm.settings.advancement-order.saved'));

      if (this.parentApp) this.parentApp.render(false);
      return true;
    } catch (error) {
      HM.log(1, 'Error saving advancement order configuration:', error);
      ui.notifications.error(game.i18n.localize('hm.settings.advancement-order.error-saving'));
      return false;
    }
  }
}
