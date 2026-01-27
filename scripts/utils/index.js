/**
 * Get TextEditor class compatible with V12 and V13
 * @returns {object} TextEditor class
 */
export { API } from '../api.js';
export { AdvancementOrderConfiguration } from '../app/AdvancementOrderConfiguration.js';
export { CustomCompendiums } from '../app/CustomCompendiums.js';
export { Customization } from '../app/Customization.js';
export { DiceRolling } from '../app/DiceRolling.js';
export { HeroMancer } from '../app/HeroMancer.js';
export { MandatoryFields } from '../app/MandatoryFields.js';
export { Troubleshooter } from '../app/Troubleshooter.js';
export { SummaryMessage } from '../chat/summary-message.mjs';
export { HM } from '../hero-mancer.js';
export { needsReload, needsRerender, rerenderHM } from '../settings.js';
export { ActorCreationService } from './actorCreationService.js';
export { CharacterApprovalService } from './characterApprovalService.js';
export { CharacterArtPicker } from './characterArtPicker.js';
export { JournalPageEmbed, JournalPageFinder } from './descriptionBuilder.js';
export { DocumentService } from './documentService.js';
export { EquipmentDataService } from './equipment/equipmentDataService.js';
export { EquipmentParser } from './equipment/equipmentParser.js';
export { EquipmentRenderer } from './equipment/equipmentRenderer.js';
export { AndItemRenderer } from './equipment/renderers/andItemRenderer.js';
export { BaseItemRenderer } from './equipment/renderers/baseItemRenderer.js';
export { FocusItemRenderer } from './equipment/renderers/focusItemRenderer.js';
export { LinkedItemRenderer } from './equipment/renderers/linkedItemRenderer.js';
export { OrItemRenderer } from './equipment/renderers/orItemRenderer.js';
export { ToolItemRenderer } from './equipment/renderers/toolItemRenderer.js';
export { EventRegistry } from './event-registry.mjs';
export { FormValidation } from './formValidation.js';
export { HeroMancerUI } from './hero-mancer-ui.mjs';
export { ProgressBar } from './progress.js';
export { CharacterRandomizer } from './randomizer.js';
export { SavedOptions } from './savedOptions.js';
export { StatRoller } from './statRoller.js';
export { TableManager } from './tableManager.js';
