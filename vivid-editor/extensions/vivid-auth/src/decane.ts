/*---------------------------------------------------------------------------------------------
 *  Decane Connect — the same identity provider the Vivid web and mobile apps use.
 *
 *  Two flows, both ending in the access token the Vivid backend verifies:
 *    Google — GET /auth/google/init returns a URL; the browser comes back to
 *             our `vivid://` callback carrying `decane_jwt`.
 *    Email  — POST /auth/email/start sends a six digit code, POST
 *             /auth/email/verify exchanges it for the same token.
 *
 *  Deliberately no SDK: Decane's kit is an embedded-wallet kit that would go on
 *  to demand a passkey and a PIN. Vivid only needs the identity, and Decane
 *  hands that over before any wallet step.
 *--------------------------------------------------------------------------------------------*/

export interface DecaneConfig {
	apiBase: string;
	appId: string;
	apiKey: string;
}

export interface DecaneProfile {
	name: string | null;
	email: string | null;
	picture: string | null;
}

export interface DecaneResult {
	jwt: string;
	profile: DecaneProfile;
}

export class DecaneError extends Error { }

function headers(cfg: DecaneConfig): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		'X-API-Key': cfg.apiKey,
		'X-App-Id': cfg.appId,
	};
}

async function post<T>(cfg: DecaneConfig, path: string, body: unknown): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${cfg.apiBase.replace(/\/$/, '')}${path}`, {
			method: 'POST',
			headers: headers(cfg),
			body: JSON.stringify(body),
		});
	} catch {
		throw new DecaneError('Could not reach Vivid sign-in. Check your connection and try again.');
	}
	if (!res.ok) {
		let detail = `Sign-in failed (${res.status})`;
		try {
			const parsed = await res.json() as { error?: { message?: string } };
			if (parsed.error?.message) { detail = parsed.error.message; }
		} catch { /* keep the status message */ }
		throw new DecaneError(detail);
	}
	return (res.status === 204 ? null : await res.json()) as T;
}

/** Where to send the browser for "Continue with Google". */
export async function googleAuthUrl(cfg: DecaneConfig): Promise<string> {
	let res: Response;
	try {
		res = await fetch(`${cfg.apiBase.replace(/\/$/, '')}/auth/google/init`, {
			headers: { 'X-API-Key': cfg.apiKey, 'X-App-Id': cfg.appId },
		});
	} catch {
		throw new DecaneError('Could not reach Vivid sign-in. Check your connection and try again.');
	}
	if (!res.ok) {
		throw new DecaneError(`Google sign-in could not start (${res.status})`);
	}
	const { url } = await res.json() as { url: string };
	if (!url) { throw new DecaneError('Vivid sign-in did not return a Google URL.'); }
	return url;
}

/**
 * Step one of the emailed code. Decane ALWAYS resolves here, whether or not the
 * address is known, so a success tells you nothing about delivery. Codes last
 * ten minutes and are rate limited to three an hour per address — say so in the
 * UI, because a throttled user otherwise waits for a mail that never comes.
 */
export async function startEmailSignIn(cfg: DecaneConfig, email: string): Promise<void> {
	await post(cfg, '/auth/email/start', { email });
}

/** Step two: the code buys the same token the Google callback returns. */
export async function verifyEmailCode(cfg: DecaneConfig, email: string, code: string): Promise<DecaneResult> {
	const result = await post<{ jwt?: string; accessToken?: string; profile?: Partial<DecaneProfile> }>(
		cfg, '/auth/email/verify', { email, code });
	const jwt = result?.jwt ?? result?.accessToken;
	if (!jwt) { throw new DecaneError('That code did not work. Ask for a new one.'); }
	return {
		jwt,
		profile: {
			name: result.profile?.name ?? null,
			// Decane does not echo the address back, and it is the one thing we
			// know for certain: the code only reaches the inbox that owns it.
			email: result.profile?.email ?? email,
			picture: result.profile?.picture ?? null,
		},
	};
}

/** Pull the token and profile off the `vivid://` callback the browser returns to. */
export function readCallback(query: string): DecaneResult | { error: string } | undefined {
	const params = new URLSearchParams(query);
	const error = params.get('decane_error');
	if (error) { return { error }; }
	const jwt = params.get('decane_jwt');
	if (!jwt) { return undefined; }
	return {
		jwt,
		profile: {
			name: params.get('decane_name'),
			email: params.get('decane_email'),
			picture: params.get('decane_picture'),
		},
	};
}

/** Claims we care about. Verification is the backend's job, not ours. */
export function readClaims(jwt: string): { uid?: string; exp?: number } {
	try {
		const body = jwt.split('.')[1];
		const json = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
		return JSON.parse(json);
	} catch {
		return {};
	}
}
