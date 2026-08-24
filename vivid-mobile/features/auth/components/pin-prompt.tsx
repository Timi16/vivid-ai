import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { setPinPrompt } from "@/features/auth/lib/decane";

// Decane protects its device share behind the hardware keystore. On a device
// without one (a simulator, mostly) it falls back to a PIN, and this is where
// that PIN is asked for. Mounted by the sign-in form; registered as the
// SDK's prompt while mounted.
export function PinPrompt() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<{ resolve: (pin: string) => void; reject: (error: Error) => void } | null>(null);

  useEffect(() => {
    setPinPrompt(
      () =>
        new Promise<string>((resolve, reject) => {
          resolverRef.current = { resolve, reject };
          setPin("");
          setError(null);
          setOpen(true);
        })
    );
    return () => setPinPrompt(null);
  }, []);

  function submit() {
    if (!/^\d{4,8}$/.test(pin)) {
      setError("Use 4 to 8 digits.");
      return;
    }
    setOpen(false);
    resolverRef.current?.resolve(pin);
    resolverRef.current = null;
  }

  function cancel() {
    setOpen(false);
    resolverRef.current?.reject(new Error("Sign-in cancelled"));
    resolverRef.current = null;
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
      }}
      title="Set a PIN"
      description="This device has no secure hardware key, so a PIN protects your sign-in instead. You will need it again on this device."
      footer={
        <>
          <Button variant="ghost" size="sm" label="Cancel" onPress={cancel} />
          <Button size="sm" label="Continue" onPress={submit} />
        </>
      }
    >
      <Field label="PIN" error={error ?? undefined}>
        <Input
          value={pin}
          onChangeText={(value) => {
            setPin(value.replace(/\D/g, "").slice(0, 8));
            if (error) setError(null);
          }}
          keyboardType="number-pad"
          secureTextEntry
          autoFocus
          invalid={Boolean(error)}
          onSubmitEditing={submit}
        />
      </Field>
    </Modal>
  );
}
