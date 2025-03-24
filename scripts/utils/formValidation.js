/**
 * Centralized form validation utilities
 * @class
 */
export class FormValidation {
  /**
   * Checks if a form field contains valid content
   * @param {HTMLElement} element - The form field to check
   * @returns {boolean} Whether the field has valid content
   */
  static isFieldComplete(element) {
    if (!element) return false;

    const type = element?.localName || element?.type || '';
    const value = element?.value;
    const checked = element?.checked;
    const emptyStates = ['', '<p></p>', '<p><br></p>', '<p><br class="ProseMirror-trailingBreak"></p>'];
    const proseMirrorValue = value || '';
    const editorContent = element.querySelector('.editor-content.ProseMirror')?.innerHTML || '';
    const isComplete = !emptyStates.includes(proseMirrorValue) && proseMirrorValue.trim() !== '' && !emptyStates.includes(editorContent) && editorContent.trim() !== '';

    switch (type) {
      case 'checkbox':
        return checked;
      case 'text':
      case 'textarea':
        return value && value.trim() !== '';
      case 'color-picker':
        return value && value !== '#000000';
      case 'select-one':
        return value && value !== '';
      case 'prose-mirror':
        return isComplete;
      default:
        return value && value.trim() !== '';
    }
  }

  /**
   * Checks if an ability score field is complete based on the current roll method
   * @param {HTMLElement} element - The ability input element
   * @param {HTMLElement} abilityBlock - The parent ability block element
   * @returns {boolean} Whether the field is complete
   */
  static isAbilityFieldComplete(element, abilityBlock) {
    if (!abilityBlock) return false;

    // Standard Array - single dropdown
    if (element.classList.contains('ability-dropdown') && !abilityBlock.classList.contains('point-buy')) {
      return element.value && element.value !== '';
    }
    // Point Buy - hidden input with control buttons
    else if (element.type === 'hidden' && abilityBlock.classList.contains('point-buy')) {
      const score = parseInt(element.value);
      return !isNaN(score) && score >= 8;
    } else {
      const dropdown = abilityBlock.querySelector('.ability-dropdown');
      const scoreInput = abilityBlock.querySelector('.ability-score');
      return dropdown?.value && scoreInput?.value && dropdown.value !== '' && scoreInput.value !== '';
    }
  }

  /**
   * Finds the label element associated with a form field
   * @param {HTMLElement} element - The form element to find a label for
   * @returns {HTMLElement|null} The associated label element or null if not found
   */
  static findAssociatedLabel(element) {
    if (element.localName === 'prose-mirror') {
      return element.closest('.notes-section')?.querySelector('h2');
    }

    return element
      .closest('.form-row, .art-selection-row, .customization-row, .ability-block, .form-group, .trait-group, .personality-group, .description-group, .notes-group')
      ?.querySelector('label, span.ability-label');
  }

  /**
   * Adds a visual indicator to show field completion status
   * @param {HTMLElement} labelElement - The label element to modify
   * @param {boolean} [isComplete=false] - Whether the associated field is complete
   */
  static addIndicator(labelElement, isComplete = false) {
    // Remove existing indicator if any
    const existingIcon = labelElement.querySelector('.mandatory-indicator');
    if (existingIcon) {
      // Only remove if the state changed
      const currentIsComplete = existingIcon.classList.contains('fa-circle-check');
      if (currentIsComplete === isComplete) {
        return; // No change needed
      }
      existingIcon.remove();
    }

    // Create new indicator
    const icon = document.createElement('i');
    if (isComplete) {
      icon.className = 'fa-duotone fa-solid fa-circle-check mandatory-indicator complete';
    } else {
      icon.className = 'fa-duotone fa-solid fa-diamond-exclamation mandatory-indicator incomplete';
    }
    labelElement.prepend(icon);
  }
}
