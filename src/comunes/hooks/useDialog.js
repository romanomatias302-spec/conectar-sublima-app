import { useContext } from "react";
import { DialogContext } from "../feedback/DialogContext";

export default function useDialog() {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error(
      "useDialog debe utilizarse dentro de DialogProvider"
    );
  }

  return context;
}