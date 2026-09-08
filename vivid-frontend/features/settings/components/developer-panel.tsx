"use client";

import { useState } from "react";
import { toast } from "sonner";

import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SettingGroup, SettingRow } from "@/features/settings/components/setting-row";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/features/settings/hooks/use-api-keys";
import { copyText } from "@/lib/clipboard";
import type { ApiKeyOut } from "@/lib/backend/client";
import { relativeTime } from "@/lib/format";

function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKeyOut; onRevoke: () => void }) {
  const revoked = apiKey.revoked_at !== null;
  const used = apiKey.last_used_at
    ? `Last used ${relativeTime(new Date(apiKey.last_used_at))}`
    : "Never used";
  return (
    <SettingRow
      label={apiKey.name}
      detail={`${apiKey.prefix}… · Created ${relativeTime(new Date(apiKey.created_at))} · ${used}`}
      control={
        revoked ? (
          <Badge tone="down">Revoked</Badge>
        ) : (
          <Button variant="ghost" size="sm" onClick={onRevoke}>
            Revoke
          </Button>
        )
      }
      className={revoked ? "opacity-55" : undefined}
    />
  );
}

// Settings for people building on Vivid rather than using it: generate a key,
// see what exists, revoke what leaked.
export function DeveloperPanel() {
  const { data: keys, isPending, isError, error, refetch } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();

  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  // The generated secret, held only while its dialog is open. It is never
  // written anywhere else: the server cannot return it a second time.
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyOut | null>(null);

  async function generate() {
    const name = draftName.trim();
    if (!name) return;
    try {
      const created = await create.mutateAsync(name);
      setNaming(false);
      setDraftName("");
      setSecret(created.key);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not generate a key");
    }
  }

  async function copySecret() {
    if (!secret) return;
    toast((await copyText(secret)) ? "Key copied" : "Could not copy. Select it and copy by hand.");
  }

  async function confirmRevoke() {
    const target = revoking;
    setRevoking(null);
    if (!target) return;
    try {
      await revoke.mutateAsync(target.id);
      toast(`${target.name} revoked`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not revoke that key");
    }
  }

  const live = (keys ?? []).filter((key) => key.revoked_at === null).length;

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup>
        <SettingRow
          label="API keys"
          detail="Build on Vivid from your own app. A key works on every endpoint this app uses, and its chats and files stay separate from yours."
          control={
            <Button size="sm" onClick={() => setNaming(true)} disabled={create.isPending}>
              Generate key
            </Button>
          }
        />
      </SettingGroup>

      <SettingGroup title={live ? `Your keys (${live} active)` : "Your keys"}>
        {isPending ? (
          <div className="p-4">
            <AsyncLoading label="Loading your keys" rows={2} />
          </div>
        ) : null}
        {isError ? (
          <div className="p-4">
            <AsyncError error={error} subject="your API keys" onRetry={() => refetch()} />
          </div>
        ) : null}
        {keys && keys.length === 0 ? (
          <p className="text-fg/45 px-4 py-8 text-center text-[13px]">
            No keys yet. Generate one to call Vivid from your own code.
          </p>
        ) : null}
        {(keys ?? []).map((key) => (
          <KeyRow key={key.id} apiKey={key} onRevoke={() => setRevoking(key)} />
        ))}
      </SettingGroup>

      <Modal
        open={naming}
        onOpenChange={(open) => {
          setNaming(open);
          if (!open) setDraftName("");
        }}
        title="Generate an API key"
        description="Name it after where it will run, so you know which one to revoke later."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void generate()}
              disabled={!draftName.trim() || create.isPending}
            >
              {create.isPending ? "Generating…" : "Generate"}
            </Button>
          </>
        }
      >
        <Field htmlFor="api-key-name" label="Name">
          <Input
            id="api-key-name"
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void generate();
            }}
            placeholder="Acme production"
            maxLength={128}
          />
        </Field>
      </Modal>

      <Modal
        open={secret !== null}
        onOpenChange={(open) => {
          if (!open) setSecret(null);
        }}
        title="Copy your key now"
        description="This is the only time it is shown. Vivid stores a hash, so it cannot be recovered later. If you lose it, revoke this key and generate another."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => void copySecret()}>
              Copy
            </Button>
            <Button size="sm" onClick={() => setSecret(null)}>
              Done
            </Button>
          </>
        }
      >
        <code className="vd-glass-control text-fg block rounded-lg px-3 py-2.5 font-mono text-[12.5px] [overflow-wrap:anywhere]">
          {secret}
        </code>
        <p className="text-fg/45 mt-3 text-[12px] leading-relaxed">
          Send it as a bearer token:{" "}
          <span className="text-fg/70 font-mono">
            Authorization: Bearer {secret?.slice(0, 14)}…
          </span>
        </p>
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        tone="danger"
        title={revoking ? `Revoke ${revoking.name}?` : "Revoke this key?"}
        description="Anything using this key stops working on its next request. This cannot be undone."
        confirmLabel="Revoke"
        onConfirm={() => void confirmRevoke()}
      />
    </div>
  );
}
