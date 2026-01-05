"use client"

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";

// Properly typed wrapper with explicit children prop
type MotionDivProps = HTMLMotionProps<"div"> & {
  children?: React.ReactNode;
}

export const MotionDiv = React.forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => {
  return <motion.div ref={ref} {...props} />;
});

MotionDiv.displayName = "MotionDiv";

export default MotionDiv;