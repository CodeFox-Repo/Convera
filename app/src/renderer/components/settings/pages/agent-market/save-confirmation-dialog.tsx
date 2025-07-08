import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/renderer/components/ui/alert-dialog";
import React from "react";

interface SaveConfirmationDialogProps {
  isOpen: boolean;
  onClose: (shouldSave: boolean) => void;
}

export function SaveConfirmationDialog({
  isOpen,
  onClose,
}: SaveConfirmationDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={() => onClose(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">
            Save Draft?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            You have unsaved changes. Would you like to save your progress as a
            draft before closing?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => onClose(false)}
            className="text-foreground border-border hover:bg-muted hover:text-foreground"
          >
            Don&apos;t Save
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onClose(true)}
            className="text-primary-foreground"
          >
            Save Draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
