/**
 * Apply a saved draft to the live form.
 * @param {Object<string, *>} draft Saved field map (key = element `name`, value = field value).
 * @param {HTMLElement} formElement Form root to scope the search.
 * @returns {number} Number of distinct draft keys that mapped to one or more form elements.
 */
export function applyDraft(draft, formElement) {
  if (!draft || typeof draft !== 'object') return 0;
  let applied = 0;
  for (const [name, value] of Object.entries(draft)) {
    const elements = formElement.querySelectorAll(`[name="${CSS.escape(name)}"]`);
    if (elements.length === 0) continue;
    if (elements.length === 1) applySingle(elements[0], value);
    else applyGroup(elements, value);
    applied++;
  }
  ATLAS.log(3, `restore.applyDraft: applied ${applied} field(s)`);
  return applied;
}

/**
 * Apply `value` to a single element, branching on element kind.
 * @param {HTMLElement} elem Target element.
 * @param {*} value Value to apply.
 * @returns {void}
 */
function applySingle(elem, value) {
  const tag = elem.tagName.toLowerCase();
  if (elem.type === 'checkbox') elem.checked = Array.isArray(value) ? value.includes(elem.value) : Boolean(value);
  else if (elem.type === 'radio') elem.checked = String(elem.value) === String(value);
  else if (tag === 'color-picker' || elem.type === 'color') elem.value = value || '#000000';
  else elem.value = value ?? '';
  elem.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Apply `value` (string or array) across a group of elements sharing the same name.
 * @param {HTMLElement[]} elements Elements with shared `name`.
 * @param {*} value Single value or array of values to match against `elem.value`.
 * @returns {void}
 */
function applyGroup(elements, value) {
  const values = (Array.isArray(value) ? value : [value]).map(String);
  elements.forEach((elem) => {
    if (elem.type !== 'checkbox' && elem.type !== 'radio') return;
    elem.checked = values.includes(String(elem.value));
    elem.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
