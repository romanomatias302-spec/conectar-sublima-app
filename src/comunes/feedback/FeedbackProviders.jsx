import React from "react";
import { ToastProvider } from "./ToastContext";
import { DialogProvider } from "./DialogContext";
import "./feedback.css";

export default function FeedbackProviders({ children }) {
  return (
    <ToastProvider>
      <DialogProvider>{children}</DialogProvider>
    </ToastProvider>
  );
}