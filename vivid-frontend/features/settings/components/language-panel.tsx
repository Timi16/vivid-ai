"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CheckIcon, GlobeIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "@/features/settings/lib/data";
import { SettingGroup } from "@/features/settings/components/setting-row";

export function LanguagePanel() {
  const [code, setCode] = useState("en");

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup title="Interface language">
        <div className="flex flex-col p-2">
          {LANGUAGES.map((language) => {
            const on = code === language.code;
            return (
              <button
                key={language.code}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setCode(language.code);
                  if (language.code !== "en") {
                    toast(`${language.name} isn't translated yet`, {
                      description: "The interface stays in English until translations ship.",
                    });
                  }
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[14px] px-3 py-3 text-left transition-colors",
                  on ? "vd-glass-control vd-sheen" : "hover:bg-fg/6"
                )}
              >
                <GlobeIcon size={16} className="text-fg/45 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-fg truncate text-[13.5px] font-semibold">
                    {language.native}
                  </span>
                  <span className="text-fg/45 truncate text-[12px] font-normal">
                    {language.name}
                  </span>
                </span>
                {on ? <CheckIcon size={16} className="text-fg shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </SettingGroup>

      <p className="text-fg/40 text-[12px] leading-relaxed font-normal">
        Answers are written in the language you ask in, whatever the interface is set to.
      </p>
    </div>
  );
}
