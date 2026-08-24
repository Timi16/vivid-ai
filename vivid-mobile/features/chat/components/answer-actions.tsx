import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  CheckIcon,
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
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useTheme } from "@/hooks/use-theme";
import { useCopy } from "@/hooks/use-copy";
import { toast } from "@/lib/toast";

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

// The row under every answer. Everything a session-level flow needs hangs
// off here: rate, copy, share, export, and the overflow menu for the rest.
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
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const { copied, copy } = useCopy();
  const muted = theme.fg(0.6);

  function pick(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
      <IconButton
        label="Good answer"
        size={32}
        variant={rating === "up" ? "control" : "ghost"}
        onPress={() => onRate("up")}
      >
        <ThumbUpIcon size={15} color={rating === "up" ? theme.colors.up : muted} />
      </IconButton>
      <IconButton
        label="Bad answer"
        size={32}
        variant={rating === "down" ? "control" : "ghost"}
        onPress={() => onRate("down")}
      >
        <ThumbDownIcon size={15} color={rating === "down" ? theme.colors.down : muted} />
      </IconButton>
      {copied ? (
        <Button
          variant="ghost"
          size="sm"
          label="Copied"
          icon={<CheckIcon size={15} color={theme.colors.up} />}
          onPress={() => {}}
        />
      ) : (
        <IconButton
          label="Copy answer"
          size={32}
          onPress={async () => {
            if (!(await copy(answer))) toast("Couldn't copy the answer");
          }}
        >
          <CopyIcon size={15} color={muted} />
        </IconButton>
      )}
      <Button
        variant="ghost"
        size="sm"
        label="Share"
        icon={<ShareIcon size={15} color={muted} />}
        onPress={onShare}
      />
      <Button
        variant="ghost"
        size="sm"
        label="Export"
        icon={<DownloadIcon size={15} color={muted} />}
        onPress={onExport}
      />
      <IconButton label="More actions" size={32} onPress={() => setMenuOpen(true)}>
        <MoreIcon size={15} color={muted} />
      </IconButton>

      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuItem
          label="Rename thread"
          icon={<PencilIcon size={16} color={theme.fg(0.8)} />}
          onPress={() => pick(onRename)}
        />
        <MenuItem
          label="Add to a space"
          icon={<FolderPlusIcon size={16} color={theme.fg(0.8)} />}
          onPress={() => pick(onAddToSpace)}
        />
        <MenuSeparator />
        <MenuItem
          label="Report session"
          icon={<FlagIcon size={16} color={theme.fg(0.8)} />}
          onPress={() => pick(onReport)}
        />
        <MenuItem
          label="Delete thread"
          tone="danger"
          icon={<TrashIcon size={16} color={theme.colors.down} />}
          onPress={() => pick(onDelete)}
        />
      </Menu>
    </View>
  );
}
