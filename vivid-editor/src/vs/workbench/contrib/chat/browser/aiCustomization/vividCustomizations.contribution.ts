/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { agentIcon, hookIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon, toolsIcon } from './aiCustomizationIcons.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from './aiCustomizationManagementEditorInput.js';

/**
 * Brings the customizations surface into the main editor window.
 *
 * The management editor itself is registered in `chat.shared.contribution`, so
 * it already exists here. What did not exist was a way to reach it: every
 * caller of {@link AICustomizationManagementEditorInput} lived in `vs/sessions`,
 * which meant MCP servers, skills, agents, instructions, hooks, plugins and
 * tools were only configurable from the Agents window. These actions open the
 * same editor, at the same section, from the main window.
 *
 * Registered from `workbench.common.main` rather than the shared chat
 * contribution: the Agents window already has its own sidebar toolbar for
 * these, and a second entry point there would be a duplicate, not a feature.
 */

const CUSTOMIZATIONS_CATEGORY = localize2('vivid.customizations.category', "Customizations");

/** Submenu on the manage (gear) button, where Settings and Extensions live. */
const CustomizationsSubmenu = new MenuId('VividCustomizations');

/**
 * One entry in the customizations menu. `section` is the page the management
 * editor opens on; the overview has none, because it is the editor's own
 * welcome page rather than a section in its sidebar.
 */
interface ICustomizationEntry {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly section?: AICustomizationManagementSection;
}

/**
 * The order here is the order shown in the menu, and it deliberately matches
 * the Agents window's sidebar so the two surfaces read the same way.
 */
const CUSTOMIZATION_ENTRIES: readonly ICustomizationEntry[] = [
	{ id: 'vivid.customizations.overview', title: localize('vivid.customizations.overview', "Overview"), icon: Codicon.home },
	{ id: 'vivid.customizations.agents', title: localize('vivid.customizations.agents', "Agents"), icon: agentIcon, section: AICustomizationManagementSection.Agents },
	{ id: 'vivid.customizations.skills', title: localize('vivid.customizations.skills', "Skills"), icon: skillIcon, section: AICustomizationManagementSection.Skills },
	{ id: 'vivid.customizations.instructions', title: localize('vivid.customizations.instructions', "Instructions"), icon: instructionsIcon, section: AICustomizationManagementSection.Instructions },
	{ id: 'vivid.customizations.hooks', title: localize('vivid.customizations.hooks', "Hooks"), icon: hookIcon, section: AICustomizationManagementSection.Hooks },
	{ id: 'vivid.customizations.mcpServers', title: localize('vivid.customizations.mcpServers', "MCP Servers"), icon: mcpServerIcon, section: AICustomizationManagementSection.McpServers },
	{ id: 'vivid.customizations.plugins', title: localize('vivid.customizations.plugins', "Plugins"), icon: pluginIcon, section: AICustomizationManagementSection.Plugins },
	{ id: 'vivid.customizations.tools', title: localize('vivid.customizations.tools', "Tools"), icon: toolsIcon, section: AICustomizationManagementSection.Tools },
];

/**
 * Open the management editor and show `section`, or its welcome page when no
 * section is given.
 *
 * Unlike the Agents window's version this sets no active harness session:
 * there is no session in the main window, and the editor treats that as the
 * workspace-wide view, which is the right scope here.
 */
async function openCustomizations(accessor: ServicesAccessor, section: AICustomizationManagementSection | undefined): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const pane = await editorService.openEditor(AICustomizationManagementEditorInput.getOrCreate(), { pinned: true });
	if (!(pane instanceof AICustomizationManagementEditor)) {
		return;
	}
	if (section) {
		pane.selectSectionById(section);
	} else {
		pane.showWelcomePage();
	}
}

for (const [index, entry] of CUSTOMIZATION_ENTRIES.entries()) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: entry.id,
				title: { value: entry.title, original: entry.title },
				category: CUSTOMIZATIONS_CATEGORY,
				icon: entry.icon,
				f1: true,
			});
		}
		override run(accessor: ServicesAccessor): Promise<void> {
			return openCustomizations(accessor, entry.section);
		}
	});

	MenuRegistry.appendMenuItem(CustomizationsSubmenu, {
		command: { id: entry.id, title: entry.title, icon: entry.icon },
		// The overview is the way in for someone who does not yet know which
		// page they want, so it sits above the sections rather than among them.
		group: entry.section ? '2_sections' : '1_overview',
		order: index,
	});
}

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	submenu: CustomizationsSubmenu,
	title: localize('vivid.customizations.menu', "Customizations"),
	icon: Codicon.agent,
	group: '2_configuration',
	order: 1,
});
