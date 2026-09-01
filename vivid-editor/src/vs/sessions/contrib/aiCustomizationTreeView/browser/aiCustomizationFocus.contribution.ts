/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { AI_CUSTOMIZATION_CATEGORY, FOCUS_AI_CUSTOMIZATION_VIEW_ID } from '../../../../workbench/contrib/chat/browser/aiCustomization/treeView/aiCustomizationTreeView.js';
import { TerminalContextKeys } from '../../../../workbench/contrib/terminal/common/terminalContextKey.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';

/**
 * Focuses the customizations shortcuts inside the sessions sidebar.
 *
 * This stayed behind when the customizations tree moved into `vs/workbench` so
 * both windows could show it. The tree is shared; this action is not — it
 * reaches into {@link SessionsView}, which only exists in the Agents window.
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: FOCUS_AI_CUSTOMIZATION_VIEW_ID,
			title: localize2('focusCustomizations', "Focus Chat Customizations"),
			category: AI_CUSTOMIZATION_CATEGORY,
			precondition: IsSessionsWindowContext,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
				when: ContextKeyExpr.and(IsSessionsWindowContext, TerminalContextKeys.focus.negate()),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const sessionsView = await viewsService.openView<SessionsView>(SessionsViewId, false);
		sessionsView?.focusCustomizations();
	}
});
