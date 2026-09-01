/*---------------------------------------------------------------------------------------------
 *  The "Vivid" authentication provider.
 *
 *  Registers alongside the built-in GitHub provider rather than replacing it:
 *  GitHub signs you in to GitHub (clone, push, gists), Vivid signs you in to
 *  Vivid (the agent, your plan). They answer different questions.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	DecaneConfig, DecaneError, DecaneResult,
	googleAuthUrl, readCallback, readClaims, startEmailSignIn, verifyEmailCode,
} from './decane';

const PROVIDER_ID = 'vivid';
const PROVIDER_LABEL = 'Vivid';
const SESSIONS_KEY = 'vivid.sessions';

function config(): DecaneConfig {
	// Shipped in product.json so a build can be pointed at another project
	// without touching code. Env vars win, for local development.
	const product = (vscode.env as unknown as { appName?: string });
	void product;
	const fromProduct = (globalThis as unknown as { _VSCODE_PRODUCT_JSON?: { vividAuth?: Partial<DecaneConfig & { decaneApiBase: string; decaneAppId: string; decaneApiKey: string }> } })._VSCODE_PRODUCT_JSON?.vividAuth;
	return {
		apiBase: process.env['VIVID_DECANE_API_BASE'] || fromProduct?.decaneApiBase || 'https://backend.decane.app',
		appId: process.env['VIVID_DECANE_APP_ID'] || fromProduct?.decaneAppId || '',
		apiKey: process.env['VIVID_DECANE_API_KEY'] || fromProduct?.decaneApiKey || '',
	};
}

function configured(cfg: DecaneConfig): boolean {
	return Boolean(cfg.appId && cfg.apiKey && !cfg.appId.startsWith('REPLACE_') && !cfg.apiKey.startsWith('REPLACE_'));
}

class VividAuthProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private readonly _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly disposables: vscode.Disposable[] = [];
	/** Resolves when the browser comes back to vivid://…/auth. */
	private pendingCallback?: (result: DecaneResult | { error: string }) => void;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.disposables.push(
			vscode.window.registerUriHandler({
				handleUri: (uri: vscode.Uri) => {
					const result = readCallback(uri.query);
					if (result && this.pendingCallback) {
						this.pendingCallback(result);
						this.pendingCallback = undefined;
					}
				},
			}),
		);
	}

	async getSessions(_scopes: readonly string[] | undefined): Promise<vscode.AuthenticationSession[]> {
		const stored = await this.context.secrets.get(SESSIONS_KEY);
		if (!stored) { return []; }
		let sessions: vscode.AuthenticationSession[];
		try {
			sessions = JSON.parse(stored) as vscode.AuthenticationSession[];
		} catch {
			await this.context.secrets.delete(SESSIONS_KEY);
			return [];
		}
		// Drop anything already expired rather than handing back a dead token.
		const live = sessions.filter(s => {
			const { exp } = readClaims(s.accessToken);
			return !exp || exp * 1000 > Date.now();
		});
		if (live.length !== sessions.length) {
			await this.store(live);
		}
		return live;
	}

	async createSession(_scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
		const cfg = config();
		if (!configured(cfg)) {
			throw new Error('Vivid sign-in is not configured in this build (vividAuth in product.json).');
		}

		const choice = await vscode.window.showQuickPick(
			[
				{ label: '$(globe) Continue with Google', id: 'google' as const },
				{ label: '$(mail) Email me a code', id: 'email' as const },
			],
			{ title: 'Sign in to Vivid', ignoreFocusOut: true, placeHolder: 'How would you like to sign in?' },
		);
		if (!choice) { throw new Error('Cancelled'); }

		const result = choice.id === 'google'
			? await this.signInWithGoogle(cfg)
			: await this.signInWithEmail(cfg);

		const claims = readClaims(result.jwt);
		const session: vscode.AuthenticationSession = {
			id: claims.uid ?? `vivid-${Date.now()}`,
			accessToken: result.jwt,
			account: {
				id: claims.uid ?? result.profile.email ?? 'vivid',
				label: result.profile.name || result.profile.email || 'Vivid account',
			},
			scopes: [],
		};

		const sessions = (await this.getSessions(undefined)).filter(s => s.id !== session.id);
		sessions.push(session);
		await this.store(sessions);
		this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
		return session;
	}

	private async signInWithGoogle(cfg: DecaneConfig): Promise<DecaneResult> {
		const url = await googleAuthUrl(cfg);
		return vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Signing in to Vivid…', cancellable: true },
			async (_progress, token) => new Promise<DecaneResult>((resolve, reject) => {
				const timer = setTimeout(() => {
					this.pendingCallback = undefined;
					reject(new Error('Sign-in timed out. Try again.'));
				}, 5 * 60 * 1000);

				token.onCancellationRequested(() => {
					clearTimeout(timer);
					this.pendingCallback = undefined;
					reject(new Error('Cancelled'));
				});

				this.pendingCallback = (result) => {
					clearTimeout(timer);
					if ('error' in result) { reject(new Error(`Google sign-in failed: ${result.error}`)); }
					else { resolve(result); }
				};

				void vscode.env.openExternal(vscode.Uri.parse(url));
			}),
		);
	}

	private async signInWithEmail(cfg: DecaneConfig): Promise<DecaneResult> {
		const email = await vscode.window.showInputBox({
			title: 'Sign in to Vivid',
			prompt: 'Where should the code go?',
			placeHolder: 'you@example.com',
			ignoreFocusOut: true,
			validateInput: v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? undefined : 'Enter a valid email address',
		});
		if (!email) { throw new Error('Cancelled'); }
		const address = email.trim().toLowerCase();

		await startEmailSignIn(cfg, address);

		const code = await vscode.window.showInputBox({
			title: 'Sign in to Vivid',
			// Decane always reports success here, so the wording must not promise
			// delivery — and the rate limit is the usual reason nothing arrives.
			prompt: `If ${address} is registered, a six digit code is on its way. Codes last 10 minutes, and you can ask for at most 3 an hour.`,
			placeHolder: '123456',
			ignoreFocusOut: true,
			validateInput: v => /^\d{6}$/.test(v.trim()) ? undefined : 'Enter the six digit code',
		});
		if (!code) { throw new Error('Cancelled'); }

		return verifyEmailCode(cfg, address, code.trim());
	}

	async removeSession(sessionId: string): Promise<void> {
		const sessions = await this.getSessions(undefined);
		const removed = sessions.filter(s => s.id === sessionId);
		await this.store(sessions.filter(s => s.id !== sessionId));
		if (removed.length) {
			this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
		}
	}

	private async store(sessions: vscode.AuthenticationSession[]): Promise<void> {
		await this.context.secrets.store(SESSIONS_KEY, JSON.stringify(sessions));
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
		this.disposables.forEach(d => d.dispose());
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const provider = new VividAuthProvider(context);
	context.subscriptions.push(
		provider,
		vscode.authentication.registerAuthenticationProvider(PROVIDER_ID, PROVIDER_LABEL, provider, { supportsMultipleAccounts: false }),
		vscode.commands.registerCommand('vivid-auth.signIn', async () => {
			try {
				const session = await vscode.authentication.getSession(PROVIDER_ID, [], { createIfNone: true });
				vscode.window.showInformationMessage(`Signed in to Vivid as ${session.account.label}.`);
			} catch (err) {
				const message = err instanceof DecaneError || err instanceof Error ? err.message : String(err);
				if (message !== 'Cancelled') { vscode.window.showErrorMessage(message); }
			}
		}),
		vscode.commands.registerCommand('vivid-auth.signOut', async () => {
			const sessions = await provider.getSessions(undefined);
			if (!sessions.length) {
				vscode.window.showInformationMessage('You are not signed in to Vivid.');
				return;
			}
			await Promise.all(sessions.map(s => provider.removeSession(s.id)));
			vscode.window.showInformationMessage('Signed out of Vivid.');
		}),
	);
}

export function deactivate(): void { }
