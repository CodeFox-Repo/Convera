import { toggleTheme } from "@/renderer/libs/helper/theme_helpers";
import { Moon } from "lucide-react";
import React from "react";
import { Button } from "./ui/button";

export default function ToggleTheme() {
  return (
    <Button onClick={toggleTheme} size="icon">
      <Moon size={16} />
    </Button>
  );
}
