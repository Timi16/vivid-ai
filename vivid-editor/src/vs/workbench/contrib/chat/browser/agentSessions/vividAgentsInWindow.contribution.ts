/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatViewId } from '../chat.js';

/**
 * Opens agent sessions without leaving this window.
 *
 * Upstream binds Shift+Cmd+A to opening the separate Agents window. Vivid runs
 * as one window, so that route is gated off by
 * {@link ChatConfiguration.AgentsWindowEnabled} and the shortcut would
 * otherwise do nothing at all. It lands here instead: the chat view already
 * renders the sessions list beside the conversation, which is the same surface
 * the separate window offered.
 *
 * The keybinding mirrors upstream's two-binding shape. In screen reader mode
 * Shift+Cmd+A collides with a great many screen reader shortcuts, so that case
 * takes an extra Alt exactly as the action it replaces did.
 */
export class OpenAgentSessionsInWindowAction extends Action2 {

	static readonly ID = 'vivid.chat.openAgentSessions';

	constructor() {
		const when = ContextKeyExpr.and(
			ChatContextKeys.enabled,
			IsSessionsWindowContext.negate(),
			IsAuxiliaryWindowContext.negate(),
			// Only claim the shortcut while the separate window is disabled.
			// Someone who turns it back on should get upstream's behaviour
			// rather than a silently shadowed keybinding.
			ContextKeyExpr.notEquals(`config.${ChatConfiguration.AgentsWindowEnabled}`, true),
		);

		super({
			id: OpenAgentSessionsInWindowAction.ID,
			title: localize2('vivid.openAgentSessions', "Open Agent Sessions"),
			category: localize2('vivid.chat.category', "Chat"),
			precondition: ChatContextKeys.enabled,
			f1: true,
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(when, CONTEXT_ACCESSIBILITY_MODE_ENABLED.toNegated()),
			}, {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(when, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const viewsService = accessor.get(IViewsService);

		// The sessions list is a setting on the chat view, and someone may have
		// turned it off. Asking for sessions and getting a bare chat would be
		// the wrong answer, so turn it back on before opening.
		if (configurationService.getValue<boolean>(ChatConfiguration.ChatViewSessionsEnabled) !== true) {
			await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, true);
		}

		await viewsService.openView(ChatViewId, true);
	}
}

registerAction2(OpenAgentSessionsInWindowAction);
