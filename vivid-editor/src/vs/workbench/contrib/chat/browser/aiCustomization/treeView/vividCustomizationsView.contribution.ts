/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { registerIcon } from '../../../../../../platform/theme/common/iconRegistry.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from '../../../../../common/views.js';
import { AI_CUSTOMIZATION_VIEW_ID } from './aiCustomizationTreeView.js';
import { AICustomizationViewPane } from './aiCustomizationTreeViewViews.js';

/**
 * Puts the customizations tree — agents, skills, instructions, MCP servers —
 * on the right of the main window, beside chat.
 *
 * The Agents window kept these next to the conversation, which is where they
 * belong: they are what the agent is configured *with*, so you read them while
 * you are talking to it. Reaching them only through a menu meant losing them
 * the moment you looked away.
 *
 * The secondary side bar rather than the primary one is deliberate. The left
 * side is the workspace — files, search, source control — and chat already
 * lives on the right, so this sits beside its subject instead of displacing
 * the explorer.
 */

const VIVID_CUSTOMIZATIONS_CONTAINER_ID = 'workbench.view.vividCustomizations';

const customizationsIcon = registerIcon(
	'vivid-customizations-view-icon',
	Codicon.agent,
	localize('vividCustomizationsIcon', "Icon for the Customizations view in the secondary side bar."),
);

const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: VIVID_CUSTOMIZATIONS_CONTAINER_ID,
	title: localize2('vividCustomizations', "Customizations"),
	icon: customizationsIcon,
	order: 2,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIVID_CUSTOMIZATIONS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: VIVID_CUSTOMIZATIONS_CONTAINER_ID,
	hideIfEmpty: false,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: false });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: AI_CUSTOMIZATION_VIEW_ID,
	name: localize2('vividCustomizations', "Customizations"),
	ctorDescriptor: new SyncDescriptor(AICustomizationViewPane),
	containerIcon: customizationsIcon,
	canToggleVisibility: false,
	canMoveView: true,
	// A chord rather than a plain shortcut: the single-modifier space on the
	// right-hand side is already spoken for by chat, and this is a place you
	// open occasionally, not something you toggle mid-sentence.
	focusCommand: {
		id: 'vivid.customizations.focusView',
		keybindings: {
			primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
		},
	},
}], container);
