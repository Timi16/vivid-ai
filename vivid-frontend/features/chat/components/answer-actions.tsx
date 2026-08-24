"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import {
  CopyIcon,
  DownloadIcon,
  FlagIcon,
  FolderPlusIcon,
  MoreIcon,
  PencilIcon,
  ShareIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

interface AnswerActionsProps {
  answer: string;
  rating: "up" | "down" | null;
  onRate: (rating: "up" | "down") => void;
  onShare: () => void;
  onExport: () => void;
  onRename: () => void;
  onAddToSpace: () => void;
  onReport: () => void;
  onDelete: () => void;
}

// The row under every answer. Everything a session-level flow needs hangs off
// here: rate, copy, share, export, and the overflow menu for the rest.
export function AnswerActions({
  answer,
  rating,
  onRate,
  onShare,
  onExport,
  onRename,
  onAddToSpace,
  onReport,
  onDelete,
}: AnswerActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Good answer"
        aria-pressed={rating === "up"}
        onClick={() => onRate("up")}
        className={cn(rating === "up" && "vd-glass-control text-up")}
      >
        <ThumbUpIcon size={15} />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Bad answer"
        aria-pressed={rating === "down"}
        onClick={() => onRate("down")}
        className={cn(rating === "down" && "vd-glass-control text-down")}
      >
        <ThumbDownIcon size={15} />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy answer"
        onClick={async () => {
          const ok = await copyText(answer);
          toast(ok ? "Answer copied" : "Couldn't copy the answer");
        }}
      >
        <CopyIcon size={15} />
      </Button>

      <Button variant="ghost" size="sm" onClick={onShare}>
        <ShareIcon size={15} />
        Share
      </Button>

      <Button variant="ghost" size="sm" onClick={onExport}>
        <DownloadIcon size={15} />
        Export
      </Button>

      <Menu
        align="end"
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreIcon size={15} />
          </Button>
        }
      >
        <MenuItem onClick={onRename}>
          <PencilIcon size={15} />
          Rename thread
        </MenuItem>
        <MenuItem onClick={onAddToSpace}>
          <FolderPlusIcon size={15} />
          Add to a space
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={onReport}>
          <FlagIcon size={15} />
          Report session
        </MenuItem>
        <MenuItem tone="danger" onClick={onDelete}>
          <TrashIcon size={15} />
          Delete thread
        </MenuItem>
      </Menu>
    </div>
  );
}
