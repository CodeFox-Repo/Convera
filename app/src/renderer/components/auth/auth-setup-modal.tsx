import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { AuthModal } from "./auth-modal";
import { ModelConfigForm } from "./model-config-form";

interface AuthSetupModalProps {
  open: boolean;
  onClose: () => void;
}

type TabType = "login" | "custom-api";

export function AuthSetupModal({ open, onClose }: AuthSetupModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("login");

  if (!open) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="no-drag-region fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="no-drag-region absolute top-6 right-6 p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground z-10"
      >
        <X size={24} />
      </button>

      {/* Fixed Tab Switcher at top - absolute positioned */}
      <div className="no-drag-region absolute top-0 left-0 right-0 flex justify-center px-6 pt-12">
        <div className="relative flex bg-muted/50 rounded-2xl p-1.5 w-full max-w-lg">
          {/* Animated background pill */}
          <motion.div
            layoutId="tab-indicator"
            className="absolute top-1.5 bottom-1.5 rounded-xl bg-card shadow-lg pointer-events-none"
            style={{
              width: "calc(50% - 6px)",
              left: activeTab === "login" ? "6px" : "calc(50%)",
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
          />

          <button
            onClick={() => setActiveTab("login")}
            className={`no-drag-region relative z-10 flex-1 py-3 px-6 text-sm font-medium rounded-xl transition-colors ${
              activeTab === "login"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setActiveTab("custom-api")}
            className={`no-drag-region relative z-10 flex-1 py-3 px-6 text-sm font-medium rounded-xl transition-colors ${
              activeTab === "custom-api"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            Add Model
          </button>
        </div>
      </div>

      {/* Centered Content Area */}
      <div className="no-drag-region w-full px-6 flex justify-center">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {activeTab === "login" && (
              <motion.div
                key="login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full"
              >
                <AuthModal />
              </motion.div>
            )}

            {activeTab === "custom-api" && (
              <motion.div
                key="custom-api"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full"
              >
                <ModelConfigForm onSuccess={onClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
