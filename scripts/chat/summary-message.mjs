/**
 * @module SummaryMessage
 * @description Generates character summary chat messages for newly created characters.
 */

import { log } from '../utils/logger.mjs';

/**
 * Service for generating character summary chat messages.
 */
export class SummaryMessage {
  /**
   * Generate a formatted HTML message summarizing a newly created character.
   * @param {object} actor - The newly created actor
   * @returns {string} HTML content for the chat message
   */
  static generate(actor) {
    try {
      const characterName = document.querySelector('#character-name')?.value || game.user.name;
      let message = `<div class="character-summary"><h2>${characterName}</h2>`;
      message += this.#buildAbilityScoresTable(actor);
      message += this.#buildInventoryList(actor);
      message += '</div>';
      return message;
    } catch (error) {
      log(1, 'Error generating character summary message:', error);
      const fallbackName = document.querySelector('#character-name')?.value || game.user.name;
      return `<div class="character-summary"><h2>${fallbackName}</h2><p>${game.i18n.localize('hm.app.character-created')}</p></div>`;
    }
  }

  /**
   * Build HTML table showing ability scores and modifiers.
   * @param {object} actor - The actor containing ability data
   * @returns {string} HTML table
   */
  static #buildAbilityScoresTable(actor) {
    if (!actor?.system?.abilities) return '';
    let tableHTML = `
    <div class="ability-scores-summary">
      <h3>${game.i18n.localize('DND5E.AbilityScorePl')}</h3>
      <table class="ability-table">
        <tr>
          <th>${game.i18n.localize('DND5E.Ability')}</th>
          <th>${game.i18n.localize('DND5E.AbilityScoreShort')}</th>
          <th>${game.i18n.localize('DND5E.AbilityModifierShort')}</th>
        </tr>
  `;

    for (const [key] of Object.entries(CONFIG.DND5E.abilities)) {
      const ability = actor.system.abilities[key];
      if (!ability) continue;
      const score = ability.value;
      const mod = ability.mod;
      const label = CONFIG.DND5E.abilities[key]?.label || key;
      const modPrefix = mod >= 0 ? '+' : '';
      tableHTML += `
      <tr>
        <td>${label.toUpperCase()}</td>
        <td>${score}</td>
        <td>${modPrefix}${mod}</td>
      </tr>
    `;
    }
    tableHTML += `
      </table>
    </div>
  `;

    return tableHTML;
  }

  /**
   * Build a comma-separated list of all items and currency.
   * @param {object} actor - The actor containing inventory and currency data
   * @returns {string} HTML inventory summary
   */
  static #buildInventoryList(actor) {
    if (!actor) return '';
    const items = actor.items.filter((item) => !['class', 'subclass', 'race', 'background', 'feat', 'spell'].includes(item.type));
    let inventoryHTML = `<div class="inventory-summary"><h3>${game.i18n.localize('DND5E.StartingEquipment.Title')}</h3>`;
    if (items.length) {
      const itemLinks = items
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => `@UUID[${item.uuid}]`)
        .join(', ');
      inventoryHTML += `<p class="inventory-items">${itemLinks}</p>`;
    } else {
      inventoryHTML += `<p class="inventory-items"> ${game.i18n.localize('hm.app.finalize.summary.no-items')}</p>`;
    }
    const currency = actor.system.currency;
    const hasCurrency = currency && Object.values(currency).some((v) => v > 0);
    if (hasCurrency) {
      inventoryHTML += `<h3>${game.i18n.localize('DND5E.StartingEquipment.Wealth.Label')}</h3><p class="starting-wealth">`;
      const currencyParts = [];
      for (const [coin, amount] of Object.entries(currency)) {
        if (amount > 0) {
          const coinConfig = CONFIG.DND5E.currencies[coin] || {};
          const iconPath = coinConfig.icon || '';
          const iconHtml = iconPath ? `<img src="${iconPath}" width="16" height="16" class="currency-icon">` : '';
          const label = coinConfig.abbreviation || coin;
          currencyParts.push(`${iconHtml}${amount} ${label}`);
        }
      }
      inventoryHTML += currencyParts.join(', ');
      inventoryHTML += '</p>';
    }
    inventoryHTML += '</div>';
    return inventoryHTML;
  }
}
